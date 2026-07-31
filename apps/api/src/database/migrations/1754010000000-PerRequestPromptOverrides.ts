import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moves prompt/system overrides from the desk-wide singleton onto each request
 * so editing one brief cannot rewrite every subsequent generation.
 */
export class PerRequestPromptOverrides1754010000000 implements MigrationInterface {
  name = 'PerRequestPromptOverrides1754010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pen_name_requests"
        ADD "systemOverride" text,
        ADD "promptOverride" text
    `);
    await queryRunner.query(`DROP TABLE "prompt_settings"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(`
      INSERT INTO "prompt_settings" ("id", "systemOverride", "promptOverride")
      VALUES ('default', NULL, NULL)
    `);
    await queryRunner.query(`
      ALTER TABLE "pen_name_requests"
        DROP COLUMN "systemOverride",
        DROP COLUMN "promptOverride"
    `);
  }
}
