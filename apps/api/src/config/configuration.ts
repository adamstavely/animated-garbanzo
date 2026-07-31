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

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    API_PREFIX: z.string().default('api/v1'),

    /** Origin allowed to call the API with credentials, i.e. the Angular app. */
    WEB_ORIGIN: z.string().url().default('http://localhost:4200'),
    /** Where the OIDC callback sends the browser once a session exists. */
    WEB_APP_URL: z.string().url().default('http://localhost:4200'),

    DATABASE_URL: z.string().min(1),
    /** Required true in production; plaintext DB traffic is refused there. */
    DATABASE_SSL: booleanish.default('false'),
    /**
     * Verify the database TLS certificate when DATABASE_SSL is on.
     * Set false only as a local break-glass for self-signed hosts; refused in
     * production.
     */
    DATABASE_SSL_REJECT_UNAUTHORIZED: booleanish.default('true'),
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
    /** Claim names differ per IdP (Entra, Okta, Auth0, Keycloak), so they are configurable. */
    OIDC_NAME_CLAIM: z.string().default('name'),
    OIDC_EMAIL_CLAIM: z.string().default('email'),
    OIDC_ROLE_CLAIM: z.string().default('role'),
    OIDC_DEFAULT_ROLE: z.string().default('Publishing assistant'),
    /**
     * Comma-separated IdP role values that may delete requests, bulk-approve, and
     * rewrite the global prompt. Empty in production means nobody can; empty
     * outside production keeps the local desk open.
     */
    OIDC_ADMIN_ROLES: z.string().default(''),

    /** Signs the httpOnly session cookie issued after a successful OIDC exchange. */
    SESSION_SECRET: z.string().min(32),
    SESSION_COOKIE_NAME: z.string().default('nym_session'),
    /** Session JWT and cookie lifetime; default 8 hours. There is no sign-out. */
    SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(28_800),
    SESSION_COOKIE_SECURE: booleanish.default('true'),
    SESSION_COOKIE_DOMAIN: z.string().optional(),
    /**
     * Express trust-proxy hop count when the API sits behind a reverse proxy
     * (so `req.ip` / `req.protocol` reflect the client). `0` means do not trust
     * forwarded headers — the right default for local development. The OIDC
     * code exchange never reads Host / X-Forwarded-*; it uses OIDC_REDIRECT_URI.
     */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    /**
     * How long a request may stay in `generating` before being marked failed.
     * Defaults to the model timeout plus a small grace window.
     */
    GENERATION_STALE_MS: z.coerce.number().int().positive().optional(),
    /** Default / max page size for request lists. */
    REQUESTS_LIST_DEFAULT_LIMIT: z.coerce.number().int().positive().default(100),
    REQUESTS_LIST_MAX_LIMIT: z.coerce.number().int().positive().default(200),
    /** Cap for a single Approve-all call. */
    REQUESTS_APPROVE_ALL_LIMIT: z.coerce.number().int().positive().default(50),
    /** Per-user sliding windows for create / generate / approve-all. */
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_CREATE: z.coerce.number().int().positive().default(30),
    RATE_LIMIT_GENERATE: z.coerce.number().int().positive().default(20),
    RATE_LIMIT_APPROVE_ALL: z.coerce.number().int().positive().default(5),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') {
      return;
    }

    if (value.DATABASE_SYNCHRONIZE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_SYNCHRONIZE'],
        message: 'must be false in production; use migrations',
      });
    }

    if (!value.SESSION_COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_COOKIE_SECURE'],
        message: 'must be true in production',
      });
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
  });

export type Environment = z.infer<typeof environmentSchema>;

export interface AppConfig {
  nodeEnv: Environment['NODE_ENV'];
  isProduction: boolean;
  port: number;
  apiPrefix: string;
  webOrigin: string;
  webAppUrl: string;
  /** Express `trust proxy` hop count; `0` leaves the setting unset. */
  trustProxy: number;
  database: {
    url: string;
    ssl: boolean;
    sslRejectUnauthorized: boolean;
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
    nameClaim: string;
    emailClaim: string;
    roleClaim: string;
    defaultRole: string;
    adminRoles: string[];
  };
  session: {
    secret: string;
    cookieName: string;
    ttlSeconds: number;
    secureCookie: boolean;
    cookieDomain?: string;
  };
  generation: {
    staleMs: number;
  };
  requests: {
    listDefaultLimit: number;
    listMaxLimit: number;
    approveAllLimit: number;
  };
  rateLimit: {
    windowMs: number;
    create: number;
    generate: number;
    approveAll: number;
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
  const adminRoles = value.OIDC_ADMIN_ROLES.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    nodeEnv: value.NODE_ENV,
    isProduction: value.NODE_ENV === 'production',
    port: value.PORT,
    apiPrefix: value.API_PREFIX,
    webOrigin: value.WEB_ORIGIN,
    webAppUrl: value.WEB_APP_URL,
    trustProxy: value.TRUST_PROXY,
    database: {
      url: value.DATABASE_URL,
      ssl: value.DATABASE_SSL,
      sslRejectUnauthorized: value.DATABASE_SSL_REJECT_UNAUTHORIZED,
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
      nameClaim: value.OIDC_NAME_CLAIM,
      emailClaim: value.OIDC_EMAIL_CLAIM,
      roleClaim: value.OIDC_ROLE_CLAIM,
      defaultRole: value.OIDC_DEFAULT_ROLE,
      adminRoles,
    },
    session: {
      secret: value.SESSION_SECRET,
      cookieName: value.SESSION_COOKIE_NAME,
      ttlSeconds: value.SESSION_TTL_SECONDS,
      secureCookie: value.SESSION_COOKIE_SECURE,
      cookieDomain: value.SESSION_COOKIE_DOMAIN,
    },
    generation: {
      staleMs: value.GENERATION_STALE_MS ?? value.ANTHROPIC_TIMEOUT_MS + 30_000,
    },
    requests: {
      listDefaultLimit: value.REQUESTS_LIST_DEFAULT_LIMIT,
      listMaxLimit: Math.max(value.REQUESTS_LIST_MAX_LIMIT, value.REQUESTS_LIST_DEFAULT_LIMIT),
      approveAllLimit: value.REQUESTS_APPROVE_ALL_LIMIT,
    },
    rateLimit: {
      windowMs: value.RATE_LIMIT_WINDOW_MS,
      create: value.RATE_LIMIT_CREATE,
      generate: value.RATE_LIMIT_GENERATE,
      approveAll: value.RATE_LIMIT_APPROVE_ALL,
    },
  };
}
