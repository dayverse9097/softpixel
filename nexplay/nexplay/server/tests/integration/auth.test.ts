import request from 'supertest';
import { authenticator } from 'otplib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EMAIL, ORIGIN, PASSWORD, call, cookieOf, createAdmin, hasDb, makeCtx, resetDb, signIn, type Ctx } from './helpers.js';

describe.skipIf(!hasDb)('authentication and sessions', () => {
  let ctx: Ctx;
  beforeAll(() => {
    ctx = makeCtx();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetDb(ctx.deps.db);
    await createAdmin(ctx.deps.db);
  });

  const csrfToken = async (agent: ReturnType<typeof request.agent>) => (await agent.get('/api/auth/csrf').set('Origin', ORIGIN)).body.csrfToken as string;

  it('signs in and returns a hardened cookie and no password data', async () => {
    const agent = request.agent(ctx.app);
    const token = await csrfToken(agent);
    const res = await agent.post('/api/auth/login').set('Origin', ORIGIN).set('X-CSRF-Token', token).send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const attempt = async (email: string, password: string) => {
      const agent = request.agent(ctx.app);
      const token = await csrfToken(agent);
      return agent.post('/api/auth/login').set('Origin', ORIGIN).set('X-CSRF-Token', token).send({ email, password });
    };
    const wrong = await attempt(EMAIL, 'definitely not the password');
    const unknown = await attempt('nobody@example.com', 'definitely not the password');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('refuses login without a CSRF token or from a foreign origin', async () => {
    const agent = request.agent(ctx.app);
    const token = await csrfToken(agent);
    const noToken = await agent.post('/api/auth/login').set('Origin', ORIGIN).send({ email: EMAIL, password: PASSWORD });
    expect(noToken.status).toBe(403);
    const foreign = await agent.post('/api/auth/login').set('Origin', 'https://evil.test').set('X-CSRF-Token', token).send({ email: EMAIL, password: PASSWORD });
    expect(foreign.status).toBe(403);
    const noOrigin = await agent.post('/api/auth/login').set('X-CSRF-Token', token).send({ email: EMAIL, password: PASSWORD });
    expect(noOrigin.status).toBe(403);
  });

  it('issues a new session id at login (no session fixation)', async () => {
    const agent = request.agent(ctx.app);
    const pre = await agent.get('/api/auth/csrf').set('Origin', ORIGIN);
    const before = cookieOf(pre).split(';')[0];
    const res = await agent.post('/api/auth/login').set('Origin', ORIGIN).set('X-CSRF-Token', pre.body.csrfToken).send({ email: EMAIL, password: PASSWORD });
    const after = cookieOf(res).split(';')[0];
    expect(after).not.toBe('');
    expect(after).not.toBe(before);
  });

  it('logout ends the session on the server, so a stolen cookie stops working', async () => {
    const s = await signIn(ctx.app);
    expect((await call(s, 'get', '/api/auth/me')).status).toBe(200);
    expect((await request(ctx.app).get('/api/auth/me').set('Cookie', s.cookie)).status).toBe(200);
    expect((await call(s, 'post', '/api/auth/logout')).status).toBe(204);
    expect((await call(s, 'get', '/api/auth/me')).status).toBe(401);
    // Replaying the old cookie fails because the session was destroyed on the server, not just in the browser.
    expect((await request(ctx.app).get('/api/auth/me').set('Cookie', s.cookie)).status).toBe(401);
  });

  it('ends a session when the account is removed', async () => {
    const s = await signIn(ctx.app);
    await ctx.deps.db.user.deleteMany({});
    expect((await call(s, 'get', '/api/admin/games')).status).toBe(401);
  });

  it('changing the password ends other sessions', async () => {
    const first = await signIn(ctx.app);
    const second = await signIn(ctx.app);
    const res = await call(second, 'post', '/api/auth/password').send({ currentPassword: PASSWORD, newPassword: 'another long passphrase 2026' });
    expect(res.status).toBe(200);
    expect((await call(first, 'get', '/api/auth/me')).status).toBe(401);
    expect((await call(second, 'get', '/api/auth/me')).status).toBe(200);
  });

  it('rejects weak new passwords and a wrong current password', async () => {
    const s = await signIn(ctx.app);
    expect((await call(s, 'post', '/api/auth/password').send({ currentPassword: PASSWORD, newPassword: 'short' })).status).toBe(400);
    expect((await call(s, 'post', '/api/auth/password').send({ currentPassword: 'wrong', newPassword: 'another long passphrase 2026' })).status).toBe(403);
  });

  it('two-factor: setup, enable, required at login, codes cannot be replayed, recovery codes work once', async () => {
    const s = await signIn(ctx.app);
    const setup = await call(s, 'post', '/api/auth/mfa/setup').send({ password: PASSWORD });
    expect(setup.status).toBe(200);
    const secret = setup.body.secret as string;
    const stored = await ctx.deps.db.user.findFirstOrThrow();
    expect(stored.totpSecretEnc).not.toContain(secret); // encrypted at rest

    const enable = await call(s, 'post', '/api/auth/mfa/enable').send({ code: authenticator.generate(secret) });
    expect(enable.status).toBe(200);
    const recovery = enable.body.recoveryCodes as string[];
    expect(recovery).toHaveLength(10);
    const rows = await ctx.deps.db.recoveryCode.findMany();
    expect(JSON.stringify(rows)).not.toContain(recovery[0]); // only hashes are stored

    const login = async (extra: Record<string, string>) => {
      const agent = request.agent(ctx.app);
      const token = await csrfToken(agent);
      return agent.post('/api/auth/login').set('Origin', ORIGIN).set('X-CSRF-Token', token).send({ email: EMAIL, password: PASSWORD, ...extra });
    };
    expect((await login({})).body.error).toBe('mfa_required');
    expect((await login({ totp: '000000' })).status).toBe(401);

    // The code used to enable MFA was already accepted, so it cannot be used again in the same window.
    expect((await login({ totp: authenticator.generate(secret) })).status).toBe(401);

    const code = recovery[0] as string;
    expect((await login({ recoveryCode: code })).status).toBe(200);
    expect((await login({ recoveryCode: code })).status).toBe(401);
  });

  it('records sign-ins in the audit trail without secrets', async () => {
    await signIn(ctx.app);
    const events = await ctx.deps.db.auditEvent.findMany();
    expect(events.map((e) => e.action)).toContain('auth.login');
    expect(JSON.stringify(events)).not.toContain(PASSWORD);
  });
});

describe.skipIf(!hasDb)('login rate limiting', () => {
  let ctx: Ctx;
  beforeAll(() => {
    ctx = makeCtx({}, { scale: 1, loginAccountPoints: 3 });
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetDb(ctx.deps.db);
    await createAdmin(ctx.deps.db);
  });

  it('answers 429 with Retry-After after repeated failures on one account', async () => {
    const statuses: number[] = [];
    let retryAfter: string | undefined;
    for (let i = 0; i < 5; i++) {
      const agent = request.agent(ctx.app);
      const token = (await agent.get('/api/auth/csrf').set('Origin', ORIGIN)).body.csrfToken as string;
      const res = await agent.post('/api/auth/login').set('Origin', ORIGIN).set('X-CSRF-Token', token).send({ email: EMAIL, password: 'wrong password here' });
      statuses.push(res.status);
      if (res.status === 429) retryAfter = res.headers['retry-after'];
    }
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses[3]).toBe(429);
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });
});
