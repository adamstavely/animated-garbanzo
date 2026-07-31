import { RequestStatus } from '@nym/shared';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { AuthenticatedUser } from '../auth/authenticated-user';
import { RateLimiter } from '../common/rate-limiter';
import { AppConfig } from '../config/configuration';
import { CandidateEntity, PenNameRequestEntity } from '../database/entities';
import { GenerationService } from '../generation/generation.service';
import { PromptSettingsService } from '../generation/prompt-settings.service';
import { RequestsService } from './requests.service';

function entity(overrides: Partial<PenNameRequestEntity> = {}): PenNameRequestEntity {
  return {
    id: 'r1',
    legalName: 'Margaret E. Voss',
    presentation: 'Female',
    origin: '',
    notes: '',
    refine: '',
    systemOverride: null,
    promptOverride: null,
    status: RequestStatus.Ready,
    candidates: [
      {
        id: 'c1',
        requestId: 'r1',
        name: 'Bridget C. Ashworth',
        pronunciation: '',
        origin: '',
        locked: false,
        position: 0,
      } as CandidateEntity,
    ],
    chosenName: 'Bridget C. Ashworth',
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
    ...overrides,
  } as PenNameRequestEntity;
}

function buildService(
  request: PenNameRequestEntity,
  updateAffected = 1,
  promptSettings: PromptSettingsService = {
    overrideColumns: () => ({
      promptOverride: 'Custom prompt.',
      systemOverride: 'Custom system.',
    }),
    clearedOverrides: () => ({ promptOverride: null, systemOverride: null }),
    describeFor: () => ({
      prompt: 'Custom prompt.',
      system: 'Custom system.',
      isCustom: true,
    }),
  } as unknown as PromptSettingsService,
  options: { lockRequest?: PenNameRequestEntity | null; candidateUpdateAffected?: number } = {},
) {
  const manager = {
    findOne: jest.fn(() =>
      Promise.resolve(options.lockRequest === undefined ? request : options.lockRequest),
    ),
    update: jest.fn(() =>
      Promise.resolve({ affected: options.candidateUpdateAffected ?? 1 }),
    ),
  };

  const requests = {
    findOne: jest.fn(() => Promise.resolve(request)),
    find: jest.fn(() => Promise.resolve([request])),
    update: jest.fn(() => Promise.resolve({ affected: updateAffected })),
    save: jest.fn(),
    delete: jest.fn(() => Promise.resolve({ affected: updateAffected })),
    create: jest.fn(),
    manager: {
      transaction: jest.fn(async (work: (m: typeof manager) => Promise<void>) => work(manager)),
    },
  } as unknown as Repository<PenNameRequestEntity>;

  const candidates = {
    findOne: jest.fn(),
    save: jest.fn(),
  } as unknown as Repository<CandidateEntity>;

  const configService = {
    get: (key: keyof AppConfig) => {
      if (key === 'requests') {
        return { listDefaultLimit: 50, listMaxLimit: 100, approveAllLimit: 50 };
      }
      if (key === 'rateLimit') {
        return {
          windowMs: 60_000,
          list: 120,
          create: 30,
          generate: 30,
          approveAll: 5,
        };
      }
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;

  const service = new RequestsService(
    requests,
    candidates,
    {} as GenerationService,
    promptSettings,
    { consume: jest.fn(() => Promise.resolve()) } as unknown as RateLimiter,
    configService,
  );

  return { service, requests, candidates, manager };
}

const user = { id: 'u1', name: 'Ada' } as AuthenticatedUser;

describe('RequestsService concurrency', () => {
  it('updates with WHERE status = expected so a generate claim cannot be overwritten', async () => {
    const request = entity({ status: RequestStatus.Ready });
    const { service, requests } = buildService(request);

    await service.update('r1', { notes: 'prefer softer names' });

    expect(requests.update).toHaveBeenCalledWith(
      { id: 'r1', status: RequestStatus.Ready },
      { notes: 'prefer softer names' },
    );
    expect(requests.save).not.toHaveBeenCalled();
  });

  it('refuses choose, brief, lock, and prompt changes on Approved until reopen', async () => {
    const request = entity({ status: RequestStatus.Approved });
    const { service, requests, candidates } = buildService(request);

    await expect(
      service.chooseCandidate('r1', { penName: 'Bridget C. Ashworth' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(service.update('r1', { notes: 'quiet edit' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await expect(service.toggleLock('r1', 'c1', { locked: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await expect(
      service.updatePromptSettings('r1', {
        system: 'Custom system.',
        prompt: 'Custom prompt.',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(service.resetPromptSettings('r1')).rejects.toBeInstanceOf(BadRequestException);

    expect(requests.update).not.toHaveBeenCalled();
    expect(requests.manager.transaction).not.toHaveBeenCalled();
    expect(candidates.save).not.toHaveBeenCalled();
  });

  it('locks under a status-gated row lock so a generate claim cannot race the toggle', async () => {
    const request = entity({ status: RequestStatus.Ready });
    const { service, manager, candidates } = buildService(request);

    await service.toggleLock('r1', 'c1', { locked: true });

    expect(manager.findOne).toHaveBeenCalledWith(PenNameRequestEntity, {
      where: { id: 'r1', status: RequestStatus.Ready },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.update).toHaveBeenCalledWith(
      CandidateEntity,
      { id: 'c1', requestId: 'r1' },
      { locked: true },
    );
    expect(candidates.save).not.toHaveBeenCalled();
  });

  it('refuses toggleLock when a generate claim won the race', async () => {
    const request = entity({ status: RequestStatus.Ready });
    const { service, manager, candidates } = buildService(request, 1, undefined, {
      lockRequest: null,
    });

    await expect(service.toggleLock('r1', 'c1', { locked: true })).rejects.toThrow(
      /changed while you were working/i,
    );
    expect(manager.update).not.toHaveBeenCalled();
    expect(candidates.save).not.toHaveBeenCalled();
  });

  it('uses a generic conflict message when status no longer matches', async () => {
    const request = entity({ status: RequestStatus.Ready });
    const { service } = buildService(request, 0);

    await expect(service.approve('r1', {}, user)).rejects.toThrow(
      /changed while you were working/i,
    );
  });

  it('keeps the generating-specific message when status is already Generating', async () => {
    const request = entity({ status: RequestStatus.Generating });
    const { service } = buildService(request);

    await expect(service.update('r1', { notes: 'quiet edit' })).rejects.toThrow(/still generating/i);
  });

  it('refuses choose and approve when the name overlaps the current legal name', async () => {
    const request = entity({
      status: RequestStatus.Ready,
      legalName: 'Bridget A. Voss',
    });
    const { service, requests } = buildService(request);

    await expect(
      service.chooseCandidate('r1', { penName: 'Bridget C. Ashworth' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.approve('r1', { penName: 'Bridget C. Ashworth' }, user),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(requests.update).not.toHaveBeenCalled();
  });

  it('skips bulk-approve rows whose proposed name overlaps the legal name', async () => {
    const clear = entity({
      id: 'r1',
      status: RequestStatus.Ready,
      legalName: 'Margaret E. Voss',
    });
    const overlapping = entity({
      id: 'r2',
      status: RequestStatus.Ready,
      legalName: 'Bridget A. Voss',
    });
    const { service, requests } = buildService(clear);
    (requests.find as jest.Mock).mockResolvedValue([clear, overlapping]);

    const result = await service.approveAll(user);

    expect(result.approvedCount).toBe(1);
    expect(result.requests.map((row) => row.id)).toEqual(['r1']);
    expect(requests.update).toHaveBeenCalledTimes(1);
    expect(requests.update).toHaveBeenCalledWith(
      { id: 'r1', status: RequestStatus.Ready },
      expect.objectContaining({ approvedName: 'Bridget C. Ashworth' }),
    );
  });

  it('refuses choose/approve/reopen when status no longer matches', async () => {
    const request = entity({ status: RequestStatus.Ready });
    const { service, requests } = buildService(request, 0);

    await expect(
      service.chooseCandidate('r1', { penName: 'Bridget C. Ashworth' }),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(service.approve('r1', {}, user)).rejects.toBeInstanceOf(ConflictException);

    request.status = RequestStatus.Approved;
    await expect(service.reopen('r1')).rejects.toBeInstanceOf(ConflictException);

    expect(requests.save).not.toHaveBeenCalled();
  });

  it('approves with a status-conditional UPDATE, not a full-row save', async () => {
    const request = entity({ status: RequestStatus.Ready });
    const { service, requests } = buildService(request);

    await service.approve('r1', { penName: 'Bridget C. Ashworth' }, user);

    expect(requests.update).toHaveBeenCalledWith(
      { id: 'r1', status: RequestStatus.Ready },
      expect.objectContaining({
        approvedName: 'Bridget C. Ashworth',
        status: RequestStatus.Approved,
      }),
    );
    expect(requests.save).not.toHaveBeenCalled();
  });

  it('deletes with WHERE status = expected so a generate claim cannot CASCADE-delete mid-flight', async () => {
    const request = entity({ status: RequestStatus.Ready });
    const { service, requests } = buildService(request);

    await service.remove('r1');

    expect(requests.delete).toHaveBeenCalledWith({
      id: 'r1',
      status: RequestStatus.Ready,
    });
  });

  it('refuses delete while Generating or when a generate claim won the race', async () => {
    const generating = entity({ status: RequestStatus.Generating });
    const { service: busy, requests: busyRepo } = buildService(generating);

    await expect(busy.remove('r1')).rejects.toBeInstanceOf(ConflictException);
    expect(busyRepo.delete).not.toHaveBeenCalled();

    const raced = entity({ status: RequestStatus.Ready });
    const { service, requests } = buildService(raced, 0);

    await expect(service.remove('r1')).rejects.toBeInstanceOf(ConflictException);
    expect(requests.delete).toHaveBeenCalledWith({
      id: 'r1',
      status: RequestStatus.Ready,
    });
  });

  it('updates prompt overrides with WHERE status = expected, not entity.save()', async () => {
    const request = entity({ status: RequestStatus.Ready });
    const { service, requests } = buildService(request);

    await service.updatePromptSettings('r1', {
      system: 'Custom system.',
      prompt: 'Custom prompt.',
    });

    expect(requests.update).toHaveBeenCalledWith(
      { id: 'r1', status: RequestStatus.Ready },
      { promptOverride: 'Custom prompt.', systemOverride: 'Custom system.' },
    );
    expect(requests.save).not.toHaveBeenCalled();
  });

  it('resets prompt overrides with WHERE status = expected, not entity.save()', async () => {
    const request = entity({
      status: RequestStatus.Ready,
      promptOverride: 'Custom prompt.',
      systemOverride: 'Custom system.',
    });
    const { service, requests } = buildService(request);

    await service.resetPromptSettings('r1');

    expect(requests.update).toHaveBeenCalledWith(
      { id: 'r1', status: RequestStatus.Ready },
      { promptOverride: null, systemOverride: null },
    );
    expect(requests.save).not.toHaveBeenCalled();
  });

  it('refuses prompt update/reset when a generate claim won the race', async () => {
    const request = entity({ status: RequestStatus.Ready });
    const { service, requests } = buildService(request, 0);

    await expect(
      service.updatePromptSettings('r1', {
        system: 'Custom system.',
        prompt: 'Custom prompt.',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(service.resetPromptSettings('r1')).rejects.toBeInstanceOf(ConflictException);
    expect(requests.save).not.toHaveBeenCalled();
  });

  it('refuses prompt update/reset while Generating', async () => {
    const request = entity({ status: RequestStatus.Generating });
    const { service, requests } = buildService(request);

    await expect(
      service.updatePromptSettings('r1', {
        system: 'Custom system.',
        prompt: 'Custom prompt.',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(service.resetPromptSettings('r1')).rejects.toBeInstanceOf(ConflictException);
    expect(requests.update).not.toHaveBeenCalled();
  });


  it('refuses approve when the request is not Ready', async () => {
    for (const status of [RequestStatus.Failed, RequestStatus.Approved, RequestStatus.Queued]) {
      const request = entity({ status });
      const { service, requests } = buildService(request);

      await expect(service.approve('r1', {}, user)).rejects.toBeInstanceOf(BadRequestException);
      expect(requests.update).not.toHaveBeenCalled();
    }
  });

  it('refuses reopen unless the request is Approved', async () => {
    for (const status of [RequestStatus.Failed, RequestStatus.Ready, RequestStatus.Queued]) {
      const request = entity({ status });
      const { service, requests } = buildService(request);

      await expect(service.reopen('r1')).rejects.toBeInstanceOf(BadRequestException);
      expect(requests.update).not.toHaveBeenCalled();
    }
  });

  it('reopens Approved back to Ready when candidates remain', async () => {
    const request = entity({
      status: RequestStatus.Approved,
      approvedName: 'Bridget C. Ashworth',
      approvedByName: 'Ada',
      approvedById: 'u1',
      approvedAt: new Date(),
    });
    const { service, requests } = buildService(request);

    await service.reopen('r1');

    expect(requests.update).toHaveBeenCalledWith(
      { id: 'r1', status: RequestStatus.Approved },
      expect.objectContaining({
        approvedName: '',
        approvedByName: '',
        approvedById: null,
        approvedAt: null,
        status: RequestStatus.Ready,
      }),
    );
  });

  it('skips bulk-approve rows that lost a race with generate', async () => {
    const ready = entity({ id: 'r1', status: RequestStatus.Ready });
    const raced = entity({ id: 'r2', status: RequestStatus.Ready });
    const { service, requests } = buildService(ready);

    (requests.find as jest.Mock).mockResolvedValue([ready, raced]);
    (requests.update as jest.Mock)
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });

    const result = await service.approveAll(user);

    expect(result.approvedCount).toBe(1);
    expect(result.requests).toHaveLength(1);
  });

  it('refuses generate on approved requests so History stays sealed', async () => {
    const request = entity({
      status: RequestStatus.Approved,
      approvedName: 'Bridget C. Ashworth',
    });
    const generation = { start: jest.fn() } as unknown as GenerationService;
    const requests = {
      findOne: jest.fn(() => Promise.resolve(request)),
      find: jest.fn(),
      update: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    } as unknown as Repository<PenNameRequestEntity>;

    const configService = {
      get: (key: keyof AppConfig) => {
        if (key === 'requests') {
          return { listDefaultLimit: 50, listMaxLimit: 100, approveAllLimit: 50 };
        }
        if (key === 'rateLimit') {
          return {
            windowMs: 60_000,
            list: 120,
            create: 30,
            generate: 30,
            approveAll: 5,
          };
        }
        return undefined;
      },
    } as unknown as ConfigService<AppConfig, true>;

    const service = new RequestsService(
      requests,
      { findOne: jest.fn(), save: jest.fn() } as unknown as Repository<CandidateEntity>,
      generation,
      {} as PromptSettingsService,
      { consume: jest.fn(() => Promise.resolve()) } as unknown as RateLimiter,
      configService,
    );

    await expect(service.generate('r1', {}, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(generation.start).not.toHaveBeenCalled();
  });
});
