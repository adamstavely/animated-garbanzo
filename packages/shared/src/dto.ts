import type { CheckResult, Presentation } from './domain.js';
import type { RequestStatus } from './domain.js';

/** A screened pen name candidate offered to the assistant. */
export interface CandidateDto {
  id: string;
  /** Display form, surname upper-cased, e.g. "Bridget C. ASHWORTH". */
  name: string;
  /** Short respelling, e.g. "MAR-go SEL-den". */
  pronunciation: string;
  /** One clause on linguistic origin and register. */
  origin: string;
  /** Locked candidates survive a regeneration. */
  locked: boolean;
}

export interface PenNameRequestDto {
  id: string;
  /** Full legal name including middle initial, e.g. "Margaret E. Voss". */
  legalName: string;
  presentation: Presentation;
  /** Language / cultural origin to lean on; empty string means no preference. */
  origin: string;
  /** Free-text editorial steer captured at intake. */
  notes: string;
  /** Free-text steer applied to the next regeneration only. */
  refine: string;
  status: RequestStatus;
  candidates: CandidateDto[];
  /** Candidate the assistant selected but has not yet approved. */
  chosenName: string;
  /** Pen name signed off by an assistant. */
  approvedName: string;
  approvedByName: string;
  /** ISO 8601, or null while unapproved. */
  approvedAt: string | null;
  /** ISO 8601 creation stamp shown in the Requested column. */
  requestedAt: string;
  /** How many candidates screening discarded across the runs so far. */
  discardedCount: number;
  /** Human-readable failure reason shown inline on a failed row. */
  errorMessage: string;
  /** Pen name shown in the table: approved, else chosen, else first candidate. */
  proposedName: string;
  /** Screening results for the proposed name, in display order. */
  checks: CheckResult[];
}

/**
 * A filtered slice of requests plus the match counts for both tabs, so the empty
 * state can say "2 matches in History" without a second round trip.
 */
export interface RequestListDto {
  items: PenNameRequestDto[];
  queueMatchCount: number;
  historyMatchCount: number;
  /** Total rows matching the current view + search, before pagination. */
  total: number;
  limit: number;
  offset: number;
}

export interface CreateRequestPayload {
  firstName: string;
  /** Single letter; the API stores it as "E." within the legal name. */
  middleInitial?: string;
  lastName: string;
  presentation: Presentation;
  origin?: string;
  notes?: string;
}

export interface UpdateRequestPayload {
  legalName?: string;
  presentation?: Presentation;
  origin?: string;
  notes?: string;
  refine?: string;
}

export interface GenerateRequestPayload {
  /** True keeps locked candidates and replaces the rest. */
  regenerate?: boolean;
  /** Steer applied to this pass only. */
  refine?: string;
}

export interface ApprovePayload {
  /** Defaults to the request's proposed name when omitted. */
  penName?: string;
}

export interface ToggleLockPayload {
  locked: boolean;
}

export interface ChooseCandidatePayload {
  /** Empty string clears the selection. */
  penName: string;
}

export interface BulkApproveResultDto {
  approvedCount: number;
  requests: PenNameRequestDto[];
}

export interface PromptSettingsDto {
  /** System instruction sent with generations for this request. */
  system: string;
  /** Generation prompt; auto-composed from the brief unless overridden. */
  prompt: string;
  /** True when a saved override is in use and the brief no longer flows in. */
  isCustom: boolean;
}

export interface UpdatePromptSettingsPayload {
  system: string;
  prompt: string;
}

export interface CurrentUserDto {
  id: string;
  name: string;
  email: string;
  /** e.g. "Publishing assistant · Trade". */
  role: string;
  /** e.g. "RM". */
  initials: string;
  /**
   * True when the IdP role is on OIDC_ADMIN_ROLES (or every signed-in user in
   * non-production when that list is empty). Gates delete, bulk approve, and
   * global prompt overrides.
   */
  canAdminister: boolean;
}

/** One entry in the publishing-suite app picker. */
export interface SuiteAppDto {
  name: string;
  description: string;
  href: string;
  current: boolean;
}

export interface ApiErrorDto {
  statusCode: number;
  message: string;
  error?: string;
}
