import 'reflect-metadata';

import { RequestStatus } from '@nym/shared';
import { DataSource } from 'typeorm';

import dataSource from './data-source';
import { CandidateEntity, PenNameRequestEntity, UserEntity } from './entities';

/**
 * Development seed: a demo assistant and three requests in the states the design
 * shows — one ready, one queued, one already approved and sitting in History.
 *
 * Candidates are curated rather than generated so `npm run seed` costs nothing and
 * produces the same screen every time. Never run this against production data.
 */
const DEMO_USER = {
  subject: 'seed|rosa.marchetti',
  email: 'rosa.marchetti@example.com',
  name: 'Rosa Marchetti',
  role: 'Publishing assistant · Trade',
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

async function seed(source: DataSource): Promise<void> {
  const users = source.getRepository(UserEntity);
  const requests = source.getRepository(PenNameRequestEntity);
  const candidates = source.getRepository(CandidateEntity);

  const user =
    (await users.findOne({ where: { subject: DEMO_USER.subject } })) ??
    (await users.save(users.create(DEMO_USER)));

  const existing = await requests.count();
  if (existing > 0) {
    console.log(`Skipping seed — ${existing} request(s) already present.`);
    return;
  }

  const now = Date.now();

  const voss = await requests.save(
    requests.create({
      legalName: 'Margaret E. Voss',
      presentation: 'Female',
      origin: 'Anglo-Irish',
      notes: 'Literary historical fiction, UK market. Wants something quiet and period-plausible.',
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
      origin: 'Anglo-Irish; understated, reads as mid-century literary.',
      position: 0,
    }),
    candidates.create({
      requestId: voss.id,
      name: 'Nella P. QUINTRELL',
      pronunciation: 'NEL-uh kwin-TRELL',
      origin: 'Cornish surname with an Irish given name; period-plausible.',
      position: 1,
    }),
    candidates.create({
      requestId: voss.id,
      name: 'Iris D. HALDANE',
      pronunciation: 'EYE-ris HAWL-dayn',
      origin: 'Scots-Irish; sober and jacket-ready.',
      position: 2,
    }),
  ]);

  await requests.save(
    requests.create({
      legalName: 'Daniel O. Okonkwo-Reyes',
      presentation: 'Male',
      origin: '',
      notes: 'Techno-thriller, US mass market.',
      status: RequestStatus.Queued,
      createdById: user.id,
      createdAt: new Date(now - 3 * HOUR),
    }),
  );

  const raman = await requests.save(
    requests.create({
      legalName: 'Priya R. Raman',
      presentation: 'Unisex',
      origin: '',
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

  await candidates.save([
    candidates.create({
      requestId: raman.id,
      name: 'Ash T. FENNIMORE',
      pronunciation: 'ASH FEN-ih-mor',
      origin: 'English; short given name, long surname — reads well on a YA jacket.',
      position: 0,
    }),
    candidates.create({
      requestId: raman.id,
      name: 'Wren S. CALLOWAY',
      pronunciation: 'REN KAL-uh-way',
      origin: 'English; unisex given name with a soft surname.',
      position: 1,
    }),
  ]);

  console.log('Seeded 3 requests and 5 candidates.');
}

async function main(): Promise<void> {
  const source = await dataSource.initialize();
  try {
    await seed(source);
  } finally {
    await source.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
