import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cookiesFrom, createTestApp, resetDatabase, uniqueEmail, WEB } from './app';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;

describe('Phase 2 modules (e2e, MySQL)', () => {
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
    const res = await ctx
      .http()
      .post('/api/v1/auth/register')
      .set(WEB)
      .send({ email, password, displayName: name, timezone: 'Europe/Paris' })
      .expect(201);
    const c = cookiesFrom(res);
    return { id: res.body.user.id as string, auth: { ...WEB, Cookie: `lifeos_at=${c.lifeos_at}` } };
  }

  describe('tasks', () => {
    it('creates, lists with pagination, updates with version checks and deletes', async () => {
      const a = await signUp();
      for (const [i, priority] of (['LOW', 'URGENT', 'MEDIUM'] as const).entries()) {
        await ctx.http().post('/api/v1/tasks').set(a.auth).send({ title: `Task ${i}`, priority }).expect(201);
      }
      const page1 = await ctx.http().get('/api/v1/tasks?limit=2').set(a.auth).expect(200);
      expect(page1.body.items.map((t: { priority: string }) => t.priority)).toEqual(['URGENT', 'MEDIUM']);
      expect(page1.body.nextCursor).toBeTruthy();
      const page2 = await ctx.http().get(`/api/v1/tasks?limit=2&cursor=${page1.body.nextCursor}`).set(a.auth).expect(200);
      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();

      const task = page1.body.items[0];
      const updated = await ctx
        .http()
        .patch(`/api/v1/tasks/${task.id}`)
        .set(a.auth)
        .send({ version: task.version, title: 'Renamed', estimatedMinutes: 30 })
        .expect(200);
      expect(updated.body).toMatchObject({ title: 'Renamed', version: task.version + 1 });
      // Stale version → 409, not a silent overwrite.
      await ctx.http().patch(`/api/v1/tasks/${task.id}`).set(a.auth).send({ version: task.version, title: 'Lost' }).expect(409);
      await ctx.http().patch(`/api/v1/tasks/${task.id}`).set(a.auth).send({ version: 99 }).expect(400); // nothing to update

      await ctx.http().delete(`/api/v1/tasks/${task.id}`).set(a.auth).expect(204);
      await ctx.http().get(`/api/v1/tasks/${task.id}`).set(a.auth).expect(404);
    });

    it('validates fixed vs flexible scheduling', async () => {
      const a = await signUp();
      const bad = await ctx.http().post('/api/v1/tasks').set(a.auth).send({ title: 'Call', schedulingMode: 'FIXED' }).expect(400);
      expect(bad.body.issues.fixedStartAt).toBeDefined();
      await ctx
        .http()
        .post('/api/v1/tasks')
        .set(a.auth)
        .send({ title: 'Call', schedulingMode: 'FIXED', fixedStartAt: '2026-11-20T09:00:00Z', splittable: true })
        .expect(400);
      await ctx
        .http()
        .post('/api/v1/tasks')
        .set(a.auth)
        .send({ title: 'Call', schedulingMode: 'FIXED', fixedStartAt: '2026-11-20T09:00:00Z' })
        .expect(201);
    });

    it('supports one level of subtasks', async () => {
      const a = await signUp();
      const parent = await ctx.http().post('/api/v1/tasks').set(a.auth).send({ title: 'Trip prep' }).expect(201);
      const child = await ctx.http().post('/api/v1/tasks').set(a.auth).send({ title: 'Passport', parentId: parent.body.id }).expect(201);
      await ctx.http().post('/api/v1/tasks').set(a.auth).send({ title: 'Too deep', parentId: child.body.id }).expect(400);
      await ctx.http().patch(`/api/v1/tasks/${child.body.id}/status`).set(a.auth).send({ status: 'COMPLETED' }).expect(200);
      const detail = await ctx.http().get(`/api/v1/tasks/${parent.body.id}`).set(a.auth).expect(200);
      expect(detail.body).toMatchObject({ subtaskCount: 1, subtasksDone: 1 });
      expect(detail.body.subtasks[0].title).toBe('Passport');
      const list = await ctx.http().get('/api/v1/tasks').set(a.auth).expect(200);
      expect(list.body.items).toHaveLength(1); // subtasks hidden from the top-level list
    });

    it('enforces dependencies: no cycles, no completing a blocked task', async () => {
      const a = await signUp();
      const [x, y] = await Promise.all(
        ['Write', 'Publish'].map((title) => ctx.http().post('/api/v1/tasks').set(a.auth).send({ title }).expect(201)),
      );
      await ctx.http().post(`/api/v1/tasks/${y!.body.id}/dependencies`).set(a.auth).send({ dependsOnId: x!.body.id }).expect(201);
      const cycle = await ctx.http().post(`/api/v1/tasks/${x!.body.id}/dependencies`).set(a.auth).send({ dependsOnId: y!.body.id }).expect(400);
      expect(cycle.body.message).toMatch(/circular/);
      const blocked = await ctx.http().patch(`/api/v1/tasks/${y!.body.id}/status`).set(a.auth).send({ status: 'COMPLETED' }).expect(409);
      expect(blocked.body.message).toMatch(/Write/);
      await ctx.http().patch(`/api/v1/tasks/${x!.body.id}/status`).set(a.auth).send({ status: 'COMPLETED' }).expect(200);
      await ctx.http().patch(`/api/v1/tasks/${y!.body.id}/status`).set(a.auth).send({ status: 'COMPLETED' }).expect(200);
    });

    it('rolls a recurring task forward when completed and tracks time', async () => {
      const a = await signUp();
      const t = await ctx
        .http()
        .post('/api/v1/tasks')
        .set(a.auth)
        .send({ title: 'Weekly review', plannedDate: '2026-11-20', recurrenceRule: 'FREQ=WEEKLY;BYDAY=FR' })
        .expect(201);
      await ctx.http().post(`/api/v1/tasks/${t.body.id}/time`).set(a.auth).send({ minutes: 20 }).expect(201);
      const logged = await ctx.http().post(`/api/v1/tasks/${t.body.id}/time`).set(a.auth).send({ minutes: 15 }).expect(201);
      expect(logged.body.actualMinutes).toBe(35);
      await ctx.http().patch(`/api/v1/tasks/${t.body.id}/status`).set(a.auth).send({ status: 'COMPLETED' }).expect(200);
      const open = await ctx.http().get('/api/v1/tasks?status=OPEN').set(a.auth).expect(200);
      expect(open.body.items).toHaveLength(1);
      expect(open.body.items[0]).toMatchObject({ title: 'Weekly review', plannedDate: '2026-11-27', recurrenceRule: 'FREQ=WEEKLY;BYDAY=FR' });
      await ctx.http().post('/api/v1/tasks').set(a.auth).send({ title: 'Bad', recurrenceRule: 'FREQ=SECONDLY' }).expect(400);
    });

    it('never lets one user reference or touch another user’s rows', async () => {
      const a = await signUp('Alice');
      const b = await signUp('Bob');
      const project = await ctx.http().post('/api/v1/projects').set(a.auth).send({ name: 'Secret' }).expect(201);
      const task = await ctx.http().post('/api/v1/tasks').set(a.auth).send({ title: 'Mine' }).expect(201);
      const ref = await ctx.http().post('/api/v1/tasks').set(b.auth).send({ title: 'Sneaky', projectId: project.body.id }).expect(400);
      expect(ref.body.message).toBe('Project not found');
      await ctx.http().get(`/api/v1/tasks/${task.body.id}`).set(b.auth).expect(404);
      await ctx.http().patch(`/api/v1/tasks/${task.body.id}`).set(b.auth).send({ version: 1, title: 'x' }).expect(404);
      await ctx.http().delete(`/api/v1/tasks/${task.body.id}`).set(b.auth).expect(404);
      await ctx.http().get(`/api/v1/projects/${project.body.id}`).set(b.auth).expect(404);
      const bList = await ctx.http().get('/api/v1/tasks').set(b.auth).expect(200);
      expect(bList.body.items).toEqual([]);
    });
  });

  describe('goals and projects', () => {
    it('keeps the goal hierarchy coherent and records progress', async () => {
      const a = await signUp();
      const annual = await ctx.http().post('/api/v1/goals').set(a.auth).send({ title: 'Run a marathon', level: 'ANNUAL' }).expect(201);
      const monthly = await ctx
        .http()
        .post('/api/v1/goals')
        .set(a.auth)
        .send({ title: 'Run 100 km', level: 'MONTHLY', parentId: annual.body.id, targetValue: 100, unit: 'km' })
        .expect(201);
      await ctx.http().post('/api/v1/goals').set(a.auth).send({ title: 'Wrong way', level: 'ANNUAL', parentId: monthly.body.id }).expect(400);
      await ctx.http().patch(`/api/v1/goals/${annual.body.id}`).set(a.auth).send({ parentId: monthly.body.id }).expect(400);

      await ctx.http().post(`/api/v1/goals/${monthly.body.id}/progress`).set(a.auth).send({ value: 40, note: 'Week 1' }).expect(201);
      const done = await ctx.http().post(`/api/v1/goals/${monthly.body.id}/progress`).set(a.auth).send({ value: 100 }).expect(201);
      expect(done.body).toMatchObject({ status: 'COMPLETED', progress: 1, currentValue: 100 });
      expect(done.body.progressLog.map((e: { value: number }) => e.value)).toEqual([40, 100]);

      const ms = await ctx.http().post(`/api/v1/goals/${annual.body.id}/milestones`).set(a.auth).send({ title: 'Half marathon' }).expect(201);
      await ctx.http().post(`/api/v1/goals/${annual.body.id}/milestones`).set(a.auth).send({ title: 'Full marathon' }).expect(201);
      const toggled = await ctx
        .http()
        .patch(`/api/v1/goals/${annual.body.id}/milestones/${ms.body.milestones[0].id}`)
        .set(a.auth)
        .send({ completed: true })
        .expect(200);
      expect(toggled.body.progress).toBe(0.5);
      await ctx.http().post('/api/v1/goals').set(a.auth).send({ title: 'x', level: 'WEEKLY', startDate: '2026-12-01', deadline: '2026-11-01' }).expect(400);
    });

    it('summarises project tasks per column with tracked time and milestones', async () => {
      const a = await signUp();
      const p = await ctx.http().post('/api/v1/projects').set(a.auth).send({ name: 'Website', color: '#0A84FF' }).expect(201);
      const t1 = await ctx.http().post('/api/v1/tasks').set(a.auth).send({ title: 'Design', projectId: p.body.id, estimatedMinutes: 120 }).expect(201);
      await ctx.http().post('/api/v1/tasks').set(a.auth).send({ title: 'Build', projectId: p.body.id, estimatedMinutes: 240 }).expect(201);
      await ctx.http().patch(`/api/v1/tasks/${t1.body.id}/status`).set(a.auth).send({ status: 'IN_PROGRESS' }).expect(200);
      await ctx.http().post(`/api/v1/tasks/${t1.body.id}/time`).set(a.auth).send({ minutes: 90 }).expect(201);
      await ctx.http().post(`/api/v1/projects/${p.body.id}/milestones`).set(a.auth).send({ title: 'Launch', dueDate: '2026-12-15' }).expect(201);
      const got = await ctx.http().get(`/api/v1/projects/${p.body.id}`).set(a.auth).expect(200);
      expect(got.body).toMatchObject({
        taskCounts: { TODO: 1, IN_PROGRESS: 1, COMPLETED: 0, CANCELLED: 0 },
        trackedMinutes: 90,
        estimatedMinutes: 360,
      });
      expect(got.body.milestones[0]).toMatchObject({ title: 'Launch', dueDate: '2026-12-15', completedAt: null });
      const board = await ctx.http().get(`/api/v1/tasks?projectId=${p.body.id}&sort=manual`).set(a.auth).expect(200);
      expect(board.body.items).toHaveLength(2);
      // Deleting the project keeps its tasks (unassigned).
      await ctx.http().delete(`/api/v1/projects/${p.body.id}`).set(a.auth).expect(204);
      const after = await ctx.http().get('/api/v1/tasks').set(a.auth).expect(200);
      expect(after.body.items.every((t: { projectId: string | null }) => t.projectId === null)).toBe(true);
    });
  });

  describe('calendar and availability', () => {
    it('expands recurring events in the event timezone and reports conflicts', async () => {
      const a = await signUp();
      // Weekly Monday 09:00 Paris across the 25 Oct DST change.
      await ctx
        .http()
        .post('/api/v1/calendar/events')
        .set(a.auth)
        .send({ title: 'Stand-up', startAt: '2026-10-19T07:00:00Z', endAt: '2026-10-19T07:30:00Z', recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO' })
        .expect(201);
      const clash = await ctx
        .http()
        .post('/api/v1/calendar/events')
        .set(a.auth)
        .send({ title: 'Dentist', startAt: '2026-10-26T08:15:00Z', endAt: '2026-10-26T09:00:00Z' })
        .expect(201);
      expect(clash.body.conflicts.map((c: { title: string }) => c.title)).toEqual(['Stand-up']);

      const range = await ctx
        .http()
        .get('/api/v1/calendar/events')
        .query({ from: '2026-10-18T00:00:00Z', to: '2026-11-03T00:00:00Z' })
        .set(a.auth)
        .expect(200);
      const standups = range.body.events.filter((e: { title: string }) => e.title === 'Stand-up');
      expect(standups.map((e: { startAt: string }) => e.startAt)).toEqual([
        '2026-10-19T07:00:00.000Z',
        '2026-10-26T08:00:00.000Z',
        '2026-11-02T08:00:00.000Z',
      ]);
      expect(range.body.conflicts).toHaveLength(1);
      expect(range.body.conflicts[0]).toMatchObject({ overlapMinutes: 15 });

      await ctx.http().get('/api/v1/calendar/events').query({ from: '2026-01-01T00:00:00Z', to: '2026-06-01T00:00:00Z' }).set(a.auth).expect(400);
      await ctx
        .http()
        .post('/api/v1/calendar/events')
        .set(a.auth)
        .send({ title: 'Backwards', startAt: '2026-11-20T10:00:00Z', endAt: '2026-11-20T09:00:00Z' })
        .expect(400);
    });

    it('refuses to move a locked event until it is unlocked', async () => {
      const a = await signUp();
      const created = await ctx
        .http()
        .post('/api/v1/calendar/events')
        .set(a.auth)
        .send({ title: 'Exam', startAt: '2026-11-25T08:00:00Z', endAt: '2026-11-25T10:00:00Z', locked: true })
        .expect(201);
      const ev = created.body.event;
      const refused = await ctx
        .http()
        .patch(`/api/v1/calendar/events/${ev.id}`)
        .set(a.auth)
        .send({ version: ev.version, startAt: '2026-11-25T09:00:00Z', endAt: '2026-11-25T11:00:00Z' })
        .expect(409);
      expect(refused.body.message).toMatch(/locked/);
      // Non-time edits are fine on a locked event.
      const renamed = await ctx.http().patch(`/api/v1/calendar/events/${ev.id}`).set(a.auth).send({ version: ev.version, title: 'Final exam' }).expect(200);
      const moved = await ctx
        .http()
        .patch(`/api/v1/calendar/events/${ev.id}`)
        .set(a.auth)
        .send({ version: renamed.body.event.version, locked: false, startAt: '2026-11-25T09:00:00Z', endAt: '2026-11-25T11:00:00Z' })
        .expect(200);
      expect(moved.body.event).toMatchObject({ locked: false, startAt: '2026-11-25T09:00:00.000Z' });
    });

    it('validates and stores availability rules', async () => {
      const a = await signUp();
      await ctx.http().post('/api/v1/availability').set(a.auth).send({ kind: 'WORKING_HOURS', weekday: 1, startTime: '09:00', endTime: '08:00' }).expect(400);
      await ctx.http().post('/api/v1/availability').set(a.auth).send({ kind: 'UNAVAILABLE' }).expect(400);
      const rule = await ctx
        .http()
        .post('/api/v1/availability')
        .set(a.auth)
        .send({ kind: 'WORKING_HOURS', weekday: 1, startTime: '09:00', endTime: '17:00' })
        .expect(201);
      expect(rule.body).toMatchObject({ weekday: 1, timezone: 'Europe/Paris', active: true });
      await ctx
        .http()
        .post('/api/v1/availability')
        .set(a.auth)
        .send({ kind: 'UNAVAILABLE', label: 'Holiday', startsAt: '2026-12-24T00:00:00Z', endsAt: '2026-12-27T00:00:00Z' })
        .expect(201);
      const list = await ctx.http().get('/api/v1/availability').set(a.auth).expect(200);
      expect(list.body).toHaveLength(2);
      await ctx.http().delete(`/api/v1/availability/${rule.body.id}`).set(a.auth).expect(204);
    });
  });

  describe('habits and categories', () => {
    it('creates custom-frequency habits and reports stats', async () => {
      const a = await signUp();
      await ctx.http().post('/api/v1/habits').set(a.auth).send({ name: 'Gym', frequency: 'WEEKLY' }).expect(400);
      const gym = await ctx
        .http()
        .post('/api/v1/habits')
        .set(a.auth)
        .send({ name: 'Gym', frequency: 'CUSTOM', timesPerWeek: 3, reminderTime: '18:30' })
        .expect(201);
      expect(gym.body).toMatchObject({ timesPerWeek: 3, reminderTime: '18:30', archived: false });
      const read = await ctx.http().post('/api/v1/habits').set(a.auth).send({ name: 'Read' }).expect(201);
      const today = new Date().toISOString().slice(0, 10);
      await ctx.http().put(`/api/v1/habits/${read.body.id}/completion`).set(a.auth).send({ date: today, done: true }).expect(200);
      const list = await ctx.http().get('/api/v1/habits').set(a.auth).expect(200);
      const readDto = list.body.find((h: { name: string }) => h.name === 'Read');
      expect(readDto.stats.totalCompletions).toBe(1);
      expect(readDto.recent).toContain(today);

      await ctx.http().patch(`/api/v1/habits/${gym.body.id}`).set(a.auth).send({ archived: true }).expect(200);
      const active = await ctx.http().get('/api/v1/habits').set(a.auth).expect(200);
      expect(active.body.map((h: { name: string }) => h.name)).toEqual(['Read']);
      const archived = await ctx.http().get('/api/v1/habits?archived=true').set(a.auth).expect(200);
      expect(archived.body.map((h: { name: string }) => h.name)).toEqual(['Gym']);
    });

    it('manages categories with unique names per user', async () => {
      const a = await signUp();
      const list = await ctx.http().get('/api/v1/categories').set(a.auth).expect(200);
      expect(list.body.map((c: { name: string }) => c.name)).toContain('Work');
      await ctx.http().post('/api/v1/categories').set(a.auth).send({ name: 'Work', color: '#000000' }).expect(409);
      const created = await ctx.http().post('/api/v1/categories').set(a.auth).send({ name: 'Family', color: '#FF9F0A', kind: 'SOCIAL' }).expect(201);
      await ctx.http().patch(`/api/v1/categories/${created.body.id}`).set(a.auth).send({ color: 'red' }).expect(400);
      await ctx.http().delete(`/api/v1/categories/${created.body.id}`).set(a.auth).expect(204);
    });
  });
});
