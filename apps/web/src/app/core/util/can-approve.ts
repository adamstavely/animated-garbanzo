import { CheckId, PenNameRequestDto, RequestStatus } from '@nym/shared';

/**
 * True when a queue row (or bulk approve) may sign off this request.
 *
 * Ready + a proposed name is not enough: live overlap can fail after a
 * legal-name edit while status stays Ready. The Checks column and API already
 * refuse those rows — the bulk count must match.
 */
export function canApproveRequest(request: PenNameRequestDto): boolean {
  if (request.status !== RequestStatus.Ready || !request.proposedName) {
    return false;
  }
  return request.checks.every(
    (check) => check.id !== CheckId.Overlap || check.outcome !== 'failed',
  );
}
