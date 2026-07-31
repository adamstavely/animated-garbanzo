import { loadConfiguration } from './configuration';

/** A complete, valid environment; individual tests break one thing at a time. */
const validEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://nym:nym@localhost:5432/nym',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  OIDC_ISSUER_URL: 'https://issuer.example.com',
  OIDC_CLIENT_ID: 'client',
  OIDC_CLIENT_SECRET: 'secret',
  OIDC_REDIRECT_URI: 'http://localhost:3000/api/v1/auth/callback',
  SESSION_SECRET: 'a'.repeat(32),
};

describe('loadConfiguration', () => {
  it('applies documented defaults', () => {
    const config = loadConfiguration(validEnv);

    expect(config.port).toBe(3000);
    expect(config.apiPrefix).toBe('api/v1');
    expect(config.trustProxy).toBe(0);
    expect(config.anthropic.model).toBe('claude-sonnet-5');
    expect(config.oidc.scopes).toBe('openid profile email');
    expect(config.session.cookieName).toBe('nym_session');
    expect(config.session.ttlSeconds).toBe(28_800);
    expect(config.oidc.adminRoles).toEqual([]);
    expect(config.generation.staleMs).toBe(150_000);
    expect(config.requests.listDefaultLimit).toBe(100);
    expect(config.rateLimit.list).toBe(120);
    expect(config.rateLimit.generate).toBe(20);
  });

  it('parses OIDC_ADMIN_ROLES as a trimmed list', () => {
    const config = loadConfiguration({
      ...validEnv,
      OIDC_ADMIN_ROLES: ' Admin, Desk lead ,',
    });

    expect(config.oidc.adminRoles).toEqual(['Admin', 'Desk lead']);
  });

  it('coerces numeric and boolean values from strings', () => {
    const config = loadConfiguration({
      ...validEnv,
      PORT: '8080',
      DATABASE_SSL: 'true',
      SESSION_COOKIE_SECURE: 'false',
      ANTHROPIC_MAX_TOKENS: '1500',
      TRUST_PROXY: '1',
    });

    expect(config.port).toBe(8080);
    expect(config.database.ssl).toBe(true);
    expect(config.database.sslRejectUnauthorized).toBe(true);
    expect(config.session.secureCookie).toBe(false);
    expect(config.anthropic.maxTokens).toBe(1500);
    expect(config.trustProxy).toBe(1);
  });

  it('allows disabling TLS verification only outside production', () => {
    const config = loadConfiguration({
      ...validEnv,
      NODE_ENV: 'development',
      DATABASE_SSL: 'true',
      DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
    });

    expect(config.database.ssl).toBe(true);
    expect(config.database.sslRejectUnauthorized).toBe(false);
  });

  it('marks production explicitly', () => {
    expect(
      loadConfiguration({
        ...validEnv,
        NODE_ENV: 'production',
        DATABASE_SSL: 'true',
      }).isProduction,
    ).toBe(true);
    expect(loadConfiguration(validEnv).isProduction).toBe(false);
  });

  it.each([
    ['DATABASE_SYNCHRONIZE', 'true', /DATABASE_SYNCHRONIZE/],
    ['SESSION_COOKIE_SECURE', 'false', /SESSION_COOKIE_SECURE/],
    ['DATABASE_SSL', 'false', /DATABASE_SSL/],
    ['DATABASE_SSL_REJECT_UNAUTHORIZED', 'false', /DATABASE_SSL_REJECT_UNAUTHORIZED/],
  ])('refuses %s=%s in production', (key, value, pattern) => {
    expect(() =>
      loadConfiguration({
        ...validEnv,
        NODE_ENV: 'production',
        DATABASE_SSL: 'true',
        [key]: value,
      }),
    ).toThrow(pattern);
  });

  it('boots production with synchronize off, secure cookie, and verified TLS', () => {
    const config = loadConfiguration({
      ...validEnv,
      NODE_ENV: 'production',
      DATABASE_SSL: 'true',
      DATABASE_SSL_REJECT_UNAUTHORIZED: 'true',
      DATABASE_SYNCHRONIZE: 'false',
      SESSION_COOKIE_SECURE: 'true',
    });

    expect(config.isProduction).toBe(true);
    expect(config.database.ssl).toBe(true);
    expect(config.database.sslRejectUnauthorized).toBe(true);
    expect(config.database.synchronize).toBe(false);
    expect(config.session.secureCookie).toBe(true);
  });

  it.each([
    ['DATABASE_URL', 'the database'],
    ['ANTHROPIC_API_KEY', 'the model'],
    ['OIDC_ISSUER_URL', 'the identity provider'],
    ['SESSION_SECRET', 'the session'],
  ])('refuses to boot without %s', (key) => {
    const env = { ...validEnv };
    delete env[key];

    expect(() => loadConfiguration(env)).toThrow(/Invalid environment configuration/);
  });

  it('rejects a session secret that is too short to sign with', () => {
    expect(() => loadConfiguration({ ...validEnv, SESSION_SECRET: 'short' })).toThrow(
      /SESSION_SECRET/,
    );
  });

  it('rejects a malformed issuer URL', () => {
    expect(() => loadConfiguration({ ...validEnv, OIDC_ISSUER_URL: 'not-a-url' })).toThrow(
      /OIDC_ISSUER_URL/,
    );
  });

  it('names every offending key in one message', () => {
    expect(() => loadConfiguration({})).toThrow(/DATABASE_URL[\s\S]*ANTHROPIC_API_KEY/);
  });
});
