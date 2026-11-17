/**
 * Development seed. Creates (or refreshes) a demo account with realistic data
 * for today so the My Day dashboard has something to show.
 *
 * Demo credentials are printed to the console; they are for local use only.
 * Refuses to run when NODE_ENV=production.
 */
import { hash } from '@node-rs/argon2';
import { localDateKey, localTimeOnDay } from '@lifeos/shared';
import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@lifeos.local';
const DEMO_PASSWORD = 'LifeOS-demo-2026';
const TZ = 'Africa/Casablanca';

const CATEGORIES = [
  { name: 'Work', kind: 'WORK', color: '#0A84FF', icon: 'briefcase' },
  { name: 'Personal', kind: 'PERSONAL', color: '#BF5AF2', icon: 'user' },
  { name: 'Sport', kind: 'SPORT', color: '#30D158', icon: 'dumbbell' },
  { name: 'Study', kind: 'STUDY', color: '#FF9F0A', icon: 'book-open' },
  { name: 'Travel', kind: 'TRAVEL', color: '#64D2FF', icon: 'plane' },
  { name: 'Health', kind: 'HEALTH', color: '#FF375F', icon: 'heart' },
] as const;

const NOW = new Date();

/** UTC instant for a local wall-clock time today in the demo timezone. */
function todayAt(hours: number, minutes = 0): Date {
  const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return localTimeOnDay(NOW, clock, TZ);
}

/** Local calendar date (stored in a DATE column as midnight UTC). */
function todayDate(): Date {
  return new Date(`${localDateKey(NOW, TZ)}T00:00:00Z`);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data in production.');
  }

  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash: await hash(DEMO_PASSWORD),
      displayName: 'Sallam',
      emailVerifiedAt: new Date(),
      preferences: { create: { timezone: TZ, workDays: [1, 2, 3, 4, 5] } },
      categories: { create: CATEGORIES.map((c, i) => ({ ...c, sortOrder: i })) },
    },
    include: { categories: true },
  });
  const cat = Object.fromEntries(user.categories.map((c) => [c.kind, c.id]));

  const goal = await prisma.goal.create({
    data: {
      userId: user.id,
      title: 'Ship LifeOS Phase 1',
      level: 'MONTHLY',
      priority: 'HIGH',
      status: 'ACTIVE',
      categoryId: cat.WORK,
      targetValue: 100,
      currentValue: 60,
      unit: '%',
    },
  });

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name: 'LifeOS',
      status: 'ACTIVE',
      priority: 'HIGH',
      categoryId: cat.WORK,
      goalId: goal.id,
      color: '#0A84FF',
    },
  });

  const plannedDate = todayDate();
  const tasks: Prisma.TaskCreateManyInput[] = [
    {
      userId: user.id,
      title: 'Review authentication flow',
      priority: 'URGENT',
      estimatedMinutes: 60,
      projectId: project.id,
      goalId: goal.id,
      categoryId: cat.WORK,
      plannedDate,
      dueAt: todayAt(18),
    },
    {
      userId: user.id,
      title: 'Write database backup runbook',
      priority: 'HIGH',
      estimatedMinutes: 45,
      projectId: project.id,
      categoryId: cat.WORK,
      plannedDate,
    },
    {
      userId: user.id,
      title: 'Book dentist appointment',
      priority: 'MEDIUM',
      estimatedMinutes: 10,
      categoryId: cat.HEALTH,
      plannedDate,
    },
    {
      userId: user.id,
      title: 'Read 20 pages',
      priority: 'LOW',
      estimatedMinutes: 30,
      categoryId: cat.PERSONAL,
      plannedDate,
      status: 'COMPLETED',
      completedAt: todayAt(8, 15),
    },
  ];
  await prisma.task.createMany({ data: tasks });

  await prisma.calendarEvent.createMany({
    data: [
      {
        userId: user.id,
        title: 'Team stand-up',
        startAt: todayAt(9, 30),
        endAt: todayAt(9, 45),
        categoryId: cat.WORK,
        locked: true,
        timezone: TZ,
      },
      {
        userId: user.id,
        title: 'Design review',
        startAt: todayAt(11),
        endAt: todayAt(12),
        categoryId: cat.WORK,
        projectId: project.id,
        priority: 'HIGH',
        timezone: TZ,
      },
      {
        userId: user.id,
        title: 'Gym — upper body',
        startAt: todayAt(18, 30),
        endAt: todayAt(19, 45),
        categoryId: cat.SPORT,
        flexibility: 'FLEXIBLE',
        timezone: TZ,
      },
    ],
  });

  const habits = await Promise.all(
    [
      { name: 'Read', categoryId: cat.PERSONAL, color: '#BF5AF2', icon: 'book' },
      { name: 'Drink 2L of water', categoryId: cat.HEALTH, color: '#64D2FF', icon: 'droplet' },
      { name: 'Learn English — 30 min', categoryId: cat.STUDY, color: '#FF9F0A', icon: 'languages' },
      { name: 'Meditate', categoryId: cat.HEALTH, color: '#30D158', icon: 'leaf' },
    ].map((h) => prisma.habit.create({ data: { userId: user.id, frequency: 'DAILY', ...h } })),
  );
  // Read is done today + a short streak on previous days.
  const today = todayDate();
  const readHabit = habits[0]!;
  await prisma.habitLog.createMany({
    data: [0, 1, 2, 3].map((daysAgo) => ({
      habitId: readHabit.id,
      userId: user.id,
      date: new Date(today.getTime() - daysAgo * 86_400_000),
    })),
  });

  await prisma.availabilityRule.createMany({
    data: [1, 2, 3, 4, 5].map((weekday) => ({
      userId: user.id,
      kind: 'WORKING_HOURS' as const,
      weekday,
      startTime: '09:00',
      endTime: '18:00',
      timezone: TZ,
    })),
  });

  console.log('Seed complete.');
  console.log(`  Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}  (local development only)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
