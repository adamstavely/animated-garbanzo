import { RequestStatus } from '@nym/shared';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { AppConfig } from '../config/configuration';
import { CandidateEntity, PenNameRequestEntity } from '../database/entities';
import { GenerationService } from './generation.service';
import { NameGenerator } from './name-generator.interface';
import { PromptSettingsService } from './prompt-settings.service';
import { RawCandidate } from './name-rules';

/**
 * A transaction manager stub that records what would have been written, so the
 * orchestration can be asserted without a database.
 */
interface Written {
  removed: CandidateEntity[];
  saved: CandidateEntity[][];
  updates: Partial<PenNameRequestEntity>[];
}

function buildHarness(options: {
  request?: Partial<PenNameRequestEntity>;
  existing?: CandidateEntity[];
  generated?: RawCandidate[];
  generatorError?: Error;
}) {
  const request: PenNameRequestEntity = {
    id: 'r1',
    legalName: 'Margaret E. Voss',
    presentation: 'Female',
    origin: '',
    notes: '',
    refine: '',
    systemOverride: null,
    promptOverride: null,
    status: RequestStatus.Queued,
    candidates: [],
    chosenName: '',
    approvedName: '',
    approvedByName: '',
    approvedById: null,
    approvedAt: null,
    discardedCount: 0,
    errorMessage: '',
    generationRunId: null,
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...options.request,
  } as PenNameRequestEntity;

  const written: Written = { removed: [], saved: [], updates: [] };

  function applyGeneratingPredicate(criteria: {
    status?: unknown;
    generationRunId?: string | null;
  }): boolean {
    if (criteria.status === RequestStatus.Generating) {
      if (request.status !== RequestStatus.Generating) {
        return false;
      }
      if (
        'generationRunId' in criteria &&
        criteria.generationRunId !== undefined &&
        criteria.generationRunId !== request.generationRunId
      ) {
        return false;
      }
    }
    return true;
  }

  const manager = {
    remove: jest.fn((rows: CandidateEntity[]) => {
      written.removed.push(...rows);
      return Promise.resolve(rows);
    }),
    save: jest.fn((rows: CandidateEntity[]) => {
      written.saved.push(rows);
      return Promise.resolve(rows);
    }),
    create: jest.fn(
      (_entity: unknown, values: Partial<CandidateEntity>) => values as CandidateEntity,
    ),
    update: jest.fn(
      (
        _entity: unknown,
        criteria: string | { id: string; status?: unknown; generationRunId?: string | null },
        values: Partial<PenNameRequestEntity>,
      ) => {
        if (typeof criteria === 'object' && !applyGeneratingPredicate(criteria)) {
          return Promise.resolve({ affected: 0 });
        }
        Object.assign(request, values);
        written.updates.push(values);
        return Promise.resolve({ affected: 1 });
      },
    ),
  };

  const requests = {
    update: jest.fn(
      (
        criteria:
          | string
          | {
              id?: string;
              status?: unknown;
              updatedAt?: unknown;
              generationRunId?: string | null;
            },
        values: Partial<PenNameRequestEntity>,
      ) => {
        // Atomic claim: UPDATE … WHERE status <> generating (TypeORM `Not`).
        if (
          typeof criteria === 'object' &&
          'status' in criteria &&
          criteria.status !== RequestStatus.Generating &&
          !('updatedAt' in criteria)
        ) {
          if (request.status === RequestStatus.Generating) {
            return Promise.resolve({ affected: 0 });
          }
          Object.assign(request, values);
          written.updates.push(values);
          return Promise.resolve({ affected: 1 });
        }

        if (typeof criteria === 'object' && !applyGeneratingPredicate(criteria)) {
          return Promise.resolve({ affected: 0 });
        }

        Object.assign(request, values);
        written.updates.push(values);
        return Promise.resolve({ affected: 1 });
      },
    ),
    findOne: jest.fn(() => Promise.resolve(request)),
    find: jest.fn(() => Promise.resolve([])),
    manager: {
      transaction: jest.fn((work: (m: typeof manager) => Promise<void>) => work(manager)),
    },
  } as unknown as Repository<PenNameRequestEntity>;

  const candidates = {
    find: jest.fn(() => Promise.resolve(options.existing ?? [])),
  } as unknown as Repository<CandidateEntity>;

  const generator: NameGenerator = {
    generate: jest.fn(() =>
      options.generatorError
        ? Promise.reject(options.generatorError)
        : Promise.resolve(options.generated ?? []),
    ),
  };

  const promptSettings = {
    resolveSystemInstruction: jest.fn(() => 'system'),
    resolvePrompt: jest.fn(() => 'prompt'),
  } as unknown as PromptSettingsService;

  const configService = {
    get: (key: keyof AppConfig) => {
      if (key === 'generation') {
        return { staleMs: 150_000 };
      }
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;

  const service = new GenerationService(
    requests,
    candidates,
    generator,
    promptSettings,
    configService,
  );

  return { service, request, written, generator, promptSettings, requests };
}

function candidateEntity(name: string, position: number, locked = false): CandidateEntity {
  return {
    id: `c${position}`,
    requestId: 'r1',
    name,
    pronunciation: '',
    origin: '',
    locked,
    position,
  } as CandidateEntity;
}

describe('GenerationService', () => {
  it('marks the request as generating before the model is called', async () => {
    const { service, request, written } = buildHarness({
      generated: [{ name: 'Bridget C. Ashworth' }],
    });

    const handle = await service.start(request);

    expect(written.updates[0]).toMatchObject({
      status: RequestStatus.Generating,
      errorMessage: '',
      generationRunId: expect.any(String),
    });
    await handle.completion;
  });

  it('refuses to start a second run while one is in flight', async () => {
    const { service, request } = buildHarness({ request: { status: RequestStatus.Generating } });

    await expect(service.start(request)).rejects.toBeInstanceOf(ConflictException);
  });

  it('claims the row with a status predicate so overlapping starts cannot both proceed', async () => {
    const { service, request, requests } = buildHarness({
      generated: [{ name: 'Bridget C. Ashworth' }],
    });

    await (await service.start(request)).completion;

    expect(requests.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r1', status: expect.anything() }),
      expect.objectContaining({
        status: RequestStatus.Generating,
        generationRunId: expect.any(String),
      }),
    );
  });

  it('does not let a superseded run overwrite a newer claim', async () => {
    let releaseGenerate!: () => void;
    const generateGate = new Promise<void>((resolve) => {
      releaseGenerate = resolve;
    });

    const { service, request, written, generator } = buildHarness({
      generated: [{ name: 'Bridget C. Ashworth' }],
    });

    (generator.generate as jest.Mock).mockImplementation(async () => {
      await generateGate;
      return [{ name: 'Bridget C. Ashworth' }];
    });

    const handle = await service.start(request);
    const staleRunId = request.generationRunId;
    expect(staleRunId).toEqual(expect.any(String));

    // Simulate reclaim + claim on another instance: durable token rotates while
    // this worker is still mid-model-call (in-process map still holds the old id).
    request.status = RequestStatus.Generating;
    request.generationRunId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    (service as unknown as { activeRuns: Map<string, string> }).activeRuns.set(
      request.id,
      staleRunId!,
    );

    releaseGenerate();
    await handle.completion;

    expect(written.removed).toEqual([]);
    expect(written.saved).toEqual([]);
    expect(written.updates.some((update) => update.status === RequestStatus.Ready)).toBe(false);
    expect(request.status).toBe(RequestStatus.Generating);
    expect(request.generationRunId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('clears the durable run token when reclaiming stale rows', async () => {
    const stale = new Date(Date.now() - 200_000);
    const { service, request, requests } = buildHarness({
      request: {
        status: RequestStatus.Generating,
        generationRunId: '11111111-2222-3333-4444-555555555555',
        updatedAt: stale,
      },
    });

    (requests.find as jest.Mock).mockResolvedValue([{ id: request.id }]);

    await expect(service.reclaimStale()).resolves.toBe(1);

    expect(requests.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: RequestStatus.Generating }),
      expect.objectContaining({
        status: RequestStatus.Failed,
        generationRunId: null,
      }),
    );
    expect(request.generationRunId).toBeNull();
  });

  it('stores cleared candidates and counts what screening discarded', async () => {
    const { service, request, written } = buildHarness({
      generated: [
        { name: 'Bridget C. Ashworth' },
        { name: 'Margaret T. Bland' }, // overlaps the legal name
        { name: 'Nella Quintrell' }, // no middle initial
        { name: 'Ash T. Fennimore', priorUse: true }, // flagged by the model
      ],
    });

    await (
      await service.start(request)
    ).completion;

    const saved = written.saved.flat();
    expect(saved.map((candidate) => candidate.name)).toEqual(['Bridget C. ASHWORTH']);

    const final = written.updates.at(-1);
    expect(final).toMatchObject({ status: RequestStatus.Ready, discardedCount: 3 });
  });

  it('keeps locked candidates and replaces the rest on a regeneration', async () => {
    const locked = candidateEntity('Bridget C. ASHWORTH', 0, true);
    const loose = candidateEntity('Nella P. QUINTRELL', 1);

    const { service, request, written, promptSettings } = buildHarness({
      request: { status: RequestStatus.Ready, discardedCount: 2 },
      existing: [locked, loose],
      generated: [{ name: 'Iris D. Haldane' }],
    });

    await (
      await service.start(request, { regenerate: true, refine: 'shorter surnames' })
    ).completion;

    expect(written.removed).toEqual([loose]);
    expect(promptSettings.resolvePrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        refine: 'shorter surnames',
        lockedNames: ['Bridget C. ASHWORTH'],
      }),
    );
    // The discard tally accumulates across passes rather than resetting.
    expect(written.updates.at(-1)).toMatchObject({ discardedCount: 2 });
  });

  it('drops a fresh list entirely when the run is not a regeneration', async () => {
    const existing = [candidateEntity('Bridget C. ASHWORTH', 0, true)];

    const { service, request, written } = buildHarness({
      request: { status: RequestStatus.Ready },
      existing,
      generated: [{ name: 'Iris D. Haldane' }],
    });

    await (
      await service.start(request, { regenerate: false })
    ).completion;

    expect(written.removed).toEqual(existing);
  });

  it('clears the selection unless the chosen name survived as a locked candidate', async () => {
    const locked = candidateEntity('Bridget C. ASHWORTH', 0, true);

    const kept = buildHarness({
      request: { status: RequestStatus.Ready, chosenName: 'Bridget C. ASHWORTH' },
      existing: [locked],
      generated: [{ name: 'Iris D. Haldane' }],
    });
    await (
      await kept.service.start(kept.request, { regenerate: true })
    ).completion;
    expect(kept.written.updates.at(-1)).toMatchObject({ chosenName: 'Bridget C. ASHWORTH' });

    const dropped = buildHarness({
      request: { status: RequestStatus.Ready, chosenName: 'Nella P. QUINTRELL' },
      existing: [locked],
      generated: [{ name: 'Iris D. Haldane' }],
    });
    await (
      await dropped.service.start(dropped.request, { regenerate: true })
    ).completion;
    expect(dropped.written.updates.at(-1)).toMatchObject({ chosenName: '' });
  });

  it('fails the request when screening removes everything', async () => {
    const { service, request, written } = buildHarness({
      generated: [{ name: 'Margaret T. Bland' }],
    });

    await (
      await service.start(request)
    ).completion;

    expect(written.updates.at(-1)).toMatchObject({
      status: RequestStatus.Failed,
      errorMessage: 'Every candidate was filtered out. Regenerate or loosen the notes.',
      discardedCount: 1,
    });
  });

  it('records a fixed user-facing reason when the model call fails', async () => {
    const upstream = 'upstream Anthropic detail that must not leak';
    const { service, request, written } = buildHarness({
      generatorError: new Error(upstream),
    });

    await (
      await service.start(request)
    ).completion;

    const failure = written.updates.at(-1);
    expect(failure).toMatchObject({
      status: RequestStatus.Failed,
      errorMessage: 'Generation failed — try again.',
    });
    expect(failure?.errorMessage).not.toContain(upstream);
  });

  it('never leaves a failed run as an unhandled rejection', async () => {
    const { service, request } = buildHarness({ generatorError: new Error('boom') });

    await expect((await service.start(request)).completion).resolves.toBeUndefined();
  });
});
