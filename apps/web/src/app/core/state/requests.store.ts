import {
  CreateRequestPayload,
  PenNameRequestDto,
  RequestStatus,
  UpdateRequestPayload,
} from '@nym/shared';
import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { NymApiService } from '../api/nym-api.service';
import { canApproveRequest } from '../util/can-approve';

/** How often the queue re-checks a request that is mid-generation. */
export const GENERATION_POLL_MS = 2000;

/**
 * Client-side store for pen name requests.
 *
 * Generation runs server-side and asynchronously, so a request can be left in
 * `generating`; while any row is in that state the store polls until everything
 * settles, which is what drives the row spinner.
 */
@Injectable({ providedIn: 'root' })
export class RequestsStore {
  private readonly api = inject(NymApiService);

  private readonly requestsState = signal<readonly PenNameRequestDto[]>([]);
  private readonly queryState = signal('');
  private readonly loadingState = signal(true);
  private readonly errorState = signal('');
  private readonly queueMatchesState = signal(0);
  private readonly historyMatchesState = signal(0);
  private readonly totalState = signal(0);
  private readonly limitState = signal(200);

  /**
   * The edit page pins its open id so list refresh (search / poll / 200-row
   * ceiling) cannot drop it out from under `byId`. Kept outside `requestsState`
   * so filtered queue/history tabs stay honest.
   */
  private pinnedId: string | undefined;
  private readonly pinnedRequestState = signal<PenNameRequestDto | undefined>(undefined);

  /** Bumps on every list fetch; stale responses are ignored. */
  private listGeneration = 0;

  private poller: ReturnType<typeof setInterval> | undefined;

  readonly requests = this.requestsState.asReadonly();
  readonly query = this.queryState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  /** Open requests, newest first — the Queue tab. */
  readonly queueRequests = computed(() =>
    this.requestsState().filter((request) => request.status !== RequestStatus.Approved),
  );

  /** Approved requests — the History tab. */
  readonly historyRequests = computed(() =>
    this.requestsState().filter((request) => request.status === RequestStatus.Approved),
  );

  /** How many requests the current search matches on each tab. */
  readonly queueMatchCount = this.queueMatchesState.asReadonly();
  readonly historyMatchCount = this.historyMatchesState.asReadonly();

  /** Total matching rows before the client page ceiling; used when items are truncated. */
  readonly listTotal = this.totalState.asReadonly();
  readonly listLimit = this.limitState.asReadonly();

  /** True when the API has more matching rows than this load returned. */
  readonly listTruncated = computed(() => this.totalState() > this.requestsState().length);

  /**
   * True while a list or pinned request is mid-generation.
   * The pin must count: search / the 200-row ceiling can drop the open row from
   * `requestsState` while `syncPinned` still holds it — otherwise polling stops
   * and the edit page sticks on “Working…”.
   */
  readonly hasPendingGeneration = computed(() => {
    if (this.requestsState().some((request) => request.status === RequestStatus.Generating)) {
      return true;
    }
    return this.pinnedRequestState()?.status === RequestStatus.Generating;
  });

  /** Requests that could be approved right now, for the bulk button's count. */
  readonly readyCount = computed(
    () => this.requestsState().filter(canApproveRequest).length,
  );

  constructor() {
    effect(() => {
      if (this.hasPendingGeneration()) {
        this.startPolling();
      } else {
        this.stopPolling();
      }
    });

    inject(DestroyRef).onDestroy(() => this.stopPolling());
  }

  byId(id: string): PenNameRequestDto | undefined {
    const fromList = this.requestsState().find((request) => request.id === id);
    if (fromList) {
      return fromList;
    }
    return this.pinnedId === id ? this.pinnedRequestState() : undefined;
  }

  /** Keep this id resolvable across search/list refreshes while the edit page is open. */
  pin(id: string): void {
    this.pinnedId = id;
  }

  unpin(id: string): void {
    if (this.pinnedId !== id) {
      return;
    }
    this.pinnedId = undefined;
    this.pinnedRequestState.set(undefined);
  }

  /**
   * Resolve a request by id, fetching from the API when it is not already in
   * the list (deep link, search filter, or past the 200-row ceiling).
   */
  async ensure(id: string): Promise<boolean> {
    const existing = this.byId(id);
    if (existing) {
      if (this.pinnedId === id) {
        this.pinnedRequestState.set(existing);
      }
      return true;
    }

    try {
      const request = await firstValueFrom(this.api.getRequest(id));
      if (this.pinnedId === id) {
        this.pinnedRequestState.set(request);
      } else {
        this.upsert(request);
      }
      return true;
    } catch {
      if (this.pinnedId === id) {
        this.pinnedRequestState.set(undefined);
      }
      return false;
    }
  }

  setQuery(query: string): void {
    this.queryState.set(query);
  }

  clearQuery(): void {
    this.queryState.set('');
  }

