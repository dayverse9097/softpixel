import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EMAIL, ORIGIN, call, createAdmin, createGame, hasDb, makeCtx, resetDb, signIn, type Ctx } from './helpers.js';

const SQLI = [
  "' OR '1'='1",
  "'; DROP TABLE \"Game\"; --",
  '" OR 1=1 --',
  "%' UNION SELECT passwordHash FROM \"User\" --",
  "1; SELECT pg_sleep(5)",
  "\\'; DELETE FROM \"User\"; --",
  '${7*7}',
  '{{7*7}}',
  "admin'/*",
];
// Internals that must never reach a client. (Validation errors may echo the caller's own input; that is not a leak.)
const LEAKS = /PrismaClient|prisma\.|syntax error at|node_modules|at Object\.|\.ts:\d+|ECONNREFUSED/i;

describe.skipIf(!hasDb)('SQL injection attempts', () => {
  let ctx: Ctx;
  beforeAll(() => {
    ctx = makeCtx();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetDb(ctx.deps.db);
    await createAdmin(ctx.deps.db);
  });

  it.each(SQLI)('public search, filters and slug survive %j', async (payload) => {
    const s = await signIn(ctx.app);
    await createGame(s, { title: 'Neon Pong' });
    const before = await ctx.deps.db.game.count();
    const probes = [
      request(ctx.app).get('/api/games').query({ q: payload }),
      request(ctx.app).get('/api/games').query({ category: payload }),
      request(ctx.app).get('/api/games').query({ sort: payload }),
      request(ctx.app).get('/api/games').query({ page: payload }),
      request(ctx.app).get(`/api/games/${encodeURIComponent(payload)}`),
      request(ctx.app).post(`/api/games/${encodeURIComponent(payload)}/launch`),
      call(s, 'get', '/api/admin/games').query({ q: payload, status: payload }),
    ];
    for (const res of await Promise.all(probes)) {
      expect([200, 400, 404]).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toMatch(LEAKS);
    }
    expect(await ctx.deps.db.game.count()).toBe(before); // nothing was dropped or deleted
    expect(await ctx.deps.db.user.count()).toBe(1);
  });

  it.each(SQLI)('login treats %j as plain data', async (payload) => {
    const agent = request.agent(ctx.app);
    const token = (await agent.get('/api/auth/csrf').set('Origin', ORIGIN)).body.csrfToken as string;
    const res = await agent.post('/api/auth/login').set('Origin', ORIGIN).set('X-CSRF-Token', token).send({ email: EMAIL, password: payload });
    expect(res.status).toBe(401);
    const asEmail = await agent.post('/api/auth/login').set('Origin', ORIGIN).set('X-CSRF-Token', token).send({ email: payload, password: 'x' });
    expect(asEmail.status).toBe(400); // not a valid email, rejected before the database is touched
  });

  it('stores hostile text in game fields literally and keeps working', async () => {
    const s = await signIn(ctx.app);
    const game = await createGame(s, { title: "Robert'); DROP TABLE \"Game\";--", description: "' OR 1=1 --" });
    const row = await ctx.deps.db.game.findUniqueOrThrow({ where: { id: game.id } });
    expect(row.title).toBe("Robert'); DROP TABLE \"Game\";--");
    expect(await ctx.deps.db.game.count()).toBe(1);
  });

  it('rejects oversized and malformed input with a clean 400', async () => {
    const s = await signIn(ctx.app);
    const long = await call(s, 'post', '/api/admin/games').send({ title: 'x'.repeat(500), description: 'd', category: 'Arcade' });
    expect(long.status).toBe(400);
    const extra = await call(s, 'post', '/api/admin/games').send({ title: 'ok', description: 'd', category: 'Arcade', role: 'ADMIN', createdById: 'x' });
    expect(extra.status).toBe(400); // unknown fields are refused (no mass assignment)
    const notJson = await s.agent.post('/api/admin/games').set('Origin', ORIGIN).set('X-CSRF-Token', s.csrf).set('Content-Type', 'application/json').send('{not json');
    expect(notJson.status).toBe(400);
    expect(JSON.stringify(notJson.body)).not.toMatch(LEAKS);
  });
});

describe.skipIf(!hasDb)('stored and reflected XSS', () => {
  let ctx: Ctx;
  beforeAll(() => {
    ctx = makeCtx();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetDb(ctx.deps.db);
    await createAdmin(ctx.deps.db);
  });

  const PAYLOAD = '<img src=x onerror=alert(1)><script>alert(2)</script>';

  it('keeps markup as inert text and never serves it as HTML', async () => {
    const s = await signIn(ctx.app);
    const game = await createGame(s, { title: PAYLOAD, description: PAYLOAD, instructions: PAYLOAD });
    const version = await ctx.deps.db.gameVersion.create({
      data: { gameId: game.id, version: '1', storagePrefix: `games/${game.id}/22222222-2222-4222-8222-222222222222/`, fileCount: 1, totalBytes: 1 },
    });
    await call(s, 'post', `/api/admin/games/${game.id}/publish`).send({ versionId: version.id });

    const res = await request(ctx.app).get(`/api/games/${game.slug}`);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.body.game.title).toBe(PAYLOAD); // data is unchanged; the frontend renders it as text
  });

  it('does not reflect request input into HTML error pages', async () => {
    const res = await request(ctx.app).get('/api/games/%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const html = await request(ctx.app).get('/<script>alert(1)</script>');
    expect(html.headers['content-type']).toMatch(/application\/json/);
  });

  it('rejects control characters in text fields', async () => {
    const s = await signIn(ctx.app);
    const res = await call(s, 'post', '/api/admin/games').send({ title: 'bad\u0000title', description: 'd', category: 'Arcade' });
    expect(res.status).toBe(400);
  });
});
