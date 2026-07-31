import { PromptSettingsDto, UpdatePromptSettingsPayload } from '@nym/shared';
import { Injectable } from '@nestjs/common';

import { PenNameRequestEntity } from '../database/entities';
import { DEFAULT_SYSTEM_INSTRUCTION, PromptBuilderService } from './prompt-builder.service';

export type PromptOverrideColumns = {
  promptOverride: string | null;
  systemOverride: string | null;
};

/**
 * Reads and derives per-request prompt overrides.
 *
 * An override is only stored when it actually differs from the default: saving
 * text identical to the auto-composed prompt clears the override instead, which
 * is what makes "Reset to default" and an unedited save behave the same way.
 * Overrides live on the request row so one edit cannot rewrite every generation.
 *
 * Persistence is the caller's job (status-conditional UPDATE) so a stale Ready
 * snapshot cannot clobber a concurrent Generating claim via entity.save().
 */
@Injectable()
export class PromptSettingsService {
  constructor(private readonly promptBuilder: PromptBuilderService) {}

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

  /** Columns to persist for a prompt-panel save (null = use composition / default). */
  overrideColumns(
    request: PenNameRequestEntity,
    payload: UpdatePromptSettingsPayload,
  ): PromptOverrideColumns {
    const defaultPrompt = this.composeFor(request);

    return {
      promptOverride:
        payload.prompt.trim() === defaultPrompt.trim() ? null : payload.prompt.trim() || null,
      systemOverride:
        payload.system.trim() === DEFAULT_SYSTEM_INSTRUCTION.trim()
          ? null
          : payload.system.trim() || null,
    };
  }

  /** Columns that clear both overrides. */
  clearedOverrides(): PromptOverrideColumns {
    return { promptOverride: null, systemOverride: null };
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
