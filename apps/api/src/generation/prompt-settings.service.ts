import { PromptSettingsDto, UpdatePromptSettingsPayload } from '@nym/shared';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PROMPT_SETTINGS_ID, PromptSettingsEntity } from '../database/entities';
import { PenNameRequestEntity } from '../database/entities';
import { DEFAULT_SYSTEM_INSTRUCTION, PromptBuilderService } from './prompt-builder.service';

/**
 * Reads and writes the in-app prompt overrides.
 *
 * An override is only stored when it actually differs from the default: saving
 * text identical to the auto-composed prompt clears the override instead, which
 * is what makes "Reset to default" and an unedited save behave the same way.
 */
@Injectable()
export class PromptSettingsService {
  constructor(
    @InjectRepository(PromptSettingsEntity)
    private readonly repository: Repository<PromptSettingsEntity>,
    private readonly promptBuilder: PromptBuilderService,
  ) {}

  /** Loads the singleton row, creating it on first use. */
  async load(): Promise<PromptSettingsEntity> {
    const existing = await this.repository.findOne({ where: { id: PROMPT_SETTINGS_ID } });
    if (existing) {
      return existing;
    }
    return this.repository.save(
      this.repository.create({
        id: PROMPT_SETTINGS_ID,
        systemOverride: null,
        promptOverride: null,
      }),
    );
  }

  /** The system instruction to send: the override, else the built-in default. */
  async resolveSystemInstruction(): Promise<string> {
    const settings = await this.load();
    return settings.systemOverride ?? DEFAULT_SYSTEM_INSTRUCTION;
  }

  /** The prompt to send: the verbatim override, else one composed from the brief. */
  async resolvePrompt(
    request: PenNameRequestEntity,
    options: { refine?: string; lockedNames?: readonly string[] } = {},
  ): Promise<string> {
    const settings = await this.load();
    if (settings.promptOverride) {
      return settings.promptOverride;
    }
    return this.composeFor(request, options);
  }

  /** What the prompt panel shows for a request: override if set, else the composition. */
  async describeFor(request: PenNameRequestEntity): Promise<PromptSettingsDto> {
    const settings = await this.load();
    return {
      system: settings.systemOverride ?? DEFAULT_SYSTEM_INSTRUCTION,
      prompt: settings.promptOverride ?? this.composeFor(request),
      isCustom: Boolean(settings.promptOverride ?? settings.systemOverride),
    };
  }

  async update(
    request: PenNameRequestEntity,
    payload: UpdatePromptSettingsPayload,
    userId: string | null,
  ): Promise<PromptSettingsDto> {
    const settings = await this.load();
    const defaultPrompt = this.composeFor(request);

    settings.promptOverride =
      payload.prompt.trim() === defaultPrompt.trim() ? null : payload.prompt.trim() || null;
    settings.systemOverride =
      payload.system.trim() === DEFAULT_SYSTEM_INSTRUCTION.trim()
        ? null
        : payload.system.trim() || null;
    settings.updatedById = userId;

    await this.repository.save(settings);
    return this.describeFor(request);
  }

  /** Clears both overrides and returns the restored defaults. */
  async reset(request: PenNameRequestEntity, userId: string | null): Promise<PromptSettingsDto> {
    const settings = await this.load();
    settings.promptOverride = null;
    settings.systemOverride = null;
    settings.updatedById = userId;
    await this.repository.save(settings);
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
