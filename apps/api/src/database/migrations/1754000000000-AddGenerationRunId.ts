import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Durable generation run token on pen_name_requests so a late finish from a
 * reclaimed worker cannot overwrite a newer claim across API instances.
 */
export class AddGenerationRunId1754000000000 implements MigrationInterface {
  name = 'AddGenerationRunId1754000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pen_name_requests"
        ADD "generationRunId" uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pen_name_requests"
        DROP COLUMN "generationRunId"
    `);
  }
}
