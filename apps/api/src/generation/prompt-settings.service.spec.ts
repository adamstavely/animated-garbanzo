import { PenNameRequestEntity } from '../database/entities';
import { DEFAULT_SYSTEM_INSTRUCTION, PromptBuilderService } from './prompt-builder.service';
import { PromptSettingsService } from './prompt-settings.service';

function request(overrides: Partial<PenNameRequestEntity> = {}): PenNameRequestEntity {
  return {
    id: 'r1',
    legalName: 'Margaret E. Voss',
    presentation: 'Female',
    origin: 'Anglo-Irish',
    notes: 'Literary historical fiction.',
    refine: '',
    systemOverride: null,
    promptOverride: null,
    ...overrides,
  } as PenNameRequestEntity;
}

describe('PromptSettingsService', () => {
  const promptBuilder = new PromptBuilderService();
  const service = new PromptSettingsService(promptBuilder);

  it('describes the brief-composed prompt when no override is set', () => {
    const described = service.describeFor(request());

    expect(described.isCustom).toBe(false);
    expect(described.system).toBe(DEFAULT_SYSTEM_INSTRUCTION);
    expect(described.prompt).toContain('Author legal name: Margaret E. Voss');
  });

  it('resolves overrides from the request row only', () => {
    const entity = request({
      systemOverride: 'Custom system.',
      promptOverride: 'Custom prompt.',
    });

    expect(service.resolveSystemInstruction(entity)).toBe('Custom system.');
    expect(service.resolvePrompt(entity)).toBe('Custom prompt.');
    expect(service.describeFor(entity).isCustom).toBe(true);
  });

  it('computes overrides and clears them when defaults are saved', () => {
    const entity = request();
    const custom = service.overrideColumns(entity, {
      system: 'Custom system.',
      prompt: 'Custom prompt.',
    });

    expect(custom).toEqual({
      systemOverride: 'Custom system.',
      promptOverride: 'Custom prompt.',
    });

    const cleared = service.overrideColumns(entity, {
      system: DEFAULT_SYSTEM_INSTRUCTION,
      prompt: promptBuilder.build({
        legalName: entity.legalName,
        presentation: entity.presentation,
        origin: entity.origin,
        notes: entity.notes,
      }),
    });

    expect(cleared).toEqual({ systemOverride: null, promptOverride: null });
  });

  it('clearedOverrides nulls both columns', () => {
    expect(service.clearedOverrides()).toEqual({
      systemOverride: null,
      promptOverride: null,
    });
  });
});
