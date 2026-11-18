import { addDaysKey, localDateKey, localTimeOnDay } from '@lifeos/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cookiesFrom, createTestApp, resetDatabase, uniqueEmail, WEB } from './app';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;
const TZ = 'Europe/Paris';

interface Change {
  id: string;
  type: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  decision: string;
}

describe('AI planner: propose → review → apply (e2e, MySQL)', () => {
  let ctx: Ctx;
  const password = 'correct-horse-42';
  // A Monday a week or more ahead, so "now" never clips the period.
  const today = localDateKey(new Date(), TZ);
  const offset = ((8 - new Date(`${today}T12:00:00Z`).getUTCDay()) % 7) + 7;
  const monday = addDaysKey(today, offset);
  const friday = addDaysKey(monday, 4);
  const at = (day: string, clock: string) => localTimeOnDay(new Date(`${day}T12:00:00Z`), clock, TZ).toISOString();

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  async function signUp(name = 'Alice') {
    const email = uniqueEmail(name.toLowerCase());
    const res = await ctx
      .http()
      .post('/api/v1/auth/register')
      .set(WEB)
      .send({ email, password, displayName: name, timezone: TZ })
      .expect(201);
    const c = cookiesFrom(res);
    return { id: res.body.user.id as string, auth: { ...WEB, Cookie: `lifeos_at=${c.lifeos_at}` } };
  }

  async function setup() {
    const u = await signUp();
    const http = ctx.http;
    await http()
      .post('/api/v1/calendar/events')
      .set(u.auth)
      .send({ title: 'Locked exam', startAt: at(monday, '09:00'), endAt: at(monday, '12:00'), locked: true })
      .expect(201);
    const report = await http().post('/api/v1/tasks').set(u.auth).send({ title: 'Write report', estimatedMinutes: 120, priority: 'HIGH', splittable: true }).expect(201);
    await http().post('/api/v1/tasks').set(u.auth).send({ title: 'No estimate' }).expect(201);
    await http().post('/api/v1/tasks').set(u.auth).send({ title: 'Overdue thing', estimatedMinutes: 60, dueAt: '2020-01-01T10:00:00Z' }).expect(201);
    return { u, reportId: report.body.id as string };
  }

  const request = { startDate: monday, endDate: friday, includeOpenTasks: true, activities: [{ title: 'Gym', durationMinutes: 60, sessions: 2, recoveryHours: 24, window: 'personal', category: 'SPORT' }] };

  it('builds a proposal without touching the calendar, around locked events', async () => {
    const { u, reportId } = await setup();
    const res = await ctx.http().post('/api/v1/planner/proposals').set(u.auth).send(request).expect(201);
    const p = res.body;
    expect(p.status).toBe('PENDING');
    const changes = p.changes as Change[];
    const task = changes.filter((c) => c.type === 'SCHEDULE_TASK');
    const gym = changes.filter((c) => c.type === 'CREATE_EVENT');
    expect(task.length).toBeGreaterThan(0);
    expect(task.every((c) => c.title === 'Write report')).toBe(true);
    expect(gym).toHaveLength(2);
    const unscheduled = changes.filter((c) => c.type === 'UNSCHEDULED').map((c) => c.title);
    expect(unscheduled).toContain('Overdue thing');
    expect(p.explanation.lines.join(' ')).toContain('“No estimate” has no time estimate.');
    // No proposed block overlaps the locked exam.
    for (const c of [...task, ...gym]) expect(c.endAt! <= at(monday, '09:00') || c.startAt! >= at(monday, '12:00')).toBe(true);

    // Nothing written yet.
    expect(await ctx.prisma.taskSchedule.count({ where: { taskId: reportId } })).toBe(0);
    expect(await ctx.prisma.calendarEvent.count({ where: { userId: u.id, source: 'AI' } })).toBe(0);
  });

  it('lets the user reject or move single changes, and applies the rest atomically', async () => {
    const { u, reportId } = await setup();
    const p = (await ctx.http().post('/api/v1/planner/proposals').set(u.auth).send(request).expect(201)).body;
    const [first, second] = (p.changes as Change[]).filter((c) => c.type === 'CREATE_EVENT');

    await ctx.http().patch(`/api/v1/planner/proposals/${p.id}/changes/${first!.id}`).set(u.auth).send({ decision: 'REJECTED' }).expect(200);
    const clash = await ctx
      .http()
      .patch(`/api/v1/planner/proposals/${p.id}/changes/${second!.id}`)
      .set(u.auth)
      .send({ decision: 'MODIFIED', startAt: at(monday, '10:00'), endAt: at(monday, '11:00') })
      .expect(409);
    expect(clash.body.message).toContain('Locked exam');
    await ctx
      .http()
      .patch(`/api/v1/planner/proposals/${p.id}/changes/${second!.id}`)
      .set(u.auth)
      .send({ decision: 'MODIFIED', startAt: at(friday, '19:00'), endAt: at(friday, '20:00') })
      .expect(200);

    const applied = await ctx.http().post(`/api/v1/planner/proposals/${p.id}/apply`).set(u.auth).expect(201);
    expect(applied.body.status).toBe('APPLIED');
    const events = await ctx.prisma.calendarEvent.findMany({ where: { userId: u.id, source: 'AI' } });
    expect(events).toHaveLength(1);
    expect(events[0]!.startAt.toISOString()).toBe(at(friday, '19:00'));
    expect(events[0]!.categoryId).not.toBeNull(); // mapped to the Sport category
    const blocks = await ctx.prisma.taskSchedule.findMany({ where: { taskId: reportId } });
    expect(blocks.reduce((s, b) => s + (b.endAt.getTime() - b.startAt.getTime()) / 60_000, 0)).toBe(120);

    const range = await ctx.http().get('/api/v1/calendar/events').query({ from: at(monday, '00:00'), to: at(addDaysKey(friday, 1), '00:00') }).set(u.auth).expect(200);
    expect(range.body.taskBlocks.length).toBe(blocks.length);

    await ctx.http().post(`/api/v1/planner/proposals/${p.id}/apply`).set(u.auth).expect(409);

    // Undo removes exactly what the plan created.
    const reverted = await ctx.http().post(`/api/v1/planner/proposals/${p.id}/revert`).set(u.auth).expect(201);
    expect(reverted.body.status).toBe('REVERTED');
    expect(await ctx.prisma.taskSchedule.count({ where: { taskId: reportId } })).toBe(0);
    expect(await ctx.prisma.calendarEvent.count({ where: { userId: u.id, source: 'AI' } })).toBe(0);
    expect(await ctx.prisma.calendarEvent.count({ where: { userId: u.id, title: 'Locked exam' } })).toBe(1);
  });

  it('refuses to apply a stale proposal and leaves the calendar untouched', async () => {
    const { u } = await setup();
    const p = (await ctx.http().post('/api/v1/planner/proposals').set(u.auth).send(request).expect(201)).body;
    // The calendar changes after the proposal was computed.
    await ctx.http().post('/api/v1/calendar/events').set(u.auth).send({ title: 'New meeting', startAt: at(monday, '14:00'), endAt: at(monday, '15:00') }).expect(201);
    const stale = await ctx.http().post(`/api/v1/planner/proposals/${p.id}/apply`).set(u.auth).expect(409);
    expect(stale.body.code).toBe('STALE_PROPOSAL');
    expect(await ctx.prisma.taskSchedule.count({ where: { userId: u.id } })).toBe(0);
    expect(await ctx.prisma.calendarEvent.count({ where: { userId: u.id, source: 'AI' } })).toBe(0);

    // Regenerating plans around the new meeting and supersedes the old proposal.
    const next = (await ctx.http().post(`/api/v1/planner/proposals/${p.id}/regenerate`).set(u.auth).expect(201)).body;
    expect(next).toMatchObject({ revision: 2, supersedesId: p.id, status: 'PENDING' });
    expect((await ctx.http().get(`/api/v1/planner/proposals/${p.id}`).set(u.auth).expect(200)).body.status).toBe('SUPERSEDED');
    await ctx.http().post(`/api/v1/planner/proposals/${next.id}/apply`).set(u.auth).expect(201);
  });

  it('keeps proposals private and validates requests', async () => {
    const { u } = await setup();
    const other = await signUp('Bob');
    const p = (await ctx.http().post('/api/v1/planner/proposals').set(u.auth).send(request).expect(201)).body;
    await ctx.http().get(`/api/v1/planner/proposals/${p.id}`).set(other.auth).expect(404);
    await ctx.http().post(`/api/v1/planner/proposals/${p.id}/apply`).set(other.auth).expect(404);
    await ctx.http().post(`/api/v1/planner/proposals/${p.id}/reject`).set(u.auth).expect(201);
    await ctx.http().post(`/api/v1/planner/proposals/${p.id}/apply`).set(u.auth).expect(409);

    await ctx.http().post('/api/v1/planner/proposals').set(u.auth).send({ ...request, endDate: addDaysKey(monday, 30) }).expect(400);
    const foreignTask = await ctx.http().post('/api/v1/tasks').set(other.auth).send({ title: 'Bob task', estimatedMinutes: 30 }).expect(201);
    await ctx.http().post('/api/v1/planner/proposals').set(u.auth).send({ ...request, taskIds: [foreignTask.body.id] }).expect(400);
  });

  it('reports honestly when the AI assistant is not configured', async () => {
    const { u } = await setup();
    const status = await ctx.http().get('/api/v1/planner/status').set(u.auth).expect(200);
    expect(status.body.aiConfigured).toBe(false);
    const chat = await ctx.http().post('/api/v1/planner/chat').set(u.auth).send({ message: 'Plan my week' }).expect(503);
    expect(chat.body.code).toBe('AI_NOT_CONFIGURED');
    expect(await ctx.prisma.aIConversation.count({ where: { userId: u.id } })).toBe(0);
  });
});
