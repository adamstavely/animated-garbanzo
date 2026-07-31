import { resolveTypeOrmSsl } from './database-ssl';

describe('resolveTypeOrmSsl', () => {
  it('allows plaintext outside production', () => {
    expect(resolveTypeOrmSsl({ NODE_ENV: 'development' })).toBe(false);
    expect(resolveTypeOrmSsl({ NODE_ENV: 'test', DATABASE_SSL: 'false' })).toBe(false);
  });

  it('enables verified TLS when DATABASE_SSL is true', () => {
    expect(resolveTypeOrmSsl({ NODE_ENV: 'development', DATABASE_SSL: 'true' })).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('allows skipping cert verification only outside production', () => {
    expect(
      resolveTypeOrmSsl({
        NODE_ENV: 'development',
        DATABASE_SSL: 'true',
        DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
      }),
    ).toEqual({ rejectUnauthorized: false });
  });

  it.each([
    [{ NODE_ENV: 'production' }, /DATABASE_SSL/],
    [{ NODE_ENV: 'production', DATABASE_SSL: 'false' }, /DATABASE_SSL/],
    [
      {
        NODE_ENV: 'production',
        DATABASE_SSL: 'true',
        DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
      },
      /DATABASE_SSL_REJECT_UNAUTHORIZED/,
    ],
  ])('refuses %j in production', (env, pattern) => {
    expect(() => resolveTypeOrmSsl(env)).toThrow(pattern);
  });

  it('accepts production with verified TLS', () => {
    expect(
      resolveTypeOrmSsl({
        NODE_ENV: 'production',
        DATABASE_SSL: 'true',
        DATABASE_SSL_REJECT_UNAUTHORIZED: 'true',
      }),
    ).toEqual({ rejectUnauthorized: true });
  });
});