  async load(): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set('');
    try {
      await this.refresh();
    } catch (error) {
      this.errorState.set(describeError(error, 'Could not load requests.'));
    } finally {
      this.loadingState.set(false);
    }
  }

  /** Re-reads the list without showing the loading state — used by the poller. */
  async refresh(): Promise<void> {
    const generation = ++this.listGeneration;
    const result = await firstValueFrom(
      this.api.listRequests({
        view: 'all',
        q: this.queryState().trim() || undefined,
        limit: 200,
      }),
    );
    if (generation !== this.listGeneration) {
      return;
    }

    this.requestsState.set(result.items);
    this.queueMatchesState.set(result.queueMatchCount);
    this.historyMatchesState.set(result.historyMatchCount);
    this.totalState.set(result.total);
    this.limitState.set(result.limit);
    await this.syncPinned(result.items, generation);
  }

  /**
   * After a list replace, keep the edit page's open request in sync — from the
   * new page when present, otherwise via getRequest so search/limit drops do
   * not surface as “Request not found”.
   */
  private async syncPinned(
    items: readonly PenNameRequestDto[],
    generation: number,
  ): Promise<void> {
    const pinnedId = this.pinnedId;
    if (!pinnedId) {
      return;
    }

    const fromList = items.find((request) => request.id === pinnedId);
    if (fromList) {
      this.pinnedRequestState.set(fromList);
      return;
    }

    try {
      const request = await firstValueFrom(this.api.getRequest(pinnedId));
      if (generation !== this.listGeneration || this.pinnedId !== pinnedId) {
        return;
      }
      this.pinnedRequestState.set(request);
    } catch (error) {
      if (generation !== this.listGeneration || this.pinnedId !== pinnedId) {
        return;
      }
      // Only clear when the server confirms the row is gone. Network/5xx must
      // keep the pin — otherwise Generating drops out of hasPendingGeneration,
      // polling stops, and the edit page flashes “Request not found”.
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.pinnedRequestState.set(undefined);
      }
    }
  }

  async create(payload: CreateRequestPayload): Promise<PenNameRequestDto> {
    const created = await firstValueFrom(this.api.createRequest(payload));
    this.upsert(created);
    return created;
  }

  async update(id: string, payload: UpdateRequestPayload): Promise<void> {
    this.upsert(await firstValueFrom(this.api.updateRequest(id, payload)));
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.api.deleteRequest(id));
    this.requestsState.update((requests) => requests.filter((request) => request.id !== id));
    if (this.pinnedId === id) {
      this.pinnedRequestState.set(undefined);
    }
  }

  async generate(
    id: string,
    options: { regenerate?: boolean; refine?: string } = {},
  ): Promise<void> {
    this.upsert(await firstValueFrom(this.api.generate(id, options)));
  }

  async choose(id: string, penName: string): Promise<void> {
    this.upsert(await firstValueFrom(this.api.chooseCandidate(id, penName)));
  }

  async toggleLock(id: string, candidateId: string, locked: boolean): Promise<void> {
    this.upsert(await firstValueFrom(this.api.toggleLock(id, candidateId, locked)));
  }

  async approve(id: string, penName?: string): Promise<PenNameRequestDto> {
    const approved = await firstValueFrom(this.api.approve(id, penName ? { penName } : {}));
    this.upsert(approved);
    return approved;
  }

  async approveAll(): Promise<number> {
    const result = await firstValueFrom(this.api.approveAll());
    for (const request of result.requests) {
      this.upsert(request);
    }
    return result.approvedCount;
  }

  async reopen(id: string): Promise<void> {
    this.upsert(await firstValueFrom(this.api.reopen(id)));
  }

  private upsert(request: PenNameRequestDto): void {
    if (this.pinnedId === request.id) {
      this.pinnedRequestState.set(request);
    }
    this.requestsState.update((requests) => {
      const index = requests.findIndex((candidate) => candidate.id === request.id);
      if (index === -1) {
        // Pin lives outside requestsState so filtered tabs stay honest — do not
        // reinsert a search/limit drop on mutation.
        if (this.pinnedId === request.id) {
          return requests;
        }
        return [request, ...requests];
      }
      const next = [...requests];
      next[index] = request;
      return next;
    });
  }

  private startPolling(): void {
    if (this.poller !== undefined) {
      return;
    }
    this.poller = setInterval(() => {
      void this.refresh().catch(() => {
        // A dropped poll is not worth an error banner; the next tick retries and
        // an actual failure surfaces on the row itself.
      });
    }, GENERATION_POLL_MS);
  }

  private stopPolling(): void {
    if (this.poller !== undefined) {
      clearInterval(this.poller);
      this.poller = undefined;
    }
  }
}

/**
 * User-facing copy for a failed API call.
 *
 * Always returns `fallback` — Nest validation arrays and unexpected 5xx bodies
 * must not reach toasts/alerts. Call sites supply action-specific safe copy.
 */
export function describeError(_error: unknown, fallback: string): string {
  return fallback;
}
