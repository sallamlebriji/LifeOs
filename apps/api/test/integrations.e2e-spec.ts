import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GoogleCalendarService } from '../src/integrations/google-calendar.service';
import { NotificationsService } from '../src/notifications/notifications.module';
import { cookiesFrom, createTestApp, resetDatabase, uniqueEmail, WEB } from './app';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;

/** Minimal stand-in for Google's OAuth and Calendar endpoints. */
function fakeGoogle() {
  const remote = new Map<string, Record<string, unknown>>();
  const calls: string[] = [];
  let syncTokenUsed: string | null = null;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const idToken = `x.${Buffer.from(JSON.stringify({ email: 'alice@gmail.test' })).toString('base64url')}.y`;
  const impl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? 'GET'} ${url.origin}${url.pathname}`);
    if (url.pathname === '/token') {
      const form = new URLSearchParams(String(init?.body));
      if (form.get('grant_type') === 'authorization_code' && form.get('code') === 'good-code' && form.get('code_verifier')) {
        return json(200, { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600, id_token: idToken, scope: 'calendar.events' });
      }
      return json(400, { error: 'invalid_grant' });
    }
    if (url.pathname === '/revoke') return json(200, {});
    if (url.pathname.endsWith('/events') && (init?.method ?? 'GET') === 'GET') {
      syncTokenUsed = url.searchParams.get('syncToken');
      return json(200, { items: [...remote.values()], nextSyncToken: 'sync-2' });
    }
    if (url.pathname.endsWith('/events') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      const id = `g-${remote.size + 1}`;
      remote.set(id, { ...body, id, etag: '"e1"' });
      return json(200, { id, etag: '"e1"' });
    }
    return json(404, {});
  };
  return { impl, remote, calls, syncToken: () => syncTokenUsed };
}

describe('Phase 5: notifications and Google Calendar (e2e, MySQL)', () => {
  let ctx: Ctx;

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
      .send({ email: uniqueEmail(name.toLowerCase()), password: 'correct-horse-42', displayName: name, timezone: 'Europe/Paris' })
      .expect(201);
    const c = cookiesFrom(res);
    return { id: res.body.user.id as string, email: res.body.user.email as string, cookie: `lifeos_at=${c.lifeos_at}`, auth: { ...WEB, Cookie: `lifeos_at=${c.lifeos_at}` } };
  }

  it('generates event, deadline and habit reminders once and delivers them in-app and by email', async () => {
    const a = await signUp();
    const soon = new Date(Date.now() + 10 * 60_000);
    await ctx.http().post('/api/v1/calendar/events').set(a.auth).send({ title: 'Call Sam', startAt: soon.toISOString(), endAt: new Date(soon.getTime() + 30 * 60_000).toISOString() }).expect(201);
    await ctx.http().post('/api/v1/tasks').set(a.auth).send({ title: 'Send invoice', dueAt: new Date(Date.now() + 30 * 60_000).toISOString() }).expect(201);
    await ctx.http().patch('/api/v1/preferences').set(a.auth).send({ emailReminders: true }).expect(200);

    const first = await ctx.http().get('/api/v1/notifications').set(a.auth).expect(200);
    expect(first.body.items.map((n: { title: string }) => n.title).sort()).toEqual(['Call Sam', 'Send invoice']);
    expect(first.body.unread).toBe(2);
    // Idempotent: a second pass creates nothing new.
    await ctx.http().get('/api/v1/notifications').set(a.auth).expect(200);
    expect(await ctx.prisma.notification.count({ where: { userId: a.id, channel: 'IN_APP' } })).toBe(2);

    const svc = ctx.app.get(NotificationsService);
    ctx.mail.sent.length = 0;
    await svc.dispatch(new Date());
    expect(ctx.mail.sent.filter((m) => m.to === a.email).map((m) => m.subject).sort()).toEqual(['LifeOS: Call Sam', 'LifeOS: Send invoice']);

    await ctx.http().post(`/api/v1/notifications/${first.body.items[0].id}/read`).set(a.auth).expect(204);
    await ctx.http().post('/api/v1/notifications/read-all').set(a.auth).expect(204);
    expect((await ctx.http().get('/api/v1/notifications').set(a.auth).expect(200)).body.unread).toBe(0);

    const other = await signUp('Bob');
    await ctx.http().post(`/api/v1/notifications/${first.body.items[0].id}/read`).set(other.auth).expect(404);
  });

  it('registers Expo push tokens and pushes reminders, forgetting dead devices', async () => {
    const a = await signUp();
    await ctx.http().post('/api/v1/devices').set(a.auth).send({ token: 'not-a-token', platform: 'ios' }).expect(400);
    await ctx.http().post('/api/v1/devices').set(a.auth).send({ token: 'ExponentPushToken[abc123]', platform: 'ios' }).expect(204);
    const svc = ctx.app.get(NotificationsService);
    const sent: unknown[] = [];
    svc.fetchImpl = async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }), { status: 200 });
    };
    const soon = new Date(Date.now() + 5 * 60_000);
    await ctx.http().post('/api/v1/calendar/events').set(a.auth).send({ title: 'Standup', startAt: soon.toISOString(), endAt: new Date(soon.getTime() + 900_000).toISOString() }).expect(201);
    await svc.generate(a.id);
    await svc.dispatch(new Date(), a.id);
    expect(sent).toEqual([[{ to: 'ExponentPushToken[abc123]', title: 'Standup', body: expect.stringContaining('Starts at'), sound: 'default' }]]);
    expect(await ctx.prisma.deviceToken.count({ where: { userId: a.id } })).toBe(0);
  });

  it('connects Google with PKCE, imports and exports events, encrypts credentials, and disconnects', async () => {
    const a = await signUp();
    const google = ctx.app.get(GoogleCalendarService);
    const fake = fakeGoogle();
    google.fetchImpl = fake.impl;
    fake.remote.set('ext-1', { id: 'ext-1', etag: '"1"', summary: 'Dentist', start: { dateTime: new Date(Date.now() + 86_400_000).toISOString() }, end: { dateTime: new Date(Date.now() + 90_000_000).toISOString() } });
    await ctx.http().post('/api/v1/calendar/events').set(a.auth).send({ title: 'Gym', startAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), endAt: new Date(Date.now() + 2 * 86_400_000 + 3_600_000).toISOString() }).expect(201);

    const start = await ctx.http().get('/api/v1/integrations/google/connect').set(a.auth).expect(200);
    const authUrl = new URL(start.body.url);
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authUrl.searchParams.get('access_type')).toBe('offline');
    const state = authUrl.searchParams.get('state')!;
    const oauthCookie = cookiesFrom(start).lifeos_oauth!;

    // Wrong state → back to settings with a failure, nothing stored.
    const bad = await ctx.http().get('/api/v1/integrations/google/callback').query({ code: 'good-code', state: 'forged' }).set({ Cookie: `${a.cookie}; lifeos_oauth=${oauthCookie}` }).expect(302);
    expect(bad.headers.location).toContain('google=failed');
    expect(await ctx.prisma.integration.count({ where: { userId: a.id } })).toBe(0);

    const ok = await ctx.http().get('/api/v1/integrations/google/callback').query({ code: 'good-code', state }).set({ Cookie: `${a.cookie}; lifeos_oauth=${oauthCookie}` }).expect(302);
    expect(ok.headers.location).toContain('google=connected');

    const row = await ctx.prisma.integration.findFirstOrThrow({ where: { userId: a.id } });
    expect(row.externalAccountId).toBe('alice@gmail.test');
    expect(row.encryptedCredentials).toMatch(/^v1:/);
    expect(row.encryptedCredentials).not.toContain('rt-1');

    const imported = await ctx.prisma.calendarEvent.findFirstOrThrow({ where: { userId: a.id, externalId: 'ext-1' } });
    expect(imported).toMatchObject({ title: 'Dentist', source: 'EXTERNAL', flexibility: 'FIXED' });
    const exported = await ctx.prisma.calendarEvent.findFirstOrThrow({ where: { userId: a.id, title: 'Gym' } });
    expect(exported.externalId).toMatch(/^g-/);

    // Incremental sync uses the token, deletes cancelled events and skips our own exports.
    fake.remote.set('ext-1', { id: 'ext-1', status: 'cancelled' });
    const status = await ctx.http().post('/api/v1/integrations/google/sync').set(a.auth).expect(201);
    expect(fake.syncToken()).toBe('sync-2');
    expect(status.body).toMatchObject({ connected: true, account: 'alice@gmail.test', lastSync: { status: 'SUCCESS' } });
    expect(await ctx.prisma.calendarEvent.count({ where: { userId: a.id, externalId: 'ext-1' } })).toBe(0);
    expect(await ctx.prisma.calendarEvent.count({ where: { userId: a.id, title: 'Gym' } })).toBe(1);

    const list = await ctx.http().get('/api/v1/integrations').set(a.auth).expect(200);
    expect(list.body.find((i: { provider: string }) => i.provider === 'APPLE_CALENDAR')).toMatchObject({ available: false });

    await ctx.http().delete('/api/v1/integrations/google').set(a.auth).expect(204);
    expect(fake.calls.some((c) => c.includes('/revoke'))).toBe(true);
    expect(await ctx.prisma.integration.count({ where: { userId: a.id } })).toBe(0);
    expect((await ctx.prisma.calendarEvent.findFirstOrThrow({ where: { userId: a.id, title: 'Gym' } })).externalId).toBeNull();
  });

  it('mirrors on-device (Apple) calendar snapshots for the planner', async () => {
    const a = await signUp();
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const base = Date.now();
    const ev = (id: string, title: string, h: number) => ({
      externalId: id,
      title,
      startAt: new Date(base + h * 3_600_000).toISOString(),
      endAt: new Date(base + (h + 1) * 3_600_000).toISOString(),
    });
    const first = await ctx.http().post('/api/v1/integrations/apple/import').set(a.auth).send({ from, to, events: [ev('a', 'Doctor', 24), ev('b', 'Flight', 48)] }).expect(201);
    expect(first.body).toEqual({ imported: 2, removed: 0 });
    const again = await ctx.http().post('/api/v1/integrations/apple/import').set(a.auth).send({ from, to, events: [ev('a', 'Doctor', 24)] }).expect(201);
    expect(again.body).toEqual({ imported: 0, removed: 1 });
    const row = await ctx.prisma.calendarEvent.findFirstOrThrow({ where: { userId: a.id, title: 'Doctor' } });
    expect(row).toMatchObject({ source: 'EXTERNAL', flexibility: 'FIXED' });
    const list = await ctx.http().get('/api/v1/integrations').set(a.auth).expect(200);
    expect(list.body.find((i: { provider: string }) => i.provider === 'APPLE_CALENDAR')).toMatchObject({ connected: true });
    await ctx.http().post('/api/v1/integrations/apple/import').set(a.auth).send({ from: to, to: from, events: [] }).expect(400);
    await ctx.http().delete('/api/v1/integrations/apple').set(a.auth).expect(204);
    expect(await ctx.prisma.calendarEvent.count({ where: { userId: a.id, source: 'EXTERNAL' } })).toBe(0);
  });
});
