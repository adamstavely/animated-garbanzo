import { CheckId, PenNameRequestDto, RequestStatus } from '@nym/shared';

import { canApproveRequest } from './can-approve';

function request(over: Partial<PenNameRequestDto> = {}): PenNameRequestDto {
  return {
    id: 'r1',
    legalName: 'Margaret E. Voss',
    presentation: 'Female',
    origin: '',
    notes: '',
    refine: '',
    status: RequestStatus.Ready,
    candidates: [],
    chosenName: '',
    approvedName: '',
    approvedByName: '',
    approvedAt: null,
    requestedAt: '2026-07-30T09:14:00.000Z',
    discardedCount: 0,
    errorMessage: '',
    proposedName: 'Bridget C. Ashworth',
    checks: [
      {
        id: CheckId.Overlap,
        passLabel: 'No name overlap',
        failLabel: 'Overlaps legal name',
        unknownLabel: 'Overlap unchecked',
        outcome: 'passed',
      },
    ],
    ...over,
  };
}

describe('canApproveRequest', () => {
  it('allows Ready rows with a proposed name that clears overlap', () => {
    expect(canApproveRequest(request())).toBe(true);
  });

  it('refuses when status is not Ready', () => {
    expect(canApproveRequest(request({ status: RequestStatus.Queued }))).toBe(false);
  });

  it('refuses when there is no proposed name', () => {
    expect(canApproveRequest(request({ proposedName: '' }))).toBe(false);
  });

  it('refuses when live overlap has failed', () => {
    expect(
      canApproveRequest(
        request({
          checks: [
            {
              id: CheckId.Overlap,
              passLabel: 'No name overlap',
              failLabel: 'Overlaps legal name',
              unknownLabel: 'Overlap unchecked',
              outcome: 'failed',
            },
          ],
        }),
      ),
    ).toBe(false);
  });
});
