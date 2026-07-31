/**
 * API process for end-to-end runs.
 *
 * The real application, with two substitutions that cannot reach production:
 *  - the language model is replaced by a scripted generator, so runs are
 *    deterministic and cost nothing;
 *  - a test-support controller can reset the database and mint a session, which
 *    is how Playwright signs in without a live identity provider.
 *
 * This file lives under test/ and is never part of the built application.
 */
import { Controller, Get, Logger, Module, Post, Res, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { RequestStatus } from '@nym/shared';
import cookieParser from 'cookie-parser';
import { Response } from 'express';
import { DataSource } from 'typeorm';

const PORT = Number(process.env['E2E_API_PORT'] ?? 3000);
const SESSION_SECRET = 'end-to-end-session-secret-value-at-least-32';

Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: String(PORT),
  API_PREFIX: 'api/v1',
  WEB_ORIGIN: process.env['E2E_WEB_ORIGIN'] ?? 'http://localhost:4200',
  WEB_APP_URL: process.env['E2E_WEB_ORIGIN'] ?? 'http://localhost:4200',
  DATABASE_URL: process.env['E2E_DATABASE_URL'] ?? 'postgres://nym:nym@localhost:5432/nym_e2e',
  DATABASE_SSL: 'false',
  DATABASE_SYNCHRONIZE: 'false',
  DATABASE_LOGGING: 'false',
  ANTHROPIC_API_KEY: 'sk-ant-e2e-stub',
  ANTHROPIC_MODEL: 'claude-sonnet-5',
  OIDC_ISSUER_URL: 'https://issuer.e2e',
  OIDC_CLIENT_ID: 'nym-e2e',
  OIDC_CLIENT_SECRET: 'nym-e2e-secret',
  OIDC_REDIRECT_URI: `http://localhost:${PORT}/api/v1/auth/callback`,
  SESSION_SECRET,
  SESSION_COOKIE_NAME: 'nym_session',
  SESSION_COOKIE_SECURE: 'false',
});

// Imported after the environment is assigned above, because configuration is
// validated the moment the app module is constructed.
import { AppModule } from '../src/app.module';
import { Public } from '../src/auth/decorators';
import { OidcService } from '../src/auth/oidc.service';
import { CandidateEntity, PenNameRequestEntity, UserEntity } from '../src/database/entities';
import { NAME_GENERATOR } from '../src/generation/name-generator.interface';
import { RawCandidate } from '../src/generation/name-rules';

/** Deterministic replacement for the model: a fixed, plentiful candidate pool. */
class E2ENameGenerator {
  private call = 0;

  private readonly pools: RawCandidate[][] = [
    [
      {
        name: 'Bridget C. Ashworth',
        pronunciation: 'BRIJ-it ASH-worth',
        origin: 'Anglo-Irish; understated and period-plausible.',
      },
      {
        name: 'Nella P. Quintrell',
        pronunciation: 'NEL-uh kwin-TRELL',
        origin: 'Cornish surname with an Irish given name.',
      },
      {
        name: 'Iris D. Haldane',
        pronunciation: 'EYE-ris HAWL-dayn',
        origin: 'Scots-Irish; sober and jacket-ready.',
      },
      {
        name: 'Thea R. Pemberly',
        pronunciation: 'THAY-uh PEM-ber-lee',
        origin: 'English; quiet literary register.',
      },
      {
        name: 'Wren S. Calloway',
        pronunciation: 'REN KAL-uh-way',
        origin: 'English; unisex given name.',
      },
      {
        name: 'Sadie L. Brightwell',
        pronunciation: 'SAY-dee BRITE-wel',
        origin: 'English; warm and commercial.',
      },
    ],
    [
      {
        name: 'Cora T. Winterly',
        pronunciation: 'KOR-uh WIN-ter-lee',
        origin: 'English; cool and literary.',
      },
      {
        name: 'Della K. Fairbourne',
        pronunciation: 'DEL-uh FAIR-born',
        origin: 'English; period-plausible.',
      },
      {
        name: 'Sylvie R. Danforth',
        pronunciation: 'SIL-vee DAN-forth',
        origin: 'French given name, English surname.',
      },
      {
        name: 'Piper N. Trelawney',
        pronunciation: 'PY-per truh-LAW-nee',
        origin: 'Cornish; distinctive but unremarkable.',
      },
    ],
  ];

  generate(): Promise<RawCandidate[]> {
    const pool = this.pools[this.call % this.pools.length] ?? [];
    this.call += 1;
    return Promise.resolve(pool);
  }
}

