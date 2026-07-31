import 'reflect-metadata';

import dataSource from './data-source';

/**
 * Runs pending migrations and exits.
 *
 * A compiled entry point rather than the TypeORM CLI: the production image has
 * no dev dependencies and a read-only root filesystem, so neither `ts-node` nor
 * `npm run` is available to a container. `node dist/database/migrate.js` needs
 * nothing but the runtime, DATABASE_URL, and DATABASE_SSL (required in
 * production — same guards as app boot).
 *
 * Migrations run in a single transaction, so a failure part-way leaves the
 * schema exactly as it was and the release hook fails loudly.
 */
async function main(): Promise<void> {
  const source = await dataSource.initialize();

  try {
    const applied = await source.runMigrations({ transaction: 'all' });

    if (applied.length === 0) {
      console.log('No pending migrations; the schema is up to date.');
      return;
    }

    console.log(`Applied ${applied.length} migration(s):`);
    for (const migration of applied) {
      console.log(`  - ${migration.name}`);
    }
  } finally {
    await source.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
