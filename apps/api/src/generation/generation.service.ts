import { RequestStatus } from '@nym/shared';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Not, Repository } from 'typeorm';

import { AppConfig } from '../config/configuration';
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

const USER_FACING_FAILURE = 'Generation failed — try again.';
const STALE_FAILURE = 'Generation timed out — try again.';
const RECLAIM_INTERVAL_MS = 60_000;

/**
 * Orchestrates a generation run: compose prompt → call the model → screen →
 * persist. Runs are started in the background because a model call takes tens of
 * seconds; the row shows "Generating…" and the client polls until it settles.
 */
@Injectable()
export class GenerationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GenerationService.name);
  private readonly staleMs: number;
  /** In-flight run tokens so a superseded or reclaimed run cannot overwrite a newer claim. */
  private readonly activeRuns = new Map<string, symbol>();
  private reclaimTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    @InjectRepository(PenNameRequestEntity)
    private readonly requests: Repository<PenNameRequestEntity>,
    @InjectRepository(CandidateEntity)
    private readonly candidates: Repository<CandidateEntity>,
    @Inject(NAME_GENERATOR)
    private readonly generator: NameGenerator,
    private readonly promptSettings: PromptSettingsService,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.staleMs = configService.get('generation', { infer: true }).staleMs;
  }

  onModuleInit(): void {
    this.reclaimTimer = setInterval(() => {
      void this.reclaimStale().catch((error: unknown) => {
        this.logger.warn(
          `Failed to reclaim stale generations: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      });
    }, RECLAIM_INTERVAL_MS);
    this.reclaimTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.reclaimTimer) {
      clearInterval(this.reclaimTimer);
    }
  }

  /**
   * Marks a request as generating and starts the run.
   *
   * The claim is a single UPDATE … WHERE status <> generating so two API
   * instances cannot both start Anthropic runs for the same row. Stale
   * generating rows are reclaimed first so a dead worker cannot block retries.
   */
  async start(
    request: PenNameRequestEntity,
    options: GenerationOptions = {},
  ): Promise<GenerationHandle> {
    await this.reclaimStale();

    const refine = options.refine ?? request.refine ?? '';
    const runId = Symbol(request.id);

    const claimed = await this.requests.update(
      { id: request.id, status: Not(RequestStatus.Generating) },
      {
        status: RequestStatus.Generating,
        errorMessage: '',
        refine,
      },
    );

    if (!claimed.affected) {
      throw new ConflictException('This request is already generating.');
    }

    this.activeRuns.set(request.id, runId);

    const marked = await this.requireRequest(request.id);
    const completion = this.execute(marked, { ...options, refine }, runId).catch(
      (error: unknown) => {
        // execute() records its own failures; this guards against an unexpected throw
        // escaping into an unhandled rejection.
        this.logger.error(
          `Unhandled generation failure for ${request.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      },
    );

    return { request: marked, completion };
  }

  /**
   * Fails any row that has been generating longer than the stale window — typically
   * after a process restart mid-run.
   */
  async reclaimStale(): Promise<number> {
    const cutoff = new Date(Date.now() - this.staleMs);
    const stale = await this.requests.find({
      where: { status: RequestStatus.Generating, updatedAt: LessThan(cutoff) },
      select: { id: true },
    });

    if (stale.length === 0) {
      return 0;
    }

    for (const row of stale) {
      this.activeRuns.delete(row.id);
    }

    const result = await this.requests.update(
      { status: RequestStatus.Generating, updatedAt: LessThan(cutoff) },
      { status: RequestStatus.Failed, errorMessage: STALE_FAILURE },
    );

    if (result.affected) {
      this.logger.warn(`Reclaimed ${result.affected} stale generating request(s)`);
    }

    return result.affected ?? 0;
  }

  /** Runs a generation to completion and persists the outcome. */
  private async execute(
    request: PenNameRequestEntity,
    options: GenerationOptions,
    runId: symbol,
  ): Promise<void> {
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
      if (!this.isCurrentRun(request.id, runId)) {
        return;
      }

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
          runId,
        );
        return;
      }

      await this.persist(
        request,
        {
          kept,
          replaced: existing.filter((candidate) => !kept.includes(candidate)),
          accepted,
          discarded,
          regenerate,
        },
        runId,
      );
    } catch (error) {
      this.logger.warn(
        `Generation failed for request ${request.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      await this.fail(request.id, USER_FACING_FAILURE, request.discardedCount, runId);
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
    runId: symbol,
  ): Promise<void> {
    if (!this.isCurrentRun(request.id, runId)) {
      return;
    }

    await this.requests.manager.transaction(async (manager) => {
      if (!this.isCurrentRun(request.id, runId)) {
        return;
      }

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
      const updated = await manager.update(
        PenNameRequestEntity,
        { id: request.id, status: RequestStatus.Generating },
        {
          status: RequestStatus.Ready,
          errorMessage: '',
          discardedCount: input.regenerate
            ? request.discardedCount + input.discarded
            : input.discarded,
          // A fresh list invalidates the selection; a regeneration keeps it only if
          // the chosen name was locked and therefore survived.
          chosenName: keptNames.has(request.chosenName) ? request.chosenName : '',
        },
      );

      if (updated.affected) {
        this.activeRuns.delete(request.id);
      }
    });
  }

  private async fail(
    id: string,
    message: string,
    discardedCount: number,
    runId: symbol,
  ): Promise<void> {
    if (!this.isCurrentRun(id, runId)) {
      return;
    }

    const updated = await this.requests.update(
      { id, status: RequestStatus.Generating },
      {
        status: RequestStatus.Failed,
        errorMessage: message,
        discardedCount,
      },
    );

    if (updated.affected) {
      this.activeRuns.delete(id);
    }
  }

  private isCurrentRun(requestId: string, runId: symbol): boolean {
    return this.activeRuns.get(requestId) === runId;
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
