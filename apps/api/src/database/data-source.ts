import { config as loadDotenv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

import { resolveTypeOrmSsl } from '../config/database-ssl';
import {
  CandidateEntity,
  PenNameRequestEntity,
  RateLimitHitEntity,
  UserEntity,
} from './entities';
import { InitialSchema1753920000000 } from './migrations/1753920000000-InitialSchema';
import { RateLimitHits1753980000000 } from './migrations/1753980000000-RateLimitHits';
import { AddGenerationRunId1754000000000 } from './migrations/1754000000000-AddGenerationRunId';
import { PerRequestPromptOverrides1754010000000 } from './migrations/1754010000000-PerRequestPromptOverrides';

// `quiet` keeps the CLI and test output free of dotenv's banner.
loadDotenv({ quiet: true });

export const ENTITIES = [
  UserEntity,
  PenNameRequestEntity,
  CandidateEntity,
  RateLimitHitEntity,
] as const;

export const MIGRATIONS = [
  InitialSchema1753920000000,
  RateLimitHits1753980000000,
  AddGenerationRunId1754000000000,
  PerRequestPromptOverrides1754010000000,
] as const;

/**
 * Options shared by the running app and the TypeORM CLI, so migrations are
 * generated against exactly the schema the app boots with.
 *
 * SSL uses the same production guards as app boot — migrate must not talk
 * plaintext when DATABASE_SSL is omitted in production.
 */
export function buildDataSourceOptions(
  overrides: Partial<DataSourceOptions> = {},
  env: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    ssl: resolveTypeOrmSsl(env),
    entities: [...ENTITIES],
    migrations: [...MIGRATIONS],
    migrationsTableName: 'nym_migrations',
    synchronize: false,
    logging: env.DATABASE_LOGGING === 'true',
    ...overrides,
  } as DataSourceOptions;
}

/** Default export consumed by `typeorm migration:*`. */
export default new DataSource(buildDataSourceOptions());
