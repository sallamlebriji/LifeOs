import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cookiesFrom, createTestApp, resetDatabase, tokenFromMail, uniqueEmail, WEB } from './app';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;

describe('Auth (e2e, MySQL)', () => {
  let ctx: Ctx;
  const password = 'correct-horse-42';

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  async function register(email = uniqueEmail()) {
    const res = await ctx
      .http()
      .post('/api/v1/auth/register')
      .set(WEB)
      .send({ email, password, displayName: 'Test User' })
      .expect(201);
    return { res, email, cookies: cookiesFrom(res) };
  }

  it('registers a user with preferences, default categories and a hashed password', async () => {
    const { res, email, cookies } = await register();
    expect(res.body.user).toMatchObject({ email, displayName: 'Test User', emailVerified: false });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined(); // web clients only get the cookie
    expect(cookies.lifeos_at).toBeTruthy();
    expect(cookies.lifeos_rt).toBeTruthy();

    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { email },
      include: { preferences: true, categories: true },
    });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.preferences?.timezone).toBe('Africa/Casablanca');
    expect(user.categories).toHaveLength(6);
    // Refresh token is stored hashed only.
    const session = await ctx.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.tokenHash).not.toBe(cookies.lifeos_rt);
  });

  it('rejects duplicate emails and invalid payloads with field issues', async () => {
    const { email } = await register();
    await ctx.http().post('/api/v1/auth/register').set(WEB).send({ email, password, displayName: 'X' }).expect(409);
    const bad = await ctx
      .http()
      .post('/api/v1/auth/register')
      .set(WEB)
      .send({ email: 'nope', password: 'short', displayName: '' })
      .expect(400);
    expect(Object.keys(bad.body.issues)).toEqual(expect.arrayContaining(['email', 'password', 'displayName']));
  });

  it('requires the client header on cookie-authenticated mutations (CSRF)', async () => {
    await ctx
      .http()
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail(), password, displayName: 'No header' })
      .expect(403);
  });

  it('logs in, rejects wrong passwords with a generic message, and audits both', async () => {
    const { email } = await register();
    const bad = await ctx.http().post('/api/v1/auth/login').set(WEB).send({ email, password: 'wrong-password-1' }).expect(401);
    expect(bad.body.message).toBe('Incorrect email or password');
    const unknown = await ctx
      .http()
      .post('/api/v1/auth/login')
      .set(WEB)
      .send({ email: uniqueEmail('ghost'), password })
      .expect(401);
    expect(unknown.body.message).toBe(bad.body.message);

    const ok = await ctx.http().post('/api/v1/auth/login').set(WEB).send({ email: email.toUpperCase(), password }).expect(200);
    expect(ok.body.accessToken).toBeTruthy();
    const actions = await ctx.prisma.auditLog.findMany({ where: { user: { email } }, select: { action: true } });
    expect(actions.map((a) => a.action)).toEqual(expect.arrayContaining(['auth.login', 'auth.login_failed']));
  });

  it('protects routes and accepts both cookie and bearer authentication', async () => {
    await ctx.http().get('/api/v1/users/me').expect(401);
    const { res, cookies } = await register();
    await ctx.http().get('/api/v1/users/me').set('Cookie', `lifeos_at=${cookies.lifeos_at}`).expect(200);
    const me = await ctx.http().get('/api/v1/users/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
    expect(me.body.preferences.timezone).toBe('Africa/Casablanca');
  });

  it('rotates refresh tokens and revokes the family when an old token is reused', async () => {
    const { cookies } = await register();
    const first = await ctx
      .http()
      .post('/api/v1/auth/refresh')
      .set(WEB)
      .set('Cookie', `lifeos_rt=${cookies.lifeos_rt}`)
      .expect(200);
    const rotated = cookiesFrom(first);
    expect(rotated.lifeos_rt).toBeTruthy();
    expect(rotated.lifeos_rt).not.toBe(cookies.lifeos_rt);

    // Replay the original (already rotated) token → theft assumed.
    await ctx.http().post('/api/v1/auth/refresh').set(WEB).set('Cookie', `lifeos_rt=${cookies.lifeos_rt}`).expect(401);
    // The legitimate successor is now revoked too.
    await ctx.http().post('/api/v1/auth/refresh').set(WEB).set('Cookie', `lifeos_rt=${rotated.lifeos_rt}`).expect(401);
    await ctx.http().get('/api/v1/users/me').set('Cookie', `lifeos_at=${rotated.lifeos_at}`).expect(401);
  });

  it('returns the refresh token in the body for mobile clients', async () => {
    const res = await ctx
      .http()
      .post('/api/v1/auth/register')
      .set('X-LifeOS-Client', 'mobile')
      .send({ email: uniqueEmail('mobile'), password, displayName: 'Mobile' })
      .expect(201);
    expect(res.body.refreshToken).toBeTruthy();
    const refreshed = await ctx
      .http()
      .post('/api/v1/auth/refresh')
      .set('X-LifeOS-Client', 'mobile')
      .send({ refreshToken: res.body.refreshToken })
      .expect(200);
    expect(refreshed.body.refreshToken).not.toBe(res.body.refreshToken);
  });

  it('logout revokes the session immediately', async () => {
    const { cookies } = await register();
    const jar = `lifeos_at=${cookies.lifeos_at}; lifeos_rt=${cookies.lifeos_rt}`;
    await ctx.http().post('/api/v1/auth/logout').set(WEB).set('Cookie', jar).expect(204);
    await ctx.http().get('/api/v1/users/me').set('Cookie', jar).expect(401);
    await ctx.http().post('/api/v1/auth/refresh').set(WEB).set('Cookie', jar).expect(401);
  });

  it('verifies email with a single-use token', async () => {
    const { email } = await register();
    const mail = ctx.mail.sent.filter((m) => m.to === email).at(-1)!;
    const token = tokenFromMail(mail.text);
    await ctx.http().post('/api/v1/auth/verify-email').set(WEB).send({ token }).expect(204);
    await ctx.http().post('/api/v1/auth/verify-email').set(WEB).send({ token }).expect(401);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it('resets the password, signs out all sessions, and does not reveal unknown emails', async () => {
    const { email, cookies } = await register();
    const unknown = await ctx.http().post('/api/v1/auth/forgot-password').set(WEB).send({ email: uniqueEmail('nobody') }).expect(202);
    const known = await ctx.http().post('/api/v1/auth/forgot-password').set(WEB).send({ email }).expect(202);
    expect(unknown.body).toEqual(known.body);

    const token = tokenFromMail(ctx.mail.sent.filter((m) => m.to === email).at(-1)!.text);
    await ctx
      .http()
      .post('/api/v1/auth/reset-password')
      .set(WEB)
      .send({ token, password: 'a-brand-new-pass-9' })
      .expect(204);
    await ctx.http().get('/api/v1/users/me').set('Cookie', `lifeos_at=${cookies.lifeos_at}`).expect(401);
    await ctx.http().post('/api/v1/auth/login').set(WEB).send({ email, password }).expect(401);
    await ctx.http().post('/api/v1/auth/login').set(WEB).send({ email, password: 'a-brand-new-pass-9' }).expect(200);
  });

  it('rate-limits credential endpoints', async () => {
    process.env.ENABLE_THROTTLE_IN_TEST = 'true';
    try {
      const email = uniqueEmail('limited');
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        const r = await ctx.http().post('/api/v1/auth/login').set(WEB).send({ email, password: 'whatever-123' });
        statuses.push(r.status);
      }
      expect(statuses).toContain(429);
    } finally {
      delete process.env.ENABLE_THROTTLE_IN_TEST;
    }
  });
});
