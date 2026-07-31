import { RequestStatus } from '@nym/shared';
import { ConflictException } from '@nestjs/common';
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

function buildService(request: PenNameRequestEntity, updateAffected = 1) {
  const requests = {
    findOne: jest.fn(() => Promise.resolve(request)),
    find: jest.fn(() => Promise.resolve([request])),
    update: jest.fn(() => Promise.resolve({ affected: updateAffected })),
    save: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
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
    {} as PromptSettingsService,
    { consume: jest.fn(() => Promise.resolve()) } as unknown as RateLimiter,
    configService,
  );

  return { service, requests };
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
    expect(requests.save).not.toHaveBeenCalled();
  });
});
