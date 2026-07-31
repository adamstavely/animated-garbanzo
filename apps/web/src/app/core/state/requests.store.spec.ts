import { PenNameRequestDto, RequestListDto, RequestStatus } from '@nym/shared';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';

import { GENERATION_POLL_MS, RequestsStore, describeError } from './requests.store';

const BASE = '/api/v1';

function makeRequest(over: Partial<PenNameRequestDto> = {}): PenNameRequestDto {
  return {
    id: 'r1',
    legalName: 'Margaret E. Voss',
    presentation: 'Female',
    origin: 'Anglo-Irish',
    notes: '',
    refine: '',
    status: RequestStatus.Ready,
    candidates: [
      { id: 'c1', name: 'Bridget C. ASHWORTH', pronunciation: '', origin: '', locked: false },
    ],
    chosenName: '',
    approvedName: '',
    approvedByName: '',
    approvedAt: null,
    requestedAt: '2026-07-30T09:14:00.000Z',
    discardedCount: 0,
    errorMessage: '',
    proposedName: 'Bridget C. ASHWORTH',
    checks: [],
    ...over,
  };
}

function listResponse(items: PenNameRequestDto[]): RequestListDto {
  return {
    items,
    queueMatchCount: items.filter((item) => item.status !== RequestStatus.Approved).length,
    historyMatchCount: items.filter((item) => item.status === RequestStatus.Approved).length,
    total: items.length,
    limit: 200,
    offset: 0,
  };
}

