import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { DataSource } from 'typeorm';

/**
 * Environment for integration runs.
 *
 * Set before the app module is imported, because configuration is validated at
 * module construction. Only the model call is stubbed — the database, the guard,
 * the pipes and the mappers are all the real thing.
 */
export const TEST_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  PORT: '3100',
  API_PREFIX: 'api/v1',
  WEB_ORIGIN: 'http://localhost:4200',
  WEB_APP_URL: 'http://localhost:4200',
  DATABASE_URL: process.env['TEST_DATABASE_URL'] ?? 'postgres://nym:nym@localhost:5432/nym_test',
  DATABASE_SSL: 'false',
  DATABASE_SYNCHRONIZE: 'false',
  DATABASE_LOGGING: 'false',
  ANTHROPIC_API_KEY: 'sk-ant-integration-stub',
  ANTHROPIC_MODEL: 'claude-sonnet-5',
  OIDC_ISSUER_URL: 'https://issuer.test',
  OIDC_CLIENT_ID: 'nym-test',
  OIDC_CLIENT_SECRET: 'nym-test-secret',
  OIDC_REDIRECT_URI: 'http://localhost:3000/api/v1/auth/callback',
  SESSION_SECRET: 'integration-test-session-secret-value-32+',
  SESSION_COOKIE_NAME: 'nym_session',
  SESSION_COOKIE_SECURE: 'false',
};

Object.assign(process.env, TEST_ENV);

// Imported after the environment is assigned above, because configuration is
// validated the moment the app module is constructed.
import { Logger } from '@nestjs/common';

import { AppModule } from '../src/app.module';
import { AuthenticatedUser } from '../src/auth/authenticated-user';
import { UserEntity } from '../src/database/entities';
import { NAME_GENERATOR, NameGenerator } from '../src/generation/name-generator.interface';
import { RawCandidate } from '../src/generation/name-rules';
import { OidcProfile, OidcService } from '../src/auth/oidc.service';
import { OidcTransaction } from '../src/auth/session.service';

/**
 * Scripted stand-in for the language model. Tests queue the candidates a run
 * should return, or an error it should fail with.
 */
export class ScriptedNameGenerator implements NameGenerator {
  private readonly queue: (RawCandidate[] | Error)[] = [];
  readonly calls: { system: string; prompt: string }[] = [];

  /** Returned when the queue is empty, so an unscripted run still succeeds. */
  private fallback: RawCandidate[] = [
    { name: 'Bridget C. Ashworth', pronunciation: 'BRIJ-it ASH-worth', origin: 'Anglo-Irish' },
    { name: 'Nella P. Quintrell', pronunciation: 'NEL-uh kwin-TRELL', origin: 'Cornish' },
    { name: 'Iris D. Haldane', pronunciation: 'EYE-ris HAWL-dayn', origin: 'Scots-Irish' },
  ];

  queueCandidates(candidates: RawCandidate[]): void {
    this.queue.push(candidates);
  }

  queueFailure(error: Error): void {
    this.queue.push(error);
  }

  setFallback(candidates: RawCandidate[]): void {
    this.fallback = candidates;
  }

  reset(): void {
    this.queue.length = 0;
    this.calls.length = 0;
  }

  generate(input: { system: string; prompt: string }): Promise<RawCandidate[]> {
    this.calls.push(input);
    const next = this.queue.shift();
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    return Promise.resolve(next ?? this.fallback);
  }
}

/**
 * Configurable stand-in for the identity provider. Discovery would otherwise hit
 * a real issuer at boot; the sign-in flow is exercised by scripting this.
 */
export class StubOidcService {
  authorizationUrl = 'https://issuer.test/authorize?state=abc';
  profile: OidcProfile = {
    subject: 'test|rosa',
    name: 'Rosa Marchetti',
    email: 'rosa.marchetti@example.com',
    role: 'Publishing assistant · Trade',
  };
  exchangeError: Error | null = null;
  endSession: string | null = null;

  readonly exchanges: { url: string; transaction: unknown }[] = [];

  onModuleInit(): Promise<void> {
    return Promise.resolve();
  }

  createAuthorizationRequest(): Promise<{ url: string; transaction: OidcTransaction }> {
    return Promise.resolve({
      url: this.authorizationUrl,
      transaction: { state: 'state-value', nonce: 'nonce-value', codeVerifier: 'verifier-value' },
    });
  }

  exchange(url: string, transaction: unknown): Promise<OidcProfile> {
    this.exchanges.push({ url, transaction });
    return this.exchangeError ? Promise.reject(this.exchangeError) : Promise.resolve(this.profile);
  }

  endSessionUrl(): Promise<string | null> {
    return Promise.resolve(this.endSession);
  }
}

export interface TestHarness {
  app: INestApplication;
  dataSource: DataSource;
  generator: ScriptedNameGenerator;
  oidc: StubOidcService;
  /** A signed session cookie for the seeded assistant, ready for `.set('Cookie', …)`. */
  sessionCookie: string;
  user: AuthenticatedUser;
  /** Empties every table so each spec starts from a known state. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

/** Boots the real application against the test database. */
export async function createTestHarness(): Promise<TestHarness> {
  const generator = new ScriptedNameGenerator();
  const oidc = new StubOidcService();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(NAME_GENERATOR)
    .useValue(generator)
    .overrideProvider(OidcService)
    .useValue(oidc)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  Logger.overrideLogger(false);

  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  await app.init();

  const dataSource = app.get(DataSource);
  await dataSource.runMigrations();

  const reset = async (): Promise<void> => {
    await dataSource.query(
      'TRUNCATE TABLE "candidates", "pen_name_requests", "users" RESTART IDENTITY CASCADE',
    );
    await dataSource.query(
      `UPDATE "prompt_settings" SET "systemOverride" = NULL, "promptOverride" = NULL WHERE id = 'default'`,
    );
  };

  await reset();

  const users = dataSource.getRepository(UserEntity);
  const saved = await users.save(
    users.create({
      subject: 'test|rosa',
      email: 'rosa.marchetti@example.com',
      name: 'Rosa Marchetti',
      role: 'Publishing assistant · Trade',
    }),
  );

  const user: AuthenticatedUser = {
    id: saved.id,
    subject: saved.subject,
    name: saved.name,
    email: saved.email,
    role: saved.role,
  };

  const jwt = app.get(JwtService);
  const token = await jwt.signAsync(
    { sub: user.subject, oid: user.id, name: user.name, email: user.email, role: user.role },
    { expiresIn: 3600 },
  );

  return {
    app,
    dataSource,
    generator,
    oidc,
    user,
    sessionCookie: `nym_session=${token}`,
    /** Re-seeds the assistant after truncating, so approvals still have an approver. */
    async reset() {
      await reset();
      await users.save(users.create({ ...saved }));
      generator.reset();
    },
    async close() {
      await app.close();
    },
  };
}
