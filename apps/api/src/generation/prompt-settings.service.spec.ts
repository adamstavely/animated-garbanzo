import { Repository } from 'typeorm';

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
  let saved: PenNameRequestEntity | null;
  const requests = {
    save: jest.fn(async (entity: PenNameRequestEntity) => {
      saved = entity;
      return entity;
    }),
  } as unknown as Repository<PenNameRequestEntity>;
  const service = new PromptSettingsService(requests, promptBuilder);

  beforeEach(() => {
    saved = null;
    jest.clearAllMocks();
  });

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

  it('persists overrides on the request and clears them when defaults are saved', async () => {
    const entity = request();
    const custom = await service.update(entity, {
      system: 'Custom system.',
      prompt: 'Custom prompt.',
    });

    expect(custom.isCustom).toBe(true);
    expect(saved?.systemOverride).toBe('Custom system.');
    expect(saved?.promptOverride).toBe('Custom prompt.');

    const cleared = await service.update(entity, {
      system: DEFAULT_SYSTEM_INSTRUCTION,
      prompt: promptBuilder.build({
        legalName: entity.legalName,
        presentation: entity.presentation,
        origin: entity.origin,
        notes: entity.notes,
      }),
    });

    expect(cleared.isCustom).toBe(false);
    expect(saved?.systemOverride).toBeNull();
    expect(saved?.promptOverride).toBeNull();
  });

  it('reset clears both overrides on the request', async () => {
    const entity = request({
      systemOverride: 'Custom system.',
      promptOverride: 'Custom prompt.',
    });

    const restored = await service.reset(entity);

    expect(restored.isCustom).toBe(false);
    expect(saved?.systemOverride).toBeNull();
    expect(saved?.promptOverride).toBeNull();
  });
});
