import { config as loadDotenv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

import {
  CandidateEntity,
  PenNameRequestEntity,
  PromptSettingsEntity,
  RateLimitHitEntity,
  UserEntity,
} from './entities';
import { InitialSchema1753920000000 } from './migrations/1753920000000-InitialSchema';
import { RateLimitHits1753980000000 } from './migrations/1753980000000-RateLimitHits';
import { AddGenerationRunId1754000000000 } from './migrations/1754000000000-AddGenerationRunId';

// `quiet` keeps the CLI and test output free of dotenv's banner.
loadDotenv({ quiet: true });

export const ENTITIES = [
  UserEntity,
  PenNameRequestEntity,
  CandidateEntity,
  PromptSettingsEntity,
  RateLimitHitEntity,
] as const;

export const MIGRATIONS = [
  InitialSchema1753920000000,
  RateLimitHits1753980000000,
  AddGenerationRunId1754000000000,
] as const;

/**
 * Options shared by the running app and the TypeORM CLI, so migrations are
 * generated against exactly the schema the app boots with.
 */
export function buildDataSourceOptions(
  overrides: Partial<DataSourceOptions> = {},
): DataSourceOptions {
  return {
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? {
            // Default to verifying the server cert; set
            // DATABASE_SSL_REJECT_UNAUTHORIZED=false only for local self-signed hosts.
            rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
          }
        : false,
    entities: [...ENTITIES],
    migrations: [...MIGRATIONS],
    migrationsTableName: 'nym_migrations',
    synchronize: false,
    logging: process.env.DATABASE_LOGGING === 'true',
    ...overrides,
  } as DataSourceOptions;
}

/** Default export consumed by `typeorm migration:*`. */
export default new DataSource(buildDataSourceOptions());
