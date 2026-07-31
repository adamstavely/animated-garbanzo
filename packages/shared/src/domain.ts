/**
 * Domain vocabulary shared by the Nym API and web client.
 *
 * These values are part of the wire contract: the API validates against them and
 * the client renders from them, so they live in one place rather than two.
 */

/** How the generated pen name should read. Mirrors the segmented control in the brief. */
export const PRESENTATIONS = ['Female', 'Male', 'Unisex'] as const;
export type Presentation = (typeof PRESENTATIONS)[number];

/** Lifecycle of a pen name request. */
export enum RequestStatus {
  /** Created but generation has not started. */
  Queued = 'queued',
  /** A generation run is in flight. */
  Generating = 'generating',
  /** Cleared candidates are waiting for an assistant to review. */
  Ready = 'ready',
  /** An assistant signed off on a pen name; the request lives in History. */
  Approved = 'approved',
  /** The last generation run failed; the row offers a retry. */
  Failed = 'failed',
}

/** The four screening checks surfaced in the Checks column. */
export enum CheckId {
  Overlap = 'overlap',
  PriorUse = 'prior-use',
  Famous = 'famous',
  Offensive = 'offensive',
}

/** Order is the display order of the stacked checks in the queue table. */
export const CHECK_ORDER: readonly CheckId[] = [
  CheckId.Overlap,
  CheckId.PriorUse,
  CheckId.Famous,
  CheckId.Offensive,
] as const;

export interface CheckResult {
  id: CheckId;
  /** Copy shown when the check passes, e.g. "No name overlap". */
  passLabel: string;
  /** Copy shown when the check fails, e.g. "Overlaps legal name". */
  failLabel: string;
  passed: boolean;
}

/** Language / cultural origin options offered in the brief and the intake modal. */
export interface OriginOption {
  value: string;
  label: string;
}

export const ORIGIN_OPTIONS: readonly OriginOption[] = [
  { value: '', label: 'No preference' },
  { value: 'English (British)', label: 'English — British' },
  { value: 'English (American)', label: 'English — American' },
  { value: 'Anglo-Irish', label: 'Anglo-Irish' },
  { value: 'Scottish', label: 'Scottish' },
  { value: 'Welsh', label: 'Welsh' },
  { value: 'French', label: 'French' },
  { value: 'Spanish', label: 'Spanish' },
  { value: 'Portuguese / Brazilian', label: 'Portuguese / Brazilian' },
  { value: 'Italian', label: 'Italian' },
  { value: 'German', label: 'German' },
  { value: 'Dutch / Flemish', label: 'Dutch / Flemish' },
  { value: 'Nordic (Scandinavian)', label: 'Nordic / Scandinavian' },
  { value: 'Finnish', label: 'Finnish' },
  { value: 'Polish', label: 'Polish' },
  { value: 'Czech / Slovak', label: 'Czech / Slovak' },
  { value: 'Russian', label: 'Russian' },
  { value: 'Ukrainian', label: 'Ukrainian' },
  { value: 'Greek', label: 'Greek' },
  { value: 'Turkish', label: 'Turkish' },
  { value: 'Hebrew / Israeli', label: 'Hebrew / Israeli' },
  { value: 'Arabic', label: 'Arabic' },
  { value: 'Persian', label: 'Persian' },
  { value: 'Hindi / North Indian', label: 'Hindi / North Indian' },
  { value: 'Tamil / South Indian', label: 'Tamil / South Indian' },
  { value: 'Bengali', label: 'Bengali' },
  { value: 'Japanese', label: 'Japanese' },
  { value: 'Korean', label: 'Korean' },
  { value: 'Chinese (Mandarin)', label: 'Chinese — Mandarin' },
  { value: 'Vietnamese', label: 'Vietnamese' },
  { value: 'Filipino', label: 'Filipino' },
  { value: 'Indonesian / Malay', label: 'Indonesian / Malay' },
  { value: 'Swahili / East African', label: 'Swahili / East African' },
  { value: 'Yoruba / West African', label: 'Yoruba / West African' },
  { value: 'Afrikaans', label: 'Afrikaans' },
  { value: 'Latin American Spanish', label: 'Latin American Spanish' },
  { value: 'Caribbean', label: 'Caribbean' },
  { value: 'Māori / Pacific', label: 'Māori / Pacific' },
] as const;

export const ORIGIN_VALUES: readonly string[] = ORIGIN_OPTIONS.map((option) => option.value);
