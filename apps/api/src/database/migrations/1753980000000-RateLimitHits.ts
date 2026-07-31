import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Shared sliding-window rate-limit stamps for create / generate / approve-all.
 */
export class RateLimitHits1753980000000 implements MigrationInterface {
  name = 'RateLimitHits1753980000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rate_limit_hits" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "bucketKey" character varying(160) NOT NULL,
        "stampedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "pk_rate_limit_hits" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_rate_limit_hits_key_stamped" ON "rate_limit_hits" ("bucketKey", "stampedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_rate_limit_hits_key_stamped"`);
    await queryRunner.query(`DROP TABLE "rate_limit_hits"`);
  }
}
