import {
  CreateRequestPayload,
  PenNameRequestDto,
  RequestStatus,
  UpdateRequestPayload,
} from '@nym/shared';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { NymApiService } from '../api/nym-api.service';

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
  private readonly loadingState = signal(false);
  private readonly errorState = signal('');
  private readonly queueMatchesState = signal(0);
  private readonly historyMatchesState = signal(0);

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

  /** True while at least one request is mid-generation. */
  readonly hasPendingGeneration = computed(() =>
    this.requestsState().some((request) => request.status === RequestStatus.Generating),
  );

  /** Requests that could be approved right now, for the bulk button's count. */
  readonly readyCount = computed(
    () =>
      this.requestsState().filter(
        (request) => request.status === RequestStatus.Ready && request.proposedName !== '',
      ).length,
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
    return this.requestsState().find((request) => request.id === id);
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
    const result = await firstValueFrom(
      this.api.listRequests({
        view: 'all',
        q: this.queryState().trim() || undefined,
        limit: 200,
      }),
    );
    this.requestsState.set(result.items);
    this.queueMatchesState.set(result.queueMatchCount);
    this.historyMatchesState.set(result.historyMatchCount);
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
    this.requestsState.update((requests) => {
      const index = requests.findIndex((candidate) => candidate.id === request.id);
      if (index === -1) {
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
