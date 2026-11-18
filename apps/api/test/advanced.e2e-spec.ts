import { addDaysKey, localDateKey, localTimeOnDay } from '@lifeos/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cookiesFrom, createTestApp, resetDatabase, uniqueEmail, WEB } from './app';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;
const TZ = 'Europe/Paris';

describe('Phase 4: sports, study, travel, analytics (e2e, MySQL)', () => {
  let ctx: Ctx;
  const today = localDateKey(new Date(), TZ);
  const at = (day: string, clock: string) => localTimeOnDay(new Date(`${day}T12:00:00Z`), clock, TZ).toISOString();

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  async function signUp(name = 'Alice') {
    const res = await ctx
      .http()
      .post('/api/v1/auth/register')
      .set(WEB)
      .send({ email: uniqueEmail(name.toLowerCase()), password: 'correct-horse-42', displayName: name, timezone: TZ })
      .expect(201);
    const c = cookiesFrom(res);
    return { id: res.body.user.id as string, auth: { ...WEB, Cookie: `lifeos_at=${c.lifeos_at}` } };
  }

  it('logs workouts with exercises and reports weekly stats', async () => {
    const a = await signUp();
    const w = await ctx
      .http()
      .post('/api/v1/sports/workouts')
      .set(a.auth)
      .send({ title: 'Upper body', startAt: at(today, '07:00'), durationMinutes: 50, intensity: 8, exercises: [{ name: 'Bench press', sets: 4, reps: 8, weightKg: 60 }] })
      .expect(201);
    expect(w.body.exercises[0]).toMatchObject({ name: 'Bench press', weightKg: 60 });
    const updated = await ctx.http().patch(`/api/v1/sports/workouts/${w.body.id}`).set(a.auth).send({ exercises: [{ name: 'Pull-ups', sets: 3, reps: 10 }] }).expect(200);
    expect(updated.body.exercises.map((e: { name: string }) => e.name)).toEqual(['Pull-ups']);
    await ctx.http().post('/api/v1/sports/workouts').set(a.auth).send({ title: 'Run', type: 'CARDIO', startAt: at(today, '18:00'), durationMinutes: 30, intensity: 11 }).expect(400);

    await ctx.http().put('/api/v1/sports/target').set(a.auth).send({ weeklyWorkoutTarget: 1 }).expect(200);
    const stats = await ctx.http().get('/api/v1/sports/stats').set(a.auth).expect(200);
    expect(stats.body).toMatchObject({ weeklyTarget: 1, thisWeek: { sessions: 1, minutes: 50 }, weekStreak: 1 });

    const other = await signUp('Bob');
    await ctx.http().get(`/api/v1/sports/workouts/${w.body.id}`).set(other.auth).expect(404);
  });

  it('runs spaced repetition from learning to revisions', async () => {
    const a = await signUp();
    const subject = await ctx
      .http()
      .post('/api/v1/study/subjects')
      .set(a.auth)
      .send({ name: 'Calculus', weeklyTargetMinutes: 240, chapters: [{ id: 'c1', title: 'Limits', done: true }, { id: 'c2', title: 'Series' }] })
      .expect(201);
    expect(subject.body).toMatchObject({ progress: 0.5, dueReviews: 0 });

    // Learned two days ago → first review was due yesterday.
    const twoDaysAgo = addDaysKey(today, -2);
    await ctx
      .http()
      .post('/api/v1/study/sessions')
      .set(a.auth)
      .send({ subjectId: subject.body.id, kind: 'LEARNING', topic: 'Limits', startAt: at(twoDaysAgo, '09:00'), endAt: at(twoDaysAgo, '10:00'), completed: true })
      .expect(201);
    let due = await ctx.http().get('/api/v1/study/reviews/due').set(a.auth).expect(200);
    expect(due.body.map((d: { topic: string }) => d.topic)).toEqual(['Limits']);

    await ctx
      .http()
      .post('/api/v1/study/sessions')
      .set(a.auth)
      .send({ subjectId: subject.body.id, kind: 'REVISION', topic: 'Limits', startAt: at(today, '08:00'), endAt: at(today, '08:30'), completed: true })
      .expect(400); // a completed revision needs a recall rating
    const rev = await ctx
      .http()
      .post('/api/v1/study/sessions')
      .set(a.auth)
      .send({ subjectId: subject.body.id, kind: 'REVISION', topic: 'Limits', startAt: at(today, '08:00'), endAt: at(today, '08:30'), completed: true, quality: 4 })
      .expect(201);
    expect(rev.body).toMatchObject({ quality: 4, intervalDays: 1 });
    due = await ctx.http().get('/api/v1/study/reviews/due').set(a.auth).expect(200);
    expect(due.body).toEqual([]);

    const planned = await ctx
      .http()
      .post('/api/v1/study/sessions')
      .set(a.auth)
      .send({ subjectId: subject.body.id, kind: 'REVISION', topic: 'Limits', startAt: at(addDaysKey(today, 1), '08:00'), endAt: at(addDaysKey(today, 1), '08:30') })
      .expect(201);
    const done = await ctx.http().post(`/api/v1/study/sessions/${planned.body.id}/complete`).set(a.auth).send({ quality: 5 }).expect(201);
    expect(done.body.intervalDays).toBe(6); // second successful review
  });

  it('manages trips, itinerary and budget, and the planner keeps trip time free', async () => {
    const a = await signUp();
    const start = addDaysKey(today, 10);
    const trip = await ctx
      .http()
      .post('/api/v1/trips')
      .set(a.auth)
      .send({
        title: 'Lisbon',
        destination: 'Lisbon, Portugal',
        departureAt: at(start, '00:00'),
        returnAt: at(addDaysKey(start, 3), '00:00'),
        budgetAmount: 800,
        budgetCurrency: 'EUR',
        checklist: [{ id: 'p', label: 'Passport', done: false }],
      })
      .expect(201);
    await ctx.http().post(`/api/v1/trips/${trip.body.id}/activities`).set(a.auth).send({ title: 'Tram 28', cost: 3.5 }).expect(201);
    const withHotel = await ctx.http().post(`/api/v1/trips/${trip.body.id}/activities`).set(a.auth).send({ title: 'Hotel', cost: 420, reservation: 'ABC123' }).expect(201);
    expect(withHotel.body.spent).toBe(423.5);
    await ctx.http().patch(`/api/v1/trips/${trip.body.id}`).set(a.auth).send({ returnAt: at(addDaysKey(start, -1), '00:00') }).expect(400);
    await ctx.http().post('/api/v1/trips').set(a.auth).send({ title: 'x', destination: 'y', departureAt: at(start, '00:00'), returnAt: at(start, '10:00'), budgetCurrency: 'euro' }).expect(400);

    const proposal = await ctx
      .http()
      .post('/api/v1/planner/proposals')
      .set(a.auth)
      .send({ startDate: start, endDate: addDaysKey(start, 4), includeOpenTasks: false, activities: [{ title: 'Read', durationMinutes: 60, sessions: 5 }] })
      .expect(201);
    const tripEnd = new Date(at(addDaysKey(start, 3), '00:00'));
    const placed = proposal.body.changes.filter((c: { type: string }) => c.type === 'CREATE_EVENT');
    expect(placed.length).toBeGreaterThan(0);
    expect(placed.every((c: { startAt: string }) => new Date(c.startAt) >= tripEnd)).toBe(true);
  });

  it('reports weekly analytics from real rows', async () => {
    const a = await signUp();
    const t = await ctx.http().post('/api/v1/tasks').set(a.auth).send({ title: 'Done today', estimatedMinutes: 30, plannedDate: today }).expect(201);
    await ctx.http().post(`/api/v1/tasks/${t.body.id}/time`).set(a.auth).send({ minutes: 45 }).expect(201);
    await ctx.http().patch(`/api/v1/tasks/${t.body.id}/status`).set(a.auth).send({ status: 'COMPLETED' }).expect(200);
    await ctx.http().post('/api/v1/tasks').set(a.auth).send({ title: 'Still open', plannedDate: today }).expect(201);
    await ctx.http().post('/api/v1/calendar/events').set(a.auth).send({ title: 'Meeting', startAt: at(today, '10:00'), endAt: at(today, '11:30') }).expect(201);
    await ctx.http().post('/api/v1/sports/workouts').set(a.auth).send({ title: 'Swim', type: 'CARDIO', startAt: at(today, '07:00'), durationMinutes: 40 }).expect(201);

    const r = await ctx.http().get('/api/v1/analytics').query({ period: 'week' }).set(a.auth).expect(200);
    expect(r.body.tasks).toMatchObject({ completed: 1, completionRate: 0.5 });
    expect(r.body.plannedVsActual).toEqual({ plannedMinutes: 30, trackedMinutes: 45 });
    expect(r.body.workouts).toEqual({ sessions: 1, minutes: 40 });
    expect(r.body.timeByCategory.reduce((s: number, c: { minutes: number }) => s + c.minutes, 0)).toBe(90);
    expect(r.body.daily).toHaveLength(7);
    const month = await ctx.http().get('/api/v1/analytics').query({ period: 'month' }).set(a.auth).expect(200);
    expect(month.body.daily.length).toBeGreaterThanOrEqual(28);
    await ctx.http().get('/api/v1/analytics').query({ period: 'year' }).set(a.auth).expect(400);
  });
});
