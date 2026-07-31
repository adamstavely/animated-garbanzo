import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial Nym schema: users mirrored from the IdP, pen name requests, their
 * screened candidates, and the singleton prompt settings row.
 */
export class InitialSchema1753920000000 implements MigrationInterface {
  name = 'InitialSchema1753920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "subject" character varying(255) NOT NULL,
        "email" character varying(320) NOT NULL,
        "name" character varying(255) NOT NULL,
        "role" character varying(255) NOT NULL,
        "lastLoginAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_users_subject" ON "users" ("subject")`);

    await queryRunner.query(`
      CREATE TABLE "pen_name_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "legalName" character varying(255) NOT NULL,
        "presentation" character varying(16) NOT NULL,
        "origin" character varying(120) NOT NULL DEFAULT '',
        "notes" text NOT NULL DEFAULT '',
        "refine" text NOT NULL DEFAULT '',
        "status" character varying(16) NOT NULL DEFAULT 'queued',
        "chosenName" character varying(255) NOT NULL DEFAULT '',
        "approvedName" character varying(255) NOT NULL DEFAULT '',
        "approvedByName" character varying(255) NOT NULL DEFAULT '',
        "approvedById" uuid,
        "approvedAt" TIMESTAMP WITH TIME ZONE,
        "discardedCount" integer NOT NULL DEFAULT 0,
        "errorMessage" text NOT NULL DEFAULT '',
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_pen_name_requests" PRIMARY KEY ("id"),
        CONSTRAINT "chk_requests_presentation" CHECK ("presentation" IN ('Female', 'Male', 'Unisex')),
        CONSTRAINT "chk_requests_status" CHECK ("status" IN ('queued', 'generating', 'ready', 'approved', 'failed'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_requests_status_created" ON "pen_name_requests" ("status", "createdAt")`,
    );
    await queryRunner.query(`
      ALTER TABLE "pen_name_requests"
        ADD CONSTRAINT "fk_requests_approved_by" FOREIGN KEY ("approvedById")
        REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "pen_name_requests"
        ADD CONSTRAINT "fk_requests_created_by" FOREIGN KEY ("createdById")
        REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "candidates" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "requestId" uuid NOT NULL,
        "name" character varying(255) NOT NULL,
        "pronunciation" character varying(255) NOT NULL DEFAULT '',
        "origin" character varying(500) NOT NULL DEFAULT '',
        "locked" boolean NOT NULL DEFAULT false,
        "position" integer NOT NULL DEFAULT 0,
        CONSTRAINT "pk_candidates" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_candidates_request" ON "candidates" ("requestId")`);
    await queryRunner.query(`
      ALTER TABLE "candidates"
        ADD CONSTRAINT "fk_candidates_request" FOREIGN KEY ("requestId")
        REFERENCES "pen_name_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "prompt_settings" (
        "id" character varying(32) NOT NULL,
        "systemOverride" text,
        "promptOverride" text,
        "updatedById" uuid,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_prompt_settings" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `INSERT INTO "prompt_settings" ("id", "systemOverride", "promptOverride") VALUES ('default', NULL, NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "prompt_settings"`);
    await queryRunner.query(`DROP TABLE "candidates"`);
    await queryRunner.query(`DROP TABLE "pen_name_requests"`);
    await queryRunner.query(`DROP INDEX "idx_users_subject"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
