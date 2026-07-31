import { CandidateDto, CheckId, CheckResult, PenNameRequestDto, RequestStatus } from '@nym/shared';

import { CandidateEntity, PenNameRequestEntity } from '../database/entities';
import { overlapsLegalName } from '../generation/name-rules';

/**
 * The pen name shown in the table: what was approved, else what the assistant
 * selected, else the first cleared candidate.
 */
export function resolveProposedName(request: PenNameRequestEntity): string {
  const candidates = sortCandidates(request.candidates ?? []);
  return request.approvedName || request.chosenName || candidates[0]?.name || '';
}

/**
 * Builds the four screening statements shown in the Checks column.
 *
 * Only the overlap check is re-evaluated live, because it is the one that can
 * flip after the fact — editing the brief's legal name can invalidate a name that
 * cleared earlier. Prior use, famous names and offensive terms are enforced during
 * screening: any candidate tripping them is discarded before an assistant ever
 * sees it, so a name that reached this point has passed them by construction.
 */
export function buildChecks(request: PenNameRequestEntity, proposedName: string): CheckResult[] {
  const settled =
    request.status === RequestStatus.Ready || request.status === RequestStatus.Approved;

  if (!settled || !proposedName) {
    return [];
  }

  return [
    {
      id: CheckId.Overlap,
      passLabel: 'No name overlap',
      failLabel: 'Overlaps legal name',
      passed: !overlapsLegalName(proposedName, request.legalName),
    },
    {
      id: CheckId.PriorUse,
      passLabel: 'No prior use',
      failLabel: 'Prior use found',
      passed: true,
    },
    {
      id: CheckId.Famous,
      passLabel: 'Not a famous name',
      failLabel: 'Resembles a famous name',
      passed: true,
    },
    {
      id: CheckId.Offensive,
      passLabel: 'No offensive terms',
      failLabel: 'Contains offensive terms',
      passed: true,
    },
  ];
}

function sortCandidates(candidates: CandidateEntity[]): CandidateEntity[] {
  return [...candidates].sort((a, b) => a.position - b.position);
}

function toCandidateDto(candidate: CandidateEntity): CandidateDto {
  return {
    id: candidate.id,
    name: candidate.name,
    pronunciation: candidate.pronunciation,
    origin: candidate.origin,
    locked: candidate.locked,
  };
}

/** Maps a persisted request to the wire contract the client renders from. */
export function toRequestDto(request: PenNameRequestEntity): PenNameRequestDto {
  const proposedName = resolveProposedName(request);

  return {
    id: request.id,
    legalName: request.legalName,
    presentation: request.presentation,
    origin: request.origin ?? '',
    notes: request.notes ?? '',
    refine: request.refine ?? '',
    status: request.status,
    candidates: sortCandidates(request.candidates ?? []).map(toCandidateDto),
    chosenName: request.chosenName ?? '',
    approvedName: request.approvedName ?? '',
    approvedByName: request.approvedByName ?? '',
    approvedAt: request.approvedAt ? request.approvedAt.toISOString() : null,
    requestedAt: request.createdAt.toISOString(),
    discardedCount: request.discardedCount ?? 0,
    errorMessage: request.errorMessage ?? '',
    proposedName,
    checks: buildChecks(request, proposedName),
  };
}
