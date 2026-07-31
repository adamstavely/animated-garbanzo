import { CurrentUserDto } from '@nym/shared';
import { Server } from 'node:http';

import request from 'supertest';

import { UserEntity } from '../src/database/entities';
import { TestHarness, createTestHarness } from './test-app';

const API = '/api/v1';

/**
 * The session boundary: every endpoint is closed by default, and the OIDC
 * round-trip is what opens it.
 */
describe('Authentication (integration)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    harness.oidc.exchangeError = null;
  });

  const http = () => request(harness.app.getHttpServer() as Server);

  /** Normalises the Set-Cookie header, which supertest types as string. */
  function toCookieList(header: unknown): string[] {
    if (Array.isArray(header)) {
      return header as string[];
    }
    return typeof header === 'string' ? [header] : [];
  }

  /** Pulls a named cookie out of a Set-Cookie header collection. */
  function cookieValue(headers: string[], name: string): string | undefined {
    return headers.find((entry) => entry.startsWith(`${name}=`));
  }

  describe('the guard', () => {
    it.each([
      ['get', `${API}/requests`],
      ['get', `${API}/auth/me`],
      ['post', `${API}/requests/approve-all`],
    ])('rejects an unauthenticated %s %s', async (method, url) => {
      await (http() as unknown as Record<string, (u: string) => request.Test>)
        [method](url)
        .expect(401);
    });

    it('rejects a cookie signed with the wrong secret', async () => {
      // header.payload.signature, correctly shaped but not ours.
      const forged =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdHRhY2tlciJ9.ZmFrZS1zaWduYXR1cmU';

      await http().get(`${API}/auth/me`).set('Cookie', `nym_session=${forged}`).expect(401);
    });

    it('accepts a valid session', async () => {
      const response = await http()
        .get(`${API}/auth/me`)
        .set('Cookie', harness.sessionCookie)
        .expect(200);

      expect(response.body as CurrentUserDto).toMatchObject({
        name: 'Rosa Marchetti',
        initials: 'RM',
        role: 'Publishing assistant · Trade',
      });
    });

    it('leaves both health probes open', async () => {
      await http().get(`${API}/health`).expect(200);
      await http().get(`${API}/health/live`).expect(200);
    });

    it('answers liveness without touching the database', async () => {
      // Readiness owns the database check; liveness must stay independent of it
      // so a database blip cannot restart every pod at once.
      const response = await http().get(`${API}/health/live`).expect(200);

      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('the sign-in flow', () => {
    it('redirects to the provider and stores the transaction in a cookie', async () => {
      const response = await http().get(`${API}/auth/login`).expect(302);

      expect(response.headers['location']).toBe('https://issuer.test/authorize?state=abc');

      const transaction = cookieValue(toCookieList(response.headers['set-cookie']), 'nym_oidc_tx');
      expect(transaction).toBeDefined();
      expect(transaction).toContain('HttpOnly');
    });

    it('exchanges the code, provisions the user and issues a session', async () => {
      const login = await http().get(`${API}/auth/login`).expect(302);
      const transactionCookie = cookieValue(
        toCookieList(login.headers['set-cookie']),
        'nym_oidc_tx',
      );

      harness.oidc.profile = {
        subject: 'test|new-hire',
        name: 'Elena Fischer',
        email: 'elena.fischer@example.com',
        role: 'Publishing assistant · Fiction',
      };

      const callback = await http()
        .get(`${API}/auth/callback?code=abc&state=state-value`)
        .set('Cookie', transactionCookie ?? '')
        .expect(302);

      expect(callback.headers['location']).toBe('http://localhost:4200');

      const session = cookieValue(toCookieList(callback.headers['set-cookie']), 'nym_session');
      expect(session).toContain('HttpOnly');

      const me = await http()
        .get(`${API}/auth/me`)
        .set('Cookie', session?.split(';')[0] ?? '')
        .expect(200);

      expect(me.body as CurrentUserDto).toMatchObject({
        name: 'Elena Fischer',
        email: 'elena.fischer@example.com',
        initials: 'EF',
      });

      const stored = await harness.dataSource
        .getRepository(UserEntity)
        .findOne({ where: { subject: 'test|new-hire' } });
      expect(stored?.lastLoginAt).not.toBeNull();
    });

    it('refreshes an existing user rather than duplicating them', async () => {
      const users = harness.dataSource.getRepository(UserEntity);

      for (const name of ['Rosa Marchetti', 'Rosa Marchetti-Hall']) {
        const login = await http().get(`${API}/auth/login`).expect(302);
        const transactionCookie = cookieValue(
          toCookieList(login.headers['set-cookie']),
          'nym_oidc_tx',
        );

        harness.oidc.profile = {
          subject: 'test|rosa',
          name,
          email: 'rosa.marchetti@example.com',
          role: 'Publishing assistant · Trade',
        };

        await http()
          .get(`${API}/auth/callback?code=abc&state=state-value`)
          .set('Cookie', transactionCookie ?? '')
          .expect(302);
      }

      expect(await users.count({ where: { subject: 'test|rosa' } })).toBe(1);
      const stored = await users.findOne({ where: { subject: 'test|rosa' } });
      expect(stored?.name).toBe('Rosa Marchetti-Hall');
    });

    it('sends the browser back with a marker when the transaction has expired', async () => {
      const response = await http().get(`${API}/auth/callback?code=abc&state=state`).expect(302);

      expect(response.headers['location']).toBe('http://localhost:4200?auth=expired');
    });

    it('refuses to issue a session when the exchange fails', async () => {
      const login = await http().get(`${API}/auth/login`).expect(302);
      const transactionCookie = cookieValue(
        toCookieList(login.headers['set-cookie']),
        'nym_oidc_tx',
      );

      harness.oidc.exchangeError = new Error('state mismatch');

      const response = await http()
        .get(`${API}/auth/callback?code=abc&state=state-value`)
        .set('Cookie', transactionCookie ?? '');

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(
        cookieValue(toCookieList(response.headers['set-cookie']), 'nym_session'),
      ).toBeUndefined();
    });
  });

  describe('sign-out', () => {
    it('clears the session and reports the provider logout URL', async () => {
      harness.oidc.endSession = 'https://issuer.test/logout';

      const response = await http()
        .post(`${API}/auth/logout`)
        .set('Cookie', harness.sessionCookie)
        .expect(200);

      expect(response.body as { endSessionUrl: string }).toEqual({
        endSessionUrl: 'https://issuer.test/logout',
      });
      expect(cookieValue(toCookieList(response.headers['set-cookie']), 'nym_session')).toContain(
        'nym_session=;',
      );
    });
  });

  describe('the app picker', () => {
    it('lists the suite with Nym marked current', async () => {
      const response = await http()
        .get(`${API}/auth/apps`)
        .set('Cookie', harness.sessionCookie)
        .expect(200);

      const apps = response.body as { name: string; current: boolean }[];
      expect(apps.find((app) => app.name === 'Nym')?.current).toBe(true);
      expect(apps.filter((app) => app.current)).toHaveLength(1);
    });
  });
});
