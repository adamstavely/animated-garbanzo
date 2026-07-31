/**
 * Name tokenisation shared by the API's screening rules, the client's
 * "Excluded from results" chips, and live overlap labelling on refine cards.
 *
 * It lives here so both sides split a name exactly the same way — the chips the
 * assistant reads are the same words screening compares against.
 */

/** Separators between name parts: spaces, hyphens and apostrophes. */
const PART_SEPARATOR = /[\s\-']+/;

/**
 * Splits a name into alphabetic parts, dropping punctuation.
 * "Margaret E. Voss" -> ["Margaret", "E", "Voss"]
 */
export function nameParts(name: string): string[] {
  return (name ?? '')
    .split(PART_SEPARATOR)
    .map((part) => part.replace(/[^A-Za-z]/g, ''))
    .filter((part) => part.length > 0);
}

/**
 * The whole-word parts of a name. Initials are excluded because a single letter
 * is compared separately, against the initial list.
 * "Margaret E. Voss" -> ["Margaret", "Voss"]
 */
export function nameWords(name: string): string[] {
  return nameParts(name).filter((part) => part.length > 1);
}

/**
 * First letter of *every* part, including a middle initial.
 * "Margaret E. Voss" -> ["M", "E", "V"]
 */
export function nameInitials(name: string): string[] {
  return nameParts(name).map((part) => (part[0] ?? '').toUpperCase());
}

/** The single-letter parts of a name, i.e. its middle initials. */
export function singleLetterParts(name: string): string[] {
  return nameParts(name).filter((part) => part.length === 1);
}

/** Collapses whitespace so stored names compare and display predictably. */
export function normaliseName(name: string): string {
  return (name ?? '').replace(/\s+/g, ' ').trim();
}

/** Case-insensitive identity used to de-duplicate names. */
export function nameKey(name: string): string {
  return normaliseName(name).toLowerCase();
}

/** Composes "Margaret E. Voss" from the three intake fields. */
export function composeLegalName(
  firstName: string,
  middleInitial: string | undefined,
  lastName: string,
): string {
  const initial = (middleInitial ?? '')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 1)
    .toUpperCase();

  return normaliseName(
    [firstName?.trim(), initial ? `${initial}.` : '', lastName?.trim()].filter(Boolean).join(' '),
  );
}
