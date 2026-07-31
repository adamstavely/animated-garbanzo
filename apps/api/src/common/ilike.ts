/**
 * Escapes `%`, `_`, and `\` so user search input is matched literally under
 * `ILIKE … ESCAPE '\'`. Callers still wrap the result in `%…%` for contains.
 */
export function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
