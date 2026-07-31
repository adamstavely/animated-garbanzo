const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * Renders a timestamp as "30 Jul 2026 · 09:14".
 *
 * Hand-formatted rather than `Intl.DateTimeFormat` so the middle dot and the
 * 24-hour clock are identical in every locale the desk runs in — the column is
 * sized to fit exactly this string on one line.
 */
export function formatStamp(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const day = date.getDate();
  const month = MONTHS[date.getMonth()] ?? '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day} ${month} ${date.getFullYear()} · ${hours}:${minutes}`;
}

/** "Female · Anglo-Irish", or "Female · No origin set" when none was chosen. */
export function formatRequestMeta(presentation: string, origin: string): string {
  return [presentation, origin || 'No origin set'].join(' · ');
}

/** "+3 alternates", "only candidate", or "" when nothing has been generated. */
export function formatAlternates(candidateCount: number, approved: boolean): string {
  if (approved) {
    return `Approved from ${candidateCount || 1} cleared candidates`;
  }
  if (candidateCount > 1) {
    return `+${candidateCount - 1} alternates`;
  }
  return candidateCount === 1 ? 'only candidate' : '';
}

/** "4 discarded in screening" / "all candidates cleared". */
export function formatScreening(discardedCount: number): string {
  return discardedCount ? `${discardedCount} discarded in screening` : 'all candidates cleared';
}

/** Pluralises a count, e.g. `pluralise(2, 'match', 'matches')`. */
export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}