describe('RequestsStore', () => {
  let store: RequestsStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        RequestsStore,
      ],
    });

    store = TestBed.inject(RequestsStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('splits the loaded list into the queue and history tabs', async () => {
    const loading = store.load();

    const request = http.expectOne(`${BASE}/requests?view=all&limit=200`);
    expect(request.request.method).toBe('GET');
    request.flush(
      listResponse([
        makeRequest(),
        makeRequest({ id: 'r2', status: RequestStatus.Approved, approvedName: 'Ash T. FENNIMORE' }),
      ]),
    );
    await loading;

    expect(store.queueRequests().map((item) => item.id)).toEqual(['r1']);
    expect(store.historyRequests().map((item) => item.id)).toEqual(['r2']);
    expect(store.queueMatchCount()).toBe(1);
    expect(store.historyMatchCount()).toBe(1);
  });

  it('flags when the list is truncated past the client ceiling', async () => {
    const loading = store.load();

    http.expectOne(`${BASE}/requests?view=all&limit=200`).flush({
      ...listResponse([makeRequest()]),
      total: 250,
      limit: 200,
    });
    await loading;

    expect(store.listTruncated()).toBe(true);
    expect(store.listTotal()).toBe(250);
    expect(store.listLimit()).toBe(200);
  });

  it('passes the search term to the API', async () => {
    store.setQuery('  ashworth  ');
    const loading = store.load();

    http.expectOne(`${BASE}/requests?view=all&q=ashworth&limit=200`).flush(listResponse([]));
    await loading;

    expect(store.query()).toBe('  ashworth  ');
  });

  it('surfaces a safe fallback when loading fails', async () => {
    const loading = store.load();

    http
      .expectOne(`${BASE}/requests?view=all&limit=200`)
      .flush({ message: 'Sign in to continue.' }, { status: 401, statusText: 'Unauthorized' });
    await loading;

    expect(store.error()).toBe('Could not load requests.');
    expect(store.loading()).toBe(false);
  });

  it('counts only ready requests that actually have a name to approve', async () => {
    const loading = store.load();
    http
      .expectOne(`${BASE}/requests?view=all&limit=200`)
      .flush(
        listResponse([
          makeRequest(),
          makeRequest({ id: 'r2', status: RequestStatus.Ready, proposedName: '' }),
          makeRequest({ id: 'r3', status: RequestStatus.Failed }),
        ]),
      );
    await loading;

    expect(store.readyCount()).toBe(1);
  });

  it('moves an approved request from the queue to history in place', async () => {
    const loading = store.load();
    http.expectOne(`${BASE}/requests?view=all&limit=200`).flush(listResponse([makeRequest()]));
    await loading;

    const approving = store.approve('r1');
    http
      .expectOne(`${BASE}/requests/r1/approve`)
      .flush(makeRequest({ status: RequestStatus.Approved, approvedName: 'Bridget C. ASHWORTH' }));
    await approving;

    expect(store.queueRequests()).toHaveLength(0);
    expect(store.historyRequests()).toHaveLength(1);
  });

  it('sends an explicit pen name only when one is given', async () => {
    const withName = store.approve('r1', 'Nella P. QUINTRELL');
    const first = http.expectOne(`${BASE}/requests/r1/approve`);
    expect(first.request.body).toEqual({ penName: 'Nella P. QUINTRELL' });
    first.flush(makeRequest());
    await withName;

    const withoutName = store.approve('r1');
    const second = http.expectOne(`${BASE}/requests/r1/approve`);
    expect(second.request.body).toEqual({});
    second.flush(makeRequest());
    await withoutName;
  });

  it('drops a deleted request from the list', async () => {
    const loading = store.load();
    http.expectOne(`${BASE}/requests?view=all&limit=200`).flush(listResponse([makeRequest()]));
    await loading;

    const removing = store.remove('r1');
    http.expectOne(`${BASE}/requests/r1`).flush(null);
    await removing;

    expect(store.requests()).toHaveLength(0);
  });

  it('prepends a newly created request', async () => {
    const loading = store.load();
    http.expectOne(`${BASE}/requests?view=all&limit=200`).flush(listResponse([makeRequest()]));
    await loading;

    const creating = store.create({
      firstName: 'Daniel',
      lastName: 'Reyes',
      presentation: 'Male',
    });
    http
      .expectOne(`${BASE}/requests`)
      .flush(makeRequest({ id: 'r2', status: RequestStatus.Generating }));
    await creating;

    expect(store.requests().map((item) => item.id)).toEqual(['r2', 'r1']);
  });

  it('polls while a request is generating and stops once it settles', async () => {
    vi.useFakeTimers();

    try {
      const loading = store.load();
      http
        .expectOne(`${BASE}/requests?view=all&limit=200`)
        .flush(listResponse([makeRequest({ status: RequestStatus.Generating })]));
      await loading;
      TestBed.tick();

      expect(store.hasPendingGeneration()).toBe(true);

      vi.advanceTimersByTime(GENERATION_POLL_MS);
      http.expectOne(`${BASE}/requests?view=all&limit=200`).flush(listResponse([makeRequest()]));
      await Promise.resolve();
      TestBed.tick();

      expect(store.hasPendingGeneration()).toBe(false);

      // Nothing is pending any more, so no further request is made.
      vi.advanceTimersByTime(GENERATION_POLL_MS * 2);
      http.expectNone(`${BASE}/requests?view=all&limit=200`);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fetches a missing id via getRequest when ensured', async () => {
    const ensuring = store.ensure('r1');

    http.expectOne(`${BASE}/requests/r1`).flush(makeRequest());
    await ensuring;

    expect(store.byId('r1')?.legalName).toBe('Margaret E. Voss');
  });

  it('keeps a pinned open request when search refresh drops it from the list', async () => {
    const loading = store.load();
    http.expectOne(`${BASE}/requests?view=all&limit=200`).flush(listResponse([makeRequest()]));
    await loading;

    store.pin('r1');
    expect(store.byId('r1')).toBeDefined();

    store.setQuery('no-match');
    const refreshing = store.refresh();
    http.expectOne(`${BASE}/requests?view=all&q=no-match&limit=200`).flush(listResponse([]));
    // syncPinned continues on a microtask after the list await settles.
    await Promise.resolve();
    http.expectOne(`${BASE}/requests/r1`).flush(makeRequest());
    await refreshing;

    expect(store.requests()).toHaveLength(0);
    expect(store.byId('r1')?.id).toBe('r1');
  });

  it('ignores a stale list response when a newer refresh has started', async () => {
    const first = store.refresh();
    const second = store.refresh();

    const pending = http.match(`${BASE}/requests?view=all&limit=200`);
    expect(pending).toHaveLength(2);

    pending[0].flush(listResponse([makeRequest({ id: 'stale' })]));
    pending[1].flush(listResponse([makeRequest({ id: 'fresh' })]));
    await Promise.all([first, second]);

    expect(store.requests().map((item) => item.id)).toEqual(['fresh']);
  });

  it('clears the pin so later refreshes no longer fetch by id', async () => {
    store.pin('r1');
    store.unpin('r1');

    const refreshing = store.refresh();
    http.expectOne(`${BASE}/requests?view=all&limit=200`).flush(listResponse([]));
    await refreshing;
    await Promise.resolve();

    http.expectNone(`${BASE}/requests/r1`);
    expect(store.byId('r1')).toBeUndefined();
  });
});

describe('describeError', () => {
  it('ignores Nest string bodies and uses the safe fallback', () => {
    expect(describeError({ error: { message: 'Internal stack dump' } }, 'fallback')).toBe(
      'fallback',
    );
  });

  it('ignores Nest validation arrays', () => {
    expect(
      describeError({ error: { message: ['a must be set', 'b must be set'] } }, 'fallback'),
    ).toBe('fallback');
  });

  it('uses the fallback for any other failure shape', () => {
    expect(describeError(new Error('boom'), 'fallback')).toBe('fallback');
    expect(describeError(null, 'fallback')).toBe('fallback');
    expect(describeError({ error: { message: [] } }, 'fallback')).toBe('fallback');
  });
});
