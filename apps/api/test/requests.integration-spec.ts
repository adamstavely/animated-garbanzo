import { PenNameRequestDto, RequestListDto, RequestStatus } from '@nym/shared';
import { ConfigService } from '@nestjs/config';
import { Server } from 'node:http';

import request from 'supertest';

import { RateLimiter } from '../src/common/rate-limiter';
import { AppConfig } from '../src/config/configuration';
import { TestHarness, createTestHarness } from './test-app';

const API = '/api/v1';

/**
 * Full lifecycle against a real Postgres schema: intake, generation, screening,
 * selection, approval, history, reopening, search and deletion. Only the model
 * call is scripted.
 */
describe('Requests (integration)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const http = () => request(harness.app.getHttpServer() as Server);
  const auth = <T extends request.Test>(call: T): T => call.set('Cookie', harness.sessionCookie);

  /** Creates a request and waits for its background generation run to settle. */
  async function createRequest(
    body: Partial<Record<string, unknown>> = {},
  ): Promise<PenNameRequestDto> {
    const response = await auth(http().post(`${API}/requests`)).send({
      firstName: 'Margaret',
      middleInitial: 'E',
      lastName: 'Voss',
      presentation: 'Female',
      origin: 'Anglo-Irish',
      notes: 'Literary historical fiction.',
      ...body,
    });

    expect(response.status).toBe(201);
    return settle((response.body as PenNameRequestDto).id);
  }

  /** Polls until the request leaves the generating state. */
  async function settle(id: string): Promise<PenNameRequestDto> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const response = await auth(http().get(`${API}/requests/${id}`)).expect(200);
      const body = response.body as PenNameRequestDto;
      if (body.status !== RequestStatus.Generating) {
        return body;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Request ${id} never left the generating state`);
  }

  describe('intake', () => {
    it('composes the legal name from the three fields and generates immediately', async () => {
      const created = await createRequest();

      expect(created.legalName).toBe('Margaret E. Voss');
      expect(created.status).toBe(RequestStatus.Ready);
      expect(created.candidates.length).toBeGreaterThan(0);
      expect(harness.generator.calls).toHaveLength(1);
    });

    it('sends the brief through to the model prompt', async () => {
      await createRequest();

      const prompt = harness.generator.calls[0]?.prompt ?? '';
      expect(prompt).toContain('Author legal name: Margaret E. Voss');
      expect(prompt).toContain('Pen name should read as: Female');
      expect(prompt).toContain('Language / cultural origin to lean on: Anglo-Irish');
    });

    it('rejects a request with no name at all', async () => {
      await auth(http().post(`${API}/requests`))
        .send({ firstName: '', lastName: '', presentation: 'Unisex' })
        .expect(400);
    });

    it('rejects an unknown presentation or origin', async () => {
      await auth(http().post(`${API}/requests`))
        .send({ firstName: 'A', lastName: 'B', presentation: 'Other' })
        .expect(400);

      await auth(http().post(`${API}/requests`))
        .send({ firstName: 'A', lastName: 'B', presentation: 'Unisex', origin: 'Klingon' })
        .expect(400);
    });

    it('strips unknown fields rather than persisting them', async () => {
      await auth(http().post(`${API}/requests`))
        .send({ firstName: 'A', lastName: 'B', presentation: 'Unisex', isAdmin: true })
        .expect(400);
    });
  });

  describe('screening', () => {
    it('shows only cleared names and counts what it discarded', async () => {
      harness.generator.queueCandidates([
        { name: 'Bridget C. Ashworth' },
        { name: 'Margaret T. Bland' }, // shares "Margaret"
        { name: 'Nella Quintrell' }, // no middle initial
        { name: 'Ash T. Fennimore', priorUse: true, priorUseWho: 'A novelist' },
      ]);

      const created = await createRequest();

      expect(created.candidates.map((candidate) => candidate.name)).toEqual([
        'Bridget C. ASHWORTH',
      ]);
      expect(created.discardedCount).toBe(3);
    });

    it('reports four passing checks against the proposed name', async () => {
      const created = await createRequest();

      expect(created.checks).toHaveLength(4);
      expect(created.checks[0]?.outcome).toBe('passed');
      expect(created.checks.slice(1).every((check) => check.outcome === 'unknown')).toBe(true);
    });

    it('flips the overlap check when the brief is edited to a colliding name', async () => {
      const created = await createRequest();

      const updated = await auth(http().patch(`${API}/requests/${created.id}`))
        .send({ legalName: 'Bridget A. Voss' })
        .expect(200);

      const body = updated.body as PenNameRequestDto;
      expect(body.checks[0]?.outcome).toBe('failed');
    });

    it('fails the request when nothing survives screening', async () => {
      harness.generator.queueCandidates([{ name: 'Margaret T. Bland' }]);

      const created = await createRequest();

      expect(created.status).toBe(RequestStatus.Failed);
      expect(created.errorMessage).toContain('Every candidate was filtered out');
    });

    it('records a failure when the model call itself fails, and allows a retry', async () => {
      const upstream = 'upstream Anthropic detail that must not leak';
      harness.generator.queueFailure(new Error(upstream));

      const created = await createRequest();
      expect(created.status).toBe(RequestStatus.Failed);
      expect(created.errorMessage).toBe('Generation failed — try again.');
      expect(created.errorMessage).not.toContain(upstream);

      await auth(http().post(`${API}/requests/${created.id}/generate`))
        .send({})
        .expect(202);
      const retried = await settle(created.id);

      expect(retried.status).toBe(RequestStatus.Ready);
      expect(retried.errorMessage).toBe('');
    });
  });

  describe('regeneration', () => {
    it('keeps locked candidates and replaces the rest', async () => {
      const created = await createRequest();
      const keeper = created.candidates[0];

      await auth(http().patch(`${API}/requests/${created.id}/candidates/${keeper?.id}/lock`))
        .send({ locked: true })
        .expect(200);

      harness.generator.queueCandidates([
        { name: 'Wren S. Calloway' },
        { name: 'Thea R. Pemberly' },
      ]);

      await auth(http().post(`${API}/requests/${created.id}/generate`))
        .send({ regenerate: true, refine: 'shorter surnames' })
        .expect(202);

      const regenerated = await settle(created.id);
      const names = regenerated.candidates.map((candidate) => candidate.name);

      expect(names[0]).toBe(keeper?.name);
      expect(names).toContain('Wren S. CALLOWAY');
      expect(names).not.toContain('Nella P. QUINTRELL');

      const prompt = harness.generator.calls.at(-1)?.prompt ?? '';
      expect(prompt).toContain('Refinement for this pass: shorter surnames');
      expect(prompt).toContain(
        `Names already locked (do NOT repeat, but match their register): ${keeper?.name}`,
      );
    });

    it('replaces everything on a fresh run', async () => {
      const created = await createRequest();
      const keeper = created.candidates[0];

      await auth(http().patch(`${API}/requests/${created.id}/candidates/${keeper?.id}/lock`))
        .send({ locked: true })
        .expect(200);

      harness.generator.queueCandidates([{ name: 'Wren S. Calloway' }]);
      await auth(http().post(`${API}/requests/${created.id}/generate`))
        .send({})
        .expect(202);

      const regenerated = await settle(created.id);
      expect(regenerated.candidates.map((candidate) => candidate.name)).toEqual([
        'Wren S. CALLOWAY',
      ]);
    });
  });

  describe('approval', () => {
    it('approves the proposed name and stamps the approver', async () => {
      const created = await createRequest();

      const response = await auth(http().post(`${API}/requests/${created.id}/approve`))
        .send({})
        .expect(200);

      const approved = response.body as PenNameRequestDto;
      expect(approved.status).toBe(RequestStatus.Approved);
      expect(approved.approvedName).toBe(created.candidates[0]?.name);
      expect(approved.approvedByName).toBe('Rosa Marchetti');
      expect(approved.approvedAt).not.toBeNull();
    });

    it('approves a specific selected candidate from the edit view', async () => {
      const created = await createRequest();
      const second = created.candidates[1];

      const response = await auth(http().post(`${API}/requests/${created.id}/approve`))
        .send({ penName: second?.name })
        .expect(200);

      expect((response.body as PenNameRequestDto).approvedName).toBe(second?.name);
    });

    it('refuses a name that is not among the cleared candidates', async () => {
      const created = await createRequest();

      await auth(http().post(`${API}/requests/${created.id}/approve`))
        .send({ penName: 'Someone I. INVENTED' })
        .expect(400);
    });

    it('refuses approve on Failed leftovers and does not re-stamp Approved', async () => {
      const ready = await createRequest({ firstName: 'Nora', lastName: 'Vale' });
      expect(ready.candidates.length).toBeGreaterThan(0);

      harness.generator.queueFailure(new Error('upstream'));
      await auth(http().post(`${API}/requests/${ready.id}/generate`))
        .send({ regenerate: true })
        .expect(202);
      const failed = await settle(ready.id);

      expect(failed.status).toBe(RequestStatus.Failed);
      expect(failed.candidates.length).toBeGreaterThan(0);

      await auth(http().post(`${API}/requests/${failed.id}/approve`))
        .send({ penName: failed.candidates[0]?.name })
        .expect(400);

      const approved = await createRequest({ firstName: 'Ivy', lastName: 'Shaw' });
      const first = await auth(http().post(`${API}/requests/${approved.id}/approve`))
        .send({})
        .expect(200);
      const stamped = (first.body as PenNameRequestDto).approvedAt;

      await auth(http().post(`${API}/requests/${approved.id}/approve`)).send({}).expect(400);

      const listed = await auth(http().get(`${API}/requests/${approved.id}`)).expect(200);
      expect((listed.body as PenNameRequestDto).approvedAt).toBe(stamped);
    });

    it('approves every ready request at once', async () => {
      await createRequest();
      await createRequest({ firstName: 'Daniel', middleInitial: 'O', lastName: 'Reyes' });

      const response = await auth(http().post(`${API}/requests/approve-all`)).expect(200);

      expect((response.body as { approvedCount: number }).approvedCount).toBe(2);

      const list = await auth(http().get(`${API}/requests`).query({ view: 'queue' })).expect(200);
      expect((list.body as RequestListDto).items).toHaveLength(0);
    });

    it('moves an approved request into history and back out again on reopen', async () => {
      const created = await createRequest();
      await auth(http().post(`${API}/requests/${created.id}/approve`))
        .send({})
        .expect(200);

      const history = await auth(http().get(`${API}/requests`).query({ view: 'history' })).expect(
        200,
      );
      expect((history.body as RequestListDto).items).toHaveLength(1);

      const reopened = await auth(http().post(`${API}/requests/${created.id}/reopen`)).expect(200);
      const body = reopened.body as PenNameRequestDto;

      expect(body.status).toBe(RequestStatus.Ready);
      expect(body.approvedName).toBe('');
      expect(body.approvedByName).toBe('');
      expect(body.approvedAt).toBeNull();
    });

    it('refuses choose and brief updates on Approved until reopen', async () => {
      const created = await createRequest();
      await auth(http().post(`${API}/requests/${created.id}/approve`))
        .send({})
        .expect(200);

      await auth(http().post(`${API}/requests/${created.id}/choose`))
        .send({ penName: created.candidates[0]?.name ?? '' })
        .expect(400);

      await auth(http().patch(`${API}/requests/${created.id}`))
        .send({ notes: 'quiet edit after approval' })
        .expect(400);
    });
  });

  describe('selection', () => {
    it('records and clears a selected candidate', async () => {
      const created = await createRequest();
      const choice = created.candidates[1]?.name ?? '';

      const chosen = await auth(http().post(`${API}/requests/${created.id}/choose`))
        .send({ penName: choice })
        .expect(200);
      expect((chosen.body as PenNameRequestDto).chosenName).toBe(choice);

      const cleared = await auth(http().post(`${API}/requests/${created.id}/choose`))
        .send({ penName: '' })
        .expect(200);
      expect((cleared.body as PenNameRequestDto).chosenName).toBe('');
    });

    it('refuses a selection that is not a cleared candidate', async () => {
      const created = await createRequest();

      await auth(http().post(`${API}/requests/${created.id}/choose`))
        .send({ penName: 'Not A. CANDIDATE' })
        .expect(400);
    });
  });

  describe('pagination', () => {
    it('returns a page of items with total, limit and offset', async () => {
      await createRequest();
      await createRequest({ firstName: 'Daniel', middleInitial: 'O', lastName: 'Reyes' });
      await createRequest({ firstName: 'Elena', middleInitial: 'M', lastName: 'Park' });

      const first = await auth(http().get(`${API}/requests`).query({ limit: 2, offset: 0 })).expect(
        200,
      );
      const firstBody = first.body as RequestListDto;

      expect(firstBody.items).toHaveLength(2);
      expect(firstBody.total).toBe(3);
      expect(firstBody.limit).toBe(2);
      expect(firstBody.offset).toBe(0);

      const second = await auth(http().get(`${API}/requests`).query({ limit: 2, offset: 2 })).expect(
        200,
      );
      const secondBody = second.body as RequestListDto;

      expect(secondBody.items).toHaveLength(1);
      expect(secondBody.total).toBe(3);
      expect(secondBody.offset).toBe(2);
    });

    it('clamps limit to REQUESTS_LIST_MAX_LIMIT', async () => {
      const response = await auth(http().get(`${API}/requests`).query({ limit: 500 })).expect(200);
      const body = response.body as RequestListDto;
      const config = harness.app.get(ConfigService<AppConfig, true>);

      expect(body.limit).toBe(config.get('requests', { infer: true }).listMaxLimit);
    });
  });

  describe('rate limits', () => {
    async function fillBucket(key: 'list' | 'create' | 'generate' | 'approveAll'): Promise<void> {
      const limiter = harness.app.get(RateLimiter);
      const rateLimit = harness.app.get(ConfigService<AppConfig, true>).get('rateLimit', {
        infer: true,
      });
      const limit = rateLimit[key];
      const bucketKey = `${key === 'approveAll' ? 'approve-all' : key}:${harness.user.id}`;
      for (let i = 0; i < limit; i++) {
        await limiter.consume(bucketKey, limit, rateLimit.windowMs);
      }
    }

    it('returns 429 when list is over the per-user limit', async () => {
      await fillBucket('list');

      await auth(http().get(`${API}/requests`)).expect(429);
    });

    it('returns 429 when generate is over the per-user limit', async () => {
      const created = await createRequest();
      await fillBucket('generate');

      await auth(http().post(`${API}/requests/${created.id}/generate`))
        .send({})
        .expect(429);
    });

    it('returns 429 when approve-all is over the per-user limit', async () => {
      await createRequest();
      await fillBucket('approveAll');

      await auth(http().post(`${API}/requests/approve-all`)).expect(429);
    });

    it('returns 429 when create is over the per-user limit', async () => {
      await fillBucket('create');

      await auth(http().post(`${API}/requests`))
        .send({
          firstName: 'Margaret',
          middleInitial: 'E',
          lastName: 'Voss',
          presentation: 'Female',
        })
        .expect(429);
    });
  });

  describe('search', () => {
    it('matches on the legal name, a candidate, the origin and the notes', async () => {
      harness.generator.queueCandidates([{ name: 'Bridget C. Ashworth' }]);
      await createRequest();
      harness.generator.queueCandidates([{ name: 'Wren S. Calloway' }]);
      await createRequest({
        firstName: 'Daniel',
        middleInitial: 'O',
        lastName: 'Reyes',
        origin: '',
        notes: 'Techno-thriller',
      });

      const byAuthor = await auth(http().get(`${API}/requests`).query({ q: 'voss' })).expect(200);
      expect((byAuthor.body as RequestListDto).items).toHaveLength(1);

      const byCandidate = await auth(http().get(`${API}/requests`).query({ q: 'calloway' })).expect(
        200,
      );
      expect((byCandidate.body as RequestListDto).items).toHaveLength(1);

      const byOrigin = await auth(http().get(`${API}/requests`).query({ q: 'anglo' })).expect(200);
      expect((byOrigin.body as RequestListDto).items).toHaveLength(1);

      const byNotes = await auth(http().get(`${API}/requests`).query({ q: 'thriller' })).expect(
        200,
      );
      expect((byNotes.body as RequestListDto).items).toHaveLength(1);
    });

    it('keeps a matching request whole rather than pruning its other candidates', async () => {
      await createRequest();

      const response = await auth(http().get(`${API}/requests`).query({ q: 'quintrell' })).expect(
        200,
      );
      const items = (response.body as RequestListDto).items;

      expect(items).toHaveLength(1);
      expect(items[0]?.candidates.length).toBeGreaterThan(1);
    });

    it('treats % and _ as literal characters, not ILIKE wildcards', async () => {
      await createRequest({ notes: 'Roughly 50% complete.' });
      await createRequest({
        firstName: 'Daniel',
        middleInitial: 'O',
        lastName: 'Reyes',
        notes: 'No percent here.',
      });

      const byPercent = await auth(http().get(`${API}/requests`).query({ q: '%' })).expect(200);
      expect((byPercent.body as RequestListDto).items).toHaveLength(1);
      expect((byPercent.body as RequestListDto).items[0]?.notes).toContain('50%');

      const byUnderscore = await auth(http().get(`${API}/requests`).query({ q: '_' })).expect(200);
      expect((byUnderscore.body as RequestListDto).items).toHaveLength(0);
    });

    it('reports how many matches sit on the other tab', async () => {
      const first = await createRequest();
      await auth(http().post(`${API}/requests/${first.id}/approve`))
        .send({})
        .expect(200);
      await createRequest({ firstName: 'Daniel', middleInitial: 'O', lastName: 'Reyes' });

      const response = await auth(http().get(`${API}/requests`).query({ view: 'queue' })).expect(
        200,
      );
      const body = response.body as RequestListDto;

      expect(body.queueMatchCount).toBe(1);
      expect(body.historyMatchCount).toBe(1);
      expect(body.items).toHaveLength(1);
    });
  });

  describe('prompt settings', () => {
    it('returns the auto-composed prompt for a request', async () => {
      const created = await createRequest();

      const response = await auth(http().get(`${API}/requests/${created.id}/prompt`)).expect(200);
      const body = response.body as { prompt: string; system: string; isCustom: boolean };

      expect(body.isCustom).toBe(false);
      expect(body.prompt).toContain('Author legal name: Margaret E. Voss');
      expect(body.system).toContain('naming assistant for a publishing house');
    });

    it('sends a saved override verbatim on the next run', async () => {
      const created = await createRequest();

      await auth(http().patch(`${API}/requests/${created.id}/prompt`))
        .send({ system: 'Custom system.', prompt: 'Custom prompt, sent as-is.' })
        .expect(200);

      await auth(http().post(`${API}/requests/${created.id}/generate`))
        .send({})
        .expect(202);
      await settle(created.id);

      expect(harness.generator.calls.at(-1)).toEqual({
        system: 'Custom system.',
        prompt: 'Custom prompt, sent as-is.',
      });
    });

    it('treats saving the default text as no override at all', async () => {
      const created = await createRequest();
      const current = await auth(http().get(`${API}/requests/${created.id}/prompt`)).expect(200);
      const body = current.body as { prompt: string; system: string };

      const saved = await auth(http().patch(`${API}/requests/${created.id}/prompt`))
        .send({ system: body.system, prompt: body.prompt })
        .expect(200);

      expect((saved.body as { isCustom: boolean }).isCustom).toBe(false);
    });

    it('restores brief-driven composition on reset', async () => {
      const created = await createRequest();

      await auth(http().patch(`${API}/requests/${created.id}/prompt`))
        .send({ system: 'Custom system.', prompt: 'Custom prompt.' })
        .expect(200);

      const reset = await auth(http().delete(`${API}/requests/${created.id}/prompt`)).expect(200);
      const body = reset.body as { isCustom: boolean; prompt: string };

      expect(body.isCustom).toBe(false);
      expect(body.prompt).toContain('Author legal name: Margaret E. Voss');
    });

    it('keeps an override scoped to the request it was saved on', async () => {
      const overridden = await createRequest();
      const other = await createRequest({
        firstName: 'James',
        middleInitial: 'T',
        lastName: 'Harlow',
        presentation: 'Male',
        origin: '',
        notes: '',
      });

      await auth(http().patch(`${API}/requests/${overridden.id}/prompt`))
        .send({ system: 'Custom system.', prompt: 'Custom prompt, only for this brief.' })
        .expect(200);

      const otherPrompt = await auth(http().get(`${API}/requests/${other.id}/prompt`)).expect(200);
      expect((otherPrompt.body as { isCustom: boolean; prompt: string }).isCustom).toBe(false);
      expect((otherPrompt.body as { prompt: string }).prompt).toContain(
        'Author legal name: James T. Harlow',
      );

      await auth(http().post(`${API}/requests/${other.id}/generate`)).send({}).expect(202);
      await settle(other.id);

      expect(harness.generator.calls.at(-1)?.prompt).toContain(
        'Author legal name: James T. Harlow',
      );
      expect(harness.generator.calls.at(-1)?.prompt).not.toBe(
        'Custom prompt, only for this brief.',
      );
    });
  });

  describe('deletion', () => {
    it('removes the request and its candidates', async () => {
      const created = await createRequest();

      await auth(http().delete(`${API}/requests/${created.id}`)).expect(204);
      await auth(http().get(`${API}/requests/${created.id}`)).expect(404);

      const orphans = await harness.dataSource.query<{ count: string }[]>(
        'SELECT COUNT(*)::text AS count FROM candidates WHERE "requestId" = $1',
        [created.id],
      );
      expect(orphans[0]?.count).toBe('0');
    });

    it('404s when the request is already gone', async () => {
      await auth(http().delete(`${API}/requests/1b3c1a5e-0000-4000-8000-000000000000`)).expect(404);
    });

    it('400s on an id that is not a UUID', async () => {
      await auth(http().get(`${API}/requests/not-a-uuid`)).expect(400);
    });
  });
});
