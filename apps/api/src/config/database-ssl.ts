import { z } from 'zod';

/**
 * DB TLS flags shared by app boot and the migrate CLI.
 *
 * The TypeORM data source cannot load the full environment schema (OIDC keys,
 * Anthropic, session secret, …), but production must still refuse plaintext
 * and unverified TLS — the same guards as `environmentSchema`.
 */
const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const databaseSslSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_SSL: booleanish.default('false'),
    DATABASE_SSL_REJECT_UNAUTHORIZED: booleanish.default('true'),
  })
  .superRefine((value, ctx) => {
    addProductionDatabaseSslIssues(value, ctx);
  });

/** Production-only SSL issues — kept in one place for boot and migrate. */
export function addProductionDatabaseSslIssues(
  value: {
    NODE_ENV: string;
    DATABASE_SSL: boolean;
    DATABASE_SSL_REJECT_UNAUTHORIZED: boolean;
  },
  ctx: z.RefinementCtx,
): void {
  if (value.NODE_ENV !== 'production') {
    return;
  }

  if (!value.DATABASE_SSL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_SSL'],
      message: 'must be true in production',
    });
  }

  if (!value.DATABASE_SSL_REJECT_UNAUTHORIZED) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_SSL_REJECT_UNAUTHORIZED'],
      message: 'must be true in production',
    });
  }
}

/** TypeORM `ssl` option: false, or verify settings when TLS is on. */
export function resolveTypeOrmSsl(
  env: NodeJS.ProcessEnv = process.env,
): false | { rejectUnauthorized: boolean } {
  const parsed = databaseSslSchema.safeParse({
    NODE_ENV: env.NODE_ENV,
    DATABASE_SSL: env.DATABASE_SSL,
    DATABASE_SSL_REJECT_UNAUTHORIZED: env.DATABASE_SSL_REJECT_UNAUTHORIZED,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid database SSL configuration:\n${details}`);
  }

  return parsed.data.DATABASE_SSL
    ? { rejectUnauthorized: parsed.data.DATABASE_SSL_REJECT_UNAUTHORIZED }
    : false;
}
