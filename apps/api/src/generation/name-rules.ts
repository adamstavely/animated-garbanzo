/**
 * Pure name-screening rules.
 *
 * These implement section 5 of the Nym style guide ("Product logic"). They live
 * apart from Nest so they can be exercised directly by unit tests and reused by
 * any caller — the model is never trusted to have obeyed the prompt, so every
 * candidate is re-screened here before it can reach an assistant.
 */

import {
  nameKey,
  nameParts,
  normaliseName,
  overlapsLegalName,
} from '@nym/shared';

// Tokenisation and overlap live in @nym/shared so refine cards and the Checks
// column use the same rules the API screens with.
export {
  composeLegalName,
  nameInitials,
  nameKey,
  nameParts,
  nameWords,
  normaliseName,
  overlapsLegalName,
  singleLetterParts,
} from '@nym/shared';

/** Why a candidate was discarded. Surfaced in logs and counted, never shown per-name. */
export enum RejectionReason {
  /** Shares a word, initial or phonetic stem with the legal name. */
  Overlap = 'overlap',
  /** The model flagged it as belonging to a real person or character. */
  PriorUse = 'prior-use',
  /** Not "Given M. Surname". */
  MissingMiddleInitial = 'missing-middle-initial',
  /** Empty, or already present in this list. */
  Duplicate = 'duplicate',
  /** Failed a structural sanity check (empty name, absurd length). */
  Malformed = 'malformed',
}

/** Longest name we will accept from the model, guarding the varchar(255) column. */
const MAX_NAME_LENGTH = 120;

/**
 * True when a name is "Given M. Surname" — at least three parts with a
 * single-letter part between the first and last. Names without a middle initial
 * are discarded before review.
 */
export function hasMiddleInitial(name: string): boolean {
  const parts = nameParts(name);
  if (parts.length < 3) {
    return false;
  }
  return parts.slice(1, -1).some((part) => part.length === 1);
}

/**
 * Upper-cases the surname for display: "Bridget C. Ashworth" -> "Bridget C. ASHWORTH".
 * Names of fewer than two parts are returned untouched.
 */
export function upperCaseSurname(name: string): string {
  const trimmed = (name ?? '').trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return trimmed;
  }
  parts[parts.length - 1] = parts[parts.length - 1].toUpperCase();
  return parts.join(' ');
}

/** A candidate as returned by the model, before screening. */
export interface RawCandidate {
  name: string;
  pronunciation?: string;
  origin?: string;
  priorUse?: boolean;
  priorUseWho?: string;
}

export interface ScreenedCandidate {
  name: string;
  pronunciation: string;
  origin: string;
}

export interface ScreeningRejection {
  name: string;
  reason: RejectionReason;
  detail?: string;
}

export interface ScreeningResult {
  accepted: ScreenedCandidate[];
  rejected: ScreeningRejection[];
}

export interface ScreeningOptions {
  /** The author's legal name every candidate is screened against. */
  legalName: string;
  /** Names already locked by the assistant; kept out of the accepted list as duplicates. */
  reservedNames?: readonly string[];
  /** Upper bound on accepted candidates for this pass. */
  limit: number;
}

/**
 * Applies every screening rule to a model response and reports what survived.
 *
 * Rejections are counted, not shown: assistants only ever see cleared names, plus
 * the "N discarded in screening" tally that proves screening ran.
 */
export function screenCandidates(
  candidates: readonly RawCandidate[],
  options: ScreeningOptions,
): ScreeningResult {
  const accepted: ScreenedCandidate[] = [];
  const rejected: ScreeningRejection[] = [];
  const seen = new Set((options.reservedNames ?? []).map(nameKey));

  for (const candidate of candidates) {
    if (accepted.length >= options.limit) {
      break;
    }

    const name = normaliseName(candidate?.name ?? '');

    if (!name || name.length > MAX_NAME_LENGTH) {
      rejected.push({ name, reason: RejectionReason.Malformed });
      continue;
    }
    if (seen.has(nameKey(name))) {
      rejected.push({ name, reason: RejectionReason.Duplicate });
      continue;
    }
    if (!hasMiddleInitial(name)) {
      rejected.push({ name, reason: RejectionReason.MissingMiddleInitial });
      continue;
    }
    if (candidate.priorUse === true) {
      rejected.push({
        name,
        reason: RejectionReason.PriorUse,
        detail: candidate.priorUseWho,
      });
      continue;
    }
    if (overlapsLegalName(name, options.legalName)) {
      rejected.push({ name, reason: RejectionReason.Overlap });
      continue;
    }

    seen.add(nameKey(name));
    accepted.push({
      name: upperCaseSurname(name),
      pronunciation: (candidate.pronunciation ?? '').trim().slice(0, 255),
      origin: (candidate.origin ?? '').trim().slice(0, 500),
    });
  }

  return { accepted, rejected };
}
