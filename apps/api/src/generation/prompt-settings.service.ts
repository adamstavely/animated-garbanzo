import { PromptSettingsDto, UpdatePromptSettingsPayload } from '@nym/shared';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PenNameRequestEntity } from '../database/entities';
import { DEFAULT_SYSTEM_INSTRUCTION, PromptBuilderService } from './prompt-builder.service';

/**
 * Reads and writes per-request prompt overrides.
 *
 * An override is only stored when it actually differs from the default: saving
 * text identical to the auto-composed prompt clears the override instead, which
 * is what makes "Reset to default" and an unedited save behave the same way.
 * Overrides live on the request row so one edit cannot rewrite every generation.
 */
@Injectable()
export class PromptSettingsService {
  constructor(
    @InjectRepository(PenNameRequestEntity)
    private readonly requests: Repository<PenNameRequestEntity>,
    private readonly promptBuilder: PromptBuilderService,
  ) {}

  /** The system instruction to send: the request override, else the built-in default. */
  resolveSystemInstruction(request: PenNameRequestEntity): string {
    return request.systemOverride ?? DEFAULT_SYSTEM_INSTRUCTION;
  }

  /** The prompt to send: the verbatim override, else one composed from the brief. */
  resolvePrompt(
    request: PenNameRequestEntity,
    options: { refine?: string; lockedNames?: readonly string[] } = {},
  ): string {
    if (request.promptOverride) {
      return request.promptOverride;
    }
    return this.composeFor(request, options);
  }

  /** What the prompt panel shows for a request: override if set, else the composition. */
  describeFor(request: PenNameRequestEntity): PromptSettingsDto {
    return {
      system: request.systemOverride ?? DEFAULT_SYSTEM_INSTRUCTION,
      prompt: request.promptOverride ?? this.composeFor(request),
      isCustom: Boolean(request.promptOverride ?? request.systemOverride),
    };
  }

  async update(
    request: PenNameRequestEntity,
    payload: UpdatePromptSettingsPayload,
  ): Promise<PromptSettingsDto> {
    const defaultPrompt = this.composeFor(request);

    request.promptOverride =
      payload.prompt.trim() === defaultPrompt.trim() ? null : payload.prompt.trim() || null;
    request.systemOverride =
      payload.system.trim() === DEFAULT_SYSTEM_INSTRUCTION.trim()
        ? null
        : payload.system.trim() || null;

    await this.requests.save(request);
    return this.describeFor(request);
  }

  /** Clears both overrides and returns the restored defaults. */
  async reset(request: PenNameRequestEntity): Promise<PromptSettingsDto> {
    request.promptOverride = null;
    request.systemOverride = null;
    await this.requests.save(request);
    return this.describeFor(request);
  }

  private composeFor(
    request: PenNameRequestEntity,
    options: { refine?: string; lockedNames?: readonly string[] } = {},
  ): string {
    return this.promptBuilder.build(
      {
        legalName: request.legalName,
        presentation: request.presentation,
        origin: request.origin,
        notes: request.notes,
      },
      options,
    );
  }
}
