import { CheckId, RequestStatus } from '@nym/shared';

import { CandidateEntity, PenNameRequestEntity } from '../database/entities';
import { buildChecks, resolveProposedName, toRequestDto } from './request.mapper';

function candidate(name: string, position: number, locked = false): CandidateEntity {
  return {
    id: `c-${position}`,
    requestId: 'r1',
    name,
    pronunciation: '',
    origin: '',
    locked,
    position,
  } as CandidateEntity;
}

function request(over: Partial<PenNameRequestEntity> = {}): PenNameRequestEntity {
  return {
    id: 'r1',
    legalName: 'Margaret E. Voss',
    presentation: 'Female',
    origin: 'Anglo-Irish',
    notes: '',
    refine: '',
    systemOverride: null,
    promptOverride: null,
    status: RequestStatus.Ready,
    candidates: [candidate('Bridget C. ASHWORTH', 0), candidate('Nella P. QUINTRELL', 1)],
    chosenName: '',
    approvedName: '',
    approvedByName: '',
    approvedById: null,
    approvedBy: null,
    approvedAt: null,
    discardedCount: 4,
    errorMessage: '',
    generationRunId: null,
    createdById: null,
    createdBy: null,
    createdAt: new Date('2026-07-30T09:14:00Z'),
    updatedAt: new Date('2026-07-30T09:14:00Z'),
    ...over,
  } as PenNameRequestEntity;
}

describe('resolveProposedName', () => {
  it('prefers the approved name', () => {
    expect(
      resolveProposedName(
        request({ approvedName: 'Ash T. FENNIMORE', chosenName: 'Nella P. QUINTRELL' }),
      ),
    ).toBe('Ash T. FENNIMORE');
  });

  it('falls back to the selected name, then to the first candidate', () => {
    expect(resolveProposedName(request({ chosenName: 'Nella P. QUINTRELL' }))).toBe(
      'Nella P. QUINTRELL',
    );
    expect(resolveProposedName(request())).toBe('Bridget C. ASHWORTH');
  });

  it('respects candidate order rather than insertion order', () => {
    const shuffled = request({
      candidates: [candidate('Second', 1), candidate('First', 0)],
    });

    expect(resolveProposedName(shuffled)).toBe('First');
  });

  it('is empty when nothing has been generated', () => {
    expect(resolveProposedName(request({ candidates: [] }))).toBe('');
  });
});

describe('buildChecks', () => {
  it('reports overlap as passed or failed and the rest as unknown', () => {
    const checks = buildChecks(request(), 'Bridget C. ASHWORTH');

    expect(checks.map((check) => check.id)).toEqual([
      CheckId.Overlap,
      CheckId.PriorUse,
      CheckId.Famous,
      CheckId.Offensive,
    ]);
    expect(checks[0]).toMatchObject({ id: CheckId.Overlap, outcome: 'passed' });
    expect(checks.slice(1).every((check) => check.outcome === 'unknown')).toBe(true);
  });

  it('fails the overlap check live when the legal name has since changed', () => {
    // An assistant edited the brief to a name the approved pen name now collides with.
    const checks = buildChecks(request({ legalName: 'Bridget A. Voss' }), 'Bridget C. ASHWORTH');

    expect(checks[0]).toMatchObject({ id: CheckId.Overlap, outcome: 'failed' });
  });

  it('reports nothing while a request is still generating or queued', () => {
    expect(
      buildChecks(request({ status: RequestStatus.Generating }), 'Bridget C. ASHWORTH'),
    ).toEqual([]);
    expect(buildChecks(request({ status: RequestStatus.Queued }), '')).toEqual([]);
    expect(buildChecks(request({ status: RequestStatus.Failed }), 'Bridget C. ASHWORTH')).toEqual(
      [],
    );
  });
});

describe('toRequestDto', () => {
  it('maps the entity onto the wire contract', () => {
    const dto = toRequestDto(request());

    expect(dto).toMatchObject({
      id: 'r1',
      legalName: 'Margaret E. Voss',
      presentation: 'Female',
      status: RequestStatus.Ready,
      proposedName: 'Bridget C. ASHWORTH',
      discardedCount: 4,
      approvedAt: null,
    });
    expect(dto.requestedAt).toBe('2026-07-30T09:14:00.000Z');
    expect(dto.candidates).toHaveLength(2);
    expect(dto.checks).toHaveLength(4);
  });

  it('serialises the approval stamp when there is one', () => {
    const dto = toRequestDto(
      request({
        status: RequestStatus.Approved,
        approvedName: 'Bridget C. ASHWORTH',
        approvedByName: 'Rosa Marchetti',
        approvedAt: new Date('2026-07-30T10:00:00Z'),
      }),
    );

    expect(dto.approvedAt).toBe('2026-07-30T10:00:00.000Z');
    expect(dto.approvedByName).toBe('Rosa Marchetti');
  });

  it('survives a request loaded without its candidates relation', () => {
    const dto = toRequestDto(request({ candidates: undefined as unknown as CandidateEntity[] }));

    expect(dto.candidates).toEqual([]);
    expect(dto.proposedName).toBe('');
  });
});