/** Stands in for the identity provider, which is not reachable in a test run. */
class E2EOidcService {
  onModuleInit(): Promise<void> {
    return Promise.resolve();
  }
  createAuthorizationRequest(): Promise<{ url: string; transaction: unknown }> {
    return Promise.resolve({
      url: `http://localhost:${PORT}/api/v1/test/session`,
      transaction: { state: 's', nonce: 'n', codeVerifier: 'v' },
    });
  }
  exchange(): Promise<never> {
    return Promise.reject(new Error('not used in end-to-end runs'));
  }
}

/** The assistant every end-to-end run signs in as. */
const E2E_USER = {
  subject: 'e2e|rosa',
  email: 'rosa.marchetti@example.com',
  name: 'Rosa Marchetti',
  role: 'Publishing assistant · Trade',
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

@Controller('test')
class TestSupportController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
  ) {}

  /** Empties and re-seeds the database, then hands back a fresh session cookie. */
  @Public()
  @Post('reset')
  async reset(@Res({ passthrough: true }) response: Response): Promise<{ ok: true }> {
    await this.seed(response);
    return { ok: true };
  }

  /** Signs in and lands on the queue; used as the first navigation of a spec. */
  @Public()
  @Get('session')
  async session(@Res() response: Response): Promise<void> {
    await this.seed(response);
    response.redirect('/queue');
  }

  private async seed(response: Response): Promise<void> {
    await this.dataSource.query(
      'TRUNCATE TABLE "candidates", "pen_name_requests", "users" RESTART IDENTITY CASCADE',
    );

    const users = this.dataSource.getRepository(UserEntity);
    const requests = this.dataSource.getRepository(PenNameRequestEntity);
    const candidates = this.dataSource.getRepository(CandidateEntity);

    const user = await users.save(users.create(E2E_USER));
    const now = Date.now();

    const voss = await requests.save(
      requests.create({
        legalName: 'Margaret E. Voss',
        presentation: 'Female',
        origin: 'Anglo-Irish',
        notes: 'Literary historical fiction, UK market.',
        status: RequestStatus.Ready,
        discardedCount: 4,
        createdById: user.id,
        createdAt: new Date(now - 52 * MINUTE),
      }),
    );
    await candidates.save([
      candidates.create({
        requestId: voss.id,
        name: 'Bridget C. ASHWORTH',
        pronunciation: 'BRIJ-it ASH-worth',
        origin: 'Anglo-Irish; understated.',
        position: 0,
      }),
      candidates.create({
        requestId: voss.id,
        name: 'Nella P. QUINTRELL',
        pronunciation: 'NEL-uh kwin-TRELL',
        origin: 'Cornish surname.',
        position: 1,
      }),
    ]);

    await requests.save(
      requests.create({
        legalName: 'Daniel O. Okonkwo-Reyes',
        presentation: 'Male',
        notes: 'Techno-thriller, US mass market.',
        status: RequestStatus.Failed,
        errorMessage: 'Generation failed — try again.',
        createdById: user.id,
        createdAt: new Date(now - 3 * HOUR),
      }),
    );

    const raman = await requests.save(
      requests.create({
        legalName: 'Priya R. Raman',
        presentation: 'Unisex',
        notes: 'YA fantasy debut.',
        status: RequestStatus.Approved,
        approvedName: 'Ash T. FENNIMORE',
        chosenName: 'Ash T. FENNIMORE',
        approvedByName: user.name,
        approvedById: user.id,
        approvedAt: new Date(now - 25 * HOUR),
        discardedCount: 2,
        createdById: user.id,
        createdAt: new Date(now - 26 * HOUR),
      }),
    );
    await candidates.save(
      candidates.create({
        requestId: raman.id,
        name: 'Ash T. FENNIMORE',
        pronunciation: 'ASH FEN-ih-mor',
        origin: 'English; short given name.',
        position: 0,
      }),
    );

    const token = await this.jwt.signAsync(
      {
        sub: user.subject,
        oid: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      { expiresIn: 3600 },
    );

    response.cookie('nym_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
    });
  }
}

// The test-support controller signs its own session, so it brings its own JWT
// module rather than widening the application's public provider surface.
@Module({
  imports: [
    AppModule,
    JwtModule.register({ secret: SESSION_SECRET, signOptions: { algorithm: 'HS256' } }),
  ],
  controllers: [TestSupportController],
})
class E2EAppModule {}

async function bootstrap(): Promise<void> {
  const moduleRef = await Test.createTestingModule({ imports: [E2EAppModule] })
    .overrideProvider(NAME_GENERATOR)
    .useClass(E2ENameGenerator)
    .overrideProvider(OidcService)
    .useClass(E2EOidcService)
    .compile();

  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });

  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: process.env['WEB_ORIGIN'], credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  await app.init();

  const dataSource = app.get(DataSource);
  await dataSource.runMigrations();

  await app.listen(PORT);
  new Logger('E2E').log(`Nym E2E API listening on :${PORT}`);
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
