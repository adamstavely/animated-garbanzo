import { HttpException, HttpStatus } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { RateLimiter } from './rate-limiter';

/** In-memory stand-in for the Postgres-backed sliding window used in unit tests. */
function createMemoryDataSource(): DataSource {
  const hits = new Map<string, number[]>();

  const manager = {
    async query(sql: string, params: unknown[] = []): Promise<unknown> {
      if (sql.includes('pg_advisory_xact_lock')) {
        return [];
      }

      if (sql.includes('DELETE FROM "rate_limit_hits"')) {
        const [key, cutoff] = params as [string, Date];
        const cutoffMs = cutoff.getTime();
        hits.set(
          key,
          (hits.get(key) ?? []).filter((stamp) => stamp >= cutoffMs),
        );
        return [];
      }

      if (sql.includes('SELECT COUNT(*)')) {
        const [key] = params as [string];
        return [{ count: hits.get(key)?.length ?? 0 }];
      }

      if (sql.includes('INSERT INTO "rate_limit_hits"')) {
        const [key, stampedAt] = params as [string, Date];
        const list = hits.get(key) ?? [];
        list.push(stampedAt.getTime());
        hits.set(key, list);
        return [];
      }

      throw new Error(`Unexpected SQL in rate-limiter test double: ${sql}`);
    },
  } as unknown as EntityManager;

  return {
    transaction: async <T>(run: (entityManager: EntityManager) => Promise<T>): Promise<T> =>
      run(manager),
  } as unknown as DataSource;
}

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(createMemoryDataSource());
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-31T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows up to the limit within the window', async () => {
    await expect(limiter.consume('user-a', 2, 60_000)).resolves.toBeUndefined();
    await expect(limiter.consume('user-a', 2, 60_000)).resolves.toBeUndefined();
  });

  it('rejects the next call once the limit is reached', async () => {
    await limiter.consume('user-a', 2, 60_000);
    await limiter.consume('user-a', 2, 60_000);

    await expect(limiter.consume('user-a', 2, 60_000)).rejects.toBeInstanceOf(HttpException);

    try {
      await limiter.consume('user-a', 2, 60_000);
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((error as HttpException).message).toMatch(/Too many requests/);
    }
  });

  it('tracks keys independently', async () => {
    await limiter.consume('user-a', 1, 60_000);
    await expect(limiter.consume('user-b', 1, 60_000)).resolves.toBeUndefined();
    await expect(limiter.consume('user-a', 1, 60_000)).rejects.toBeInstanceOf(HttpException);
  });

  it('forgets stamps that fall outside the window', async () => {
    await limiter.consume('user-a', 1, 1_000);
    jest.advanceTimersByTime(1_001);
    await expect(limiter.consume('user-a', 1, 1_000)).resolves.toBeUndefined();
  });
});
