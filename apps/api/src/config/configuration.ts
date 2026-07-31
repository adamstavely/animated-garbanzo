import { z } from 'zod';

/**
 * Environment contract for the API.
 *
 * Everything the service needs is declared here and validated once at boot, so a
 * misconfigured deployment fails immediately with a readable message instead of
 * throwing somewhere deep in a request handler.
 */
const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('api/v1'),

  /** Origin allowed to call the API with credentials, i.e. the Angular app. */
  WEB_ORIGIN: z.string().url().default('http://localhost:4200'),
  /** Where the OIDC callback sends the browser once a session exists. */
  WEB_APP_URL: z.string().url().default('http://localhost:4200'),

  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: booleanish.default('false'),
  /** Never enable outside local development; migrations are the supported path. */
  DATABASE_SYNCHRONIZE: booleanish.default('false'),
  DATABASE_LOGGING: booleanish.default('false'),

  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5'),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().int().positive().default(3000),
  ANTHROPIC_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  ANTHROPIC_MAX_RETRIES: z.coerce.number().int().min(0).default(2),

  OIDC_ISSUER_URL: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),
  OIDC_REDIRECT_URI: z.string().url(),
  OIDC_SCOPES: z.string().default('openid profile email'),
  OIDC_POST_LOGOUT_REDIRECT_URI: z.string().url().optional(),
  /** Claim names differ per IdP (Entra, Okta, Auth0, Keycloak), so they are configurable. */
  OIDC_NAME_CLAIM: z.string().default('name'),
  OIDC_EMAIL_CLAIM: z.string().default('email'),
  OIDC_ROLE_CLAIM: z.string().default('role'),
  OIDC_DEFAULT_ROLE: z.string().default('Publishing assistant'),

  /** Signs the httpOnly session cookie issued after a successful OIDC exchange. */
  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().default('nym_session'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(28_800),
  SESSION_COOKIE_SECURE: booleanish.default('true'),
  SESSION_COOKIE_DOMAIN: z.string().optional(),
});

export type Environment = z.infer<typeof environmentSchema>;

export interface AppConfig {
  nodeEnv: Environment['NODE_ENV'];
  isProduction: boolean;
  port: number;
  apiPrefix: string;
  webOrigin: string;
  webAppUrl: string;
  database: {
    url: string;
    ssl: boolean;
    synchronize: boolean;
    logging: boolean;
  };
  anthropic: {
    apiKey: string;
    model: string;
    maxTokens: number;
    timeoutMs: number;
    maxRetries: number;
  };
  oidc: {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string;
    postLogoutRedirectUri?: string;
    nameClaim: string;
    emailClaim: string;
    roleClaim: string;
    defaultRole: string;
  };
  session: {
    secret: string;
    cookieName: string;
    ttlSeconds: number;
    secureCookie: boolean;
    cookieDomain?: string;
  };
}

/**
 * Validates `process.env` and shapes it into the nested config the app injects.
 * Registered as the single `load` function of `ConfigModule`.
 */
export function loadConfiguration(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const value = parsed.data;

  return {
    nodeEnv: value.NODE_ENV,
    isProduction: value.NODE_ENV === 'production',
    port: value.PORT,
    apiPrefix: value.API_PREFIX,
    webOrigin: value.WEB_ORIGIN,
    webAppUrl: value.WEB_APP_URL,
    database: {
      url: value.DATABASE_URL,
      ssl: value.DATABASE_SSL,
      synchronize: value.DATABASE_SYNCHRONIZE,
      logging: value.DATABASE_LOGGING,
    },
    anthropic: {
      apiKey: value.ANTHROPIC_API_KEY,
      model: value.ANTHROPIC_MODEL,
      maxTokens: value.ANTHROPIC_MAX_TOKENS,
      timeoutMs: value.ANTHROPIC_TIMEOUT_MS,
      maxRetries: value.ANTHROPIC_MAX_RETRIES,
    },
    oidc: {
      issuerUrl: value.OIDC_ISSUER_URL,
      clientId: value.OIDC_CLIENT_ID,
      clientSecret: value.OIDC_CLIENT_SECRET,
      redirectUri: value.OIDC_REDIRECT_URI,
      scopes: value.OIDC_SCOPES,
      postLogoutRedirectUri: value.OIDC_POST_LOGOUT_REDIRECT_URI,
      nameClaim: value.OIDC_NAME_CLAIM,
      emailClaim: value.OIDC_EMAIL_CLAIM,
      roleClaim: value.OIDC_ROLE_CLAIM,
      defaultRole: value.OIDC_DEFAULT_ROLE,
    },
    session: {
      secret: value.SESSION_SECRET,
      cookieName: value.SESSION_COOKIE_NAME,
      ttlSeconds: value.SESSION_TTL_SECONDS,
      secureCookie: value.SESSION_COOKIE_SECURE,
      cookieDomain: value.SESSION_COOKIE_DOMAIN,
    },
  };
}
