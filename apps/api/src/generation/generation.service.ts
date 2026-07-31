import { RequestStatus } from '@nym/shared';
import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CandidateEntity, PenNameRequestEntity } from '../database/entities';
import { NAME_GENERATOR, NameGenerator } from './name-generator.interface';
import { MAX_KEPT_CANDIDATES } from './prompt-builder.service';
import { PromptSettingsService } from './prompt-settings.service';
import { RejectionReason, screenCandidates } from './name-rules';

export interface GenerationOptions {
  /** True keeps locked candidates and replaces the rest. */
  regenerate?: boolean;
  /** Steer for this pass only; persisted on the request so the field keeps its value. */
  refine?: string;
}

export interface GenerationHandle {
  /** The request as it looks immediately after being marked as generating. */
  request: PenNameRequestEntity;
  /** Resolves when the background run has finished and its outcome is persisted. */
  completion: Promise<void>;
}

/**
 * Orchestrates a generation run: compose prompt → call the model → screen →
 * persist. Runs are started in the background because a model call takes tens of
 * seconds; the row shows "Generating…" and the client polls until it settles.
 */
@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    @InjectRepository(PenNameRequestEntity)
    private readonly requests: Repository<PenNameRequestEntity>,
    @InjectRepository(CandidateEntity)
    private readonly candidates: Repository<CandidateEntity>,
    @Inject(NAME_GENERATOR)
    private readonly generator: NameGenerator,
    private readonly promptSettings: PromptSettingsService,
  ) {}

  /**
   * Marks a request as generating and starts the run.
   *
   * Rejects a second concurrent run for the same request: two runs would race on
   * the candidate list and the discard tally.
   */
  async start(
    request: PenNameRequestEntity,
    options: GenerationOptions = {},
  ): Promise<GenerationHandle> {
    if (request.status === RequestStatus.Generating) {
      throw new ConflictException('This request is already generating.');
    }

    const refine = options.refine ?? request.refine ?? '';

    await this.requests.update(request.id, {
      status: RequestStatus.Generating,
      errorMessage: '',
      refine,
    });

    const marked = await this.requireRequest(request.id);
    const completion = this.execute(marked, { ...options, refine }).catch((error: unknown) => {
      // execute() records its own failures; this guards against an unexpected throw
      // escaping into an unhandled rejection.
      this.logger.error(
        `Unhandled generation failure for ${request.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    });

    return { request: marked, completion };
  }

  /** Runs a generation to completion and persists the outcome. */
  private async execute(request: PenNameRequestEntity, options: GenerationOptions): Promise<void> {
    const regenerate = options.regenerate === true;
    const existing = await this.candidates.find({
      where: { requestId: request.id },
      order: { position: 'ASC' },
    });
    const kept = regenerate ? existing.filter((candidate) => candidate.locked) : [];
    const keptNames = kept.map((candidate) => candidate.name);

    try {
      const [system, prompt] = await Promise.all([
        this.promptSettings.resolveSystemInstruction(),
        this.promptSettings.resolvePrompt(request, {
          refine: regenerate ? options.refine : undefined,
          lockedNames: keptNames,
        }),
      ]);

      const raw = await this.generator.generate({ system, prompt });
      const { accepted, rejected } = screenCandidates(raw, {
        legalName: request.legalName,
        reservedNames: keptNames,
        limit: Math.max(0, MAX_KEPT_CANDIDATES - kept.length),
      });

      const discarded = rejected.filter(
        (rejection) => rejection.reason !== RejectionReason.Duplicate,
      ).length;

      if (accepted.length === 0 && kept.length === 0) {
        await this.fail(
          request.id,
          'Every candidate was filtered out. Regenerate or loosen the notes.',
          regenerate ? request.discardedCount + discarded : discarded,
        );
        return;
      }

      await this.persist(request, {
        kept,
        replaced: existing.filter((candidate) => !kept.includes(candidate)),
        accepted,
        discarded,
        regenerate,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? `Generation failed — ${error.message}`
          : 'Generation failed — try again.';
      this.logger.warn(`Generation failed for request ${request.id}: ${message}`);
      await this.fail(request.id, message, request.discardedCount);
    }
  }

  private async persist(
    request: PenNameRequestEntity,
    input: {
      kept: CandidateEntity[];
      replaced: CandidateEntity[];
      accepted: { name: string; pronunciation: string; origin: string }[];
      discarded: number;
      regenerate: boolean;
    },
  ): Promise<void> {
    await this.requests.manager.transaction(async (manager) => {
      if (input.replaced.length > 0) {
        await manager.remove(input.replaced);
      }

      input.kept.forEach((candidate, index) => {
        candidate.position = index;
      });
      if (input.kept.length > 0) {
        await manager.save(input.kept);
      }

      const fresh = input.accepted.map((candidate, index) =>
        manager.create(CandidateEntity, {
          requestId: request.id,
          name: candidate.name,
          pronunciation: candidate.pronunciation,
          origin: candidate.origin,
          locked: false,
          position: input.kept.length + index,
        }),
      );
      if (fresh.length > 0) {
        await manager.save(fresh);
      }

      const keptNames = new Set(input.kept.map((candidate) => candidate.name));
      await manager.update(PenNameRequestEntity, request.id, {
        status: RequestStatus.Ready,
        errorMessage: '',
        discardedCount: input.regenerate
          ? request.discardedCount + input.discarded
          : input.discarded,
        // A fresh list invalidates the selection; a regeneration keeps it only if
        // the chosen name was locked and therefore survived.
        chosenName: keptNames.has(request.chosenName) ? request.chosenName : '',
      });
    });
  }

  private async fail(id: string, message: string, discardedCount: number): Promise<void> {
    await this.requests.update(id, {
      status: RequestStatus.Failed,
      errorMessage: message,
      discardedCount,
    });
  }

  private async requireRequest(id: string): Promise<PenNameRequestEntity> {
    const request = await this.requests.findOne({
      where: { id },
      relations: { candidates: true },
    });
    if (!request) {
      throw new ConflictException('The request disappeared before generation could start.');
    }
    return request;
  }
}
