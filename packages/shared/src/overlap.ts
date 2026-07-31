import { nameInitials, nameWords, singleLetterParts } from './name-parts.js';

/**
 * True when a candidate shares too much with the author's legal name.
 *
 * Shared by API screening and the refine cards so a legal-name edit that flips
 * the queue Checks column also flips each candidate's overlap line — neither
 * side hardcodes a green pass.
 *
 * A candidate is rejected when any part of it:
 *  - is a single letter matching any initial of the legal name; or
 *  - starts with the same letter as any part of the legal name; or
 *  - equals a legal name word; or
 *  - shares its first three letters with a legal name word (phonetic stem); or
 *  - contains, or is contained by, a legal name word (for parts over three letters).
 *
 * Comparison is case-insensitive and ignores punctuation.
 */
export function overlapsLegalName(candidate: string, legalName: string): boolean {
  const legalWords = nameWords(legalName).map((word) => word.toLowerCase());
  const legalInitials = nameInitials(legalName);
  const candidateWords = nameWords(candidate);

  if (legalWords.length === 0 || candidateWords.length === 0) {
    return false;
  }

  const candidateInitials = singleLetterParts(candidate).map((part) => part.toUpperCase());
  if (candidateInitials.some((initial) => legalInitials.includes(initial))) {
    return true;
  }

  for (const word of candidateWords) {
    const lower = word.toLowerCase();

    if (legalInitials.includes((word[0] ?? '').toUpperCase())) {
      return true;
    }

    for (const legalWord of legalWords) {
      if (lower === legalWord) {
        return true;
      }
      if (lower.slice(0, 3) === legalWord.slice(0, 3)) {
        return true;
      }
      if (lower.length > 3 && (legalWord.includes(lower) || lower.includes(legalWord))) {
        return true;
      }
    }
  }

  return false;
}
