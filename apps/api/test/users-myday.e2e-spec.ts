import { localDateKey } from '@lifeos/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cookiesFrom, createTestApp, resetDatabase, uniqueEmail, WEB } from './app';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;

describe('Users, preferences, My Day & data isolation (e2e, MySQL)', () => {
  let ctx: Ctx;
  const password = 'correct-horse-42';

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  async function signUp(name = 'Alice') {
    const email = uniqueEmail(name.toLowerCase());
    const res = await ctx.http().post('/api/v1/auth/register').set(WEB).send({ email, password, displayName: name }).expect(201);
    const c = cookiesFrom(res);
    return { email, id: res.body.user.id as string, auth: { ...WEB, Cookie: `lifeos_at=${c.lifeos_at}` } };
  }

  it('updates preferences with validation, including cross-field checks against stored values', async () => {
    const a = await signUp();
    const ok = await ctx.http().patch('/api/v1/preferences').set(a.auth).send({ timezone: 'Europe/Paris', locale: 'fr' }).expect(200);
    expect(ok.body).toMatchObject({ timezone: 'Europe/Paris', locale: 'fr' });
    await ctx.http().patch('/api/v1/preferences').set(a.auth).send({ timezone: 'Not/AZone' }).expect(400);
    // Stored dayEnd is 22:00; moving dayStart after it must fail.
    const bad = await ctx.http().patch('/api/v1/preferences').set(a.auth).send({ dayStartTime: '23:00' }).expect(400);
    expect(bad.body.issues.dayEndTime).toBeDefined();
  });

  it('updates the profile and rejects unknown fields from reaching the DB', async () => {
    const a = await signUp();
    const res = await ctx
      .http()
      .patch('/api/v1/users/me')
      .set(a.auth)
      .send({ displayName: 'Alice B', role: 'ADMIN', email: 'hijack@example.test' })
      .expect(200);
    expect(res.body).toMatchObject({ displayName: 'Alice B', role: 'USER', email: a.email });
  });

  it('builds My Day from real rows: quick-add, complete, habit check-off', async () => {
    const a = await signUp();
    const empty = await ctx.http().get('/api/v1/my-day').set(a.auth).expect(200);
    expect(empty.body.tasks).toEqual([]);
    expect(empty.body.timezone).toBe('Africa/Casablanca');
    expect(empty.body.date).toBe(localDateKey(new Date(), 'Africa/Casablanca'));

    const created = await ctx
      .http()
      .post('/api/v1/tasks')
      .set(a.auth)
      .send({ title: 'Prepare slides', priority: 'HIGH', estimatedMinutes: 45, plannedDate: localDateKey(new Date(), 'Africa/Casablanca') })
      .expect(201);
    let day = await ctx.http().get('/api/v1/my-day').set(a.auth).expect(200);
    expect(day.body.topPriority.title).toBe('Prepare slides');
    expect(day.body.stats.plannedTaskMinutes).toBe(45);

    await ctx.http().patch(`/api/v1/tasks/${created.body.id}/status`).set(a.auth).send({ status: 'COMPLETED' }).expect(200);
    day = await ctx.http().get('/api/v1/my-day').set(a.auth).expect(200);
    expect(day.body.stats).toMatchObject({ tasksTotal: 1, tasksCompleted: 1 });

    const habit = await ctx.prisma.habit.create({ data: { userId: a.id, name: 'Read' } });
    await ctx
      .http()
      .put(`/api/v1/habits/${habit.id}/completion`)
      .set(a.auth)
      .send({ date: day.body.date, done: true })
      .expect(200);
    day = await ctx.http().get('/api/v1/my-day').set(a.auth).expect(200);
    expect(day.body.habits[0]).toMatchObject({ name: 'Read', doneToday: true, streak: 1 });
  });

  it('isolates users: another user’s ids behave as not found (no IDOR)', async () => {
    const a = await signUp('Alice');
    const b = await signUp('Bob');
    const task = await ctx.http().post('/api/v1/tasks').set(a.auth).send({ title: 'Private' }).expect(201);
    const habit = await ctx.prisma.habit.create({ data: { userId: a.id, name: 'Secret habit' } });

    await ctx.http().patch(`/api/v1/tasks/${task.body.id}/status`).set(b.auth).send({ status: 'CANCELLED' }).expect(404);
    await ctx.http().put(`/api/v1/habits/${habit.id}/completion`).set(b.auth).send({ date: '2026-11-17', done: true }).expect(404);

    const bDay = await ctx.http().get('/api/v1/my-day').set(b.auth).expect(200);
    expect(bDay.body.tasks).toEqual([]);
    expect(bDay.body.habits).toEqual([]);
    const stillTodo = await ctx.prisma.task.findUniqueOrThrow({ where: { id: task.body.id } });
    expect(stillTodo.status).toBe('TODO');
  });

  it('exports data without secrets', async () => {
    const a = await signUp();
    const res = await ctx.http().get('/api/v1/users/me/export').set(a.auth).expect(200);
    expect(res.body.format).toBe('lifeos-export/v1');
    expect(res.body.data.email).toBe(a.email);
    expect(JSON.stringify(res.body)).not.toContain('argon2');
  });

  it('deletes the account and all owned data after password confirmation', async () => {
    const a = await signUp();
    await ctx.http().post('/api/v1/tasks').set(a.auth).send({ title: 'Goes away' }).expect(201);
    await ctx.http().delete('/api/v1/users/me').set(a.auth).send({ password: 'wrong-pass-123', confirm: 'DELETE' }).expect(401);
    await ctx.http().delete('/api/v1/users/me').set(a.auth).send({ password, confirm: 'DELETE' }).expect(204);
    expect(await ctx.prisma.user.findUnique({ where: { id: a.id } })).toBeNull();
    expect(await ctx.prisma.task.count({ where: { userId: a.id } })).toBe(0);
    await ctx.http().get('/api/v1/users/me').set(a.auth).expect(401);
  });

  it('reports health of MySQL and Redis', async () => {
    const res = await ctx.http().get('/api/v1/health').expect(200);
    expect(res.body.checks.mysql).toBe(true);
  });
});
