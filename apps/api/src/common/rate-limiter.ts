import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Shared sliding-window limiter for list / create / generate / approve-all.
 *
 * Stamps live in Postgres (with a per-key advisory lock) so every API instance
 * draws from the same budget.
 */
@Injectable()
export class RateLimiter {
  constructor(private readonly dataSource: DataSource) {}

  async consume(key: string, limit: number, windowMs: number): Promise<void> {
    const now = Date.now();
    const cutoff = new Date(now - windowMs);
    const stampedAt = new Date(now);

    await this.dataSource.transaction(async (manager) => {
      // Serialize consumers of the same bucket across instances.
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [key]);

      await manager.query(
        `DELETE FROM "rate_limit_hits" WHERE "bucketKey" = $1 AND "stampedAt" < $2`,
        [key, cutoff],
      );

      const rows = (await manager.query(
        `SELECT COUNT(*)::int AS count FROM "rate_limit_hits" WHERE "bucketKey" = $1`,
        [key],
      )) as Array<{ count: number }>;

      if ((rows[0]?.count ?? 0) >= limit) {
        throw new HttpException(
          'Too many requests — wait a moment and try again.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await manager.query(
        `INSERT INTO "rate_limit_hits" ("bucketKey", "stampedAt") VALUES ($1, $2)`,
        [key, stampedAt],
      );
    });
  }
}
