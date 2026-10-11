import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminRouter } from '../../src/routes/admin.js';
import { GAMES_ORIGIN, ORIGIN, call, createAdmin, createGame, hasDb, makeCtx, resetDb, signIn, type Ctx } from './helpers.js';

const ID = '11111111-1111-4111-8111-111111111111';
const PROTECTED: Array<[string, string]> = [
  ['get', '/api/admin/games'],
  ['post', '/api/admin/games'],
  ['get', `/api/admin/games/${ID}`],
  ['patch', `/api/admin/games/${ID}`],
  ['post', `/api/admin/games/${ID}/publish`],
  ['post', `/api/admin/games/${ID}/unpublish`],
  ['post', `/api/admin/games/${ID}/archive`],
  ['post', `/api/admin/games/${ID}/unarchive`],
  ['delete', `/api/admin/games/${ID}`],
  ['post', `/api/admin/games/${ID}/versions`],
  ['delete', `/api/admin/games/${ID}/versions/${ID}`],
  ['get', `/api/admin/games/${ID}/versions/${ID}/preview`],
  ['post', `/api/admin/games/${ID}/cover`],
  ['get', `/api/admin/games/${ID}/cover`],
  ['get', '/api/admin/stats'],
  ['get', '/api/admin/audit'],
  ['get', '/api/auth/me'],
  ['post', '/api/auth/logout'],
  ['post', '/api/auth/password'],
  ['post', '/api/auth/mfa/setup'],
  ['post', '/api/auth/mfa/enable'],
  ['post', '/api/auth/mfa/disable'],
];

describe.skipIf(!hasDb)('authorization (server-side, deny by default)', () => {
  let ctx: Ctx;
  beforeAll(() => {
    ctx = makeCtx();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetDb(ctx.deps.db);
    await createAdmin(ctx.deps.db);
  });

  it('covers every admin route in this table (add new routes here)', () => {
    const router = adminRouter(ctx.deps) as unknown as { stack: Array<{ route?: { methods: Record<string, boolean> } }> };
    const registered = router.stack.filter((layer) => layer.route).flatMap((layer) => Object.keys(layer.route?.methods ?? {}));
    const listed = PROTECTED.filter(([, url]) => url.startsWith('/api/admin'));
    expect(registered.length).toBe(listed.length);
  });

  it.each(PROTECTED)('%s %s answers 401 without a session, even with a CSRF header and a good Origin', async (method, url) => {
    const req = (request(ctx.app) as unknown as Record<string, (u: string) => request.Test>)[method]!(url);
    const res = await req.set('Origin', ORIGIN).set('X-CSRF-Token', 'anything').send({});
    expect(res.status).toBe(401);
  });

  it('answers 401 for any unknown path under /api/admin (nothing is public by accident)', async () => {
    expect((await request(ctx.app).get('/api/admin/does-not-exist')).status).toBe(401);
  });

  it('refuses state-changing admin requests that lack a CSRF token', async () => {
    const s = await signIn(ctx.app);
    const res = await s.agent.post('/api/admin/games').set('Origin', ORIGIN).send({ title: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('csrf_token');
  });

  it('refuses a valid token sent from another origin (cross-site request)', async () => {
    const s = await signIn(ctx.app);
    const res = await s.agent.post('/api/admin/games').set('Origin', 'https://evil.test').set('X-CSRF-Token', s.csrf).send({ title: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('csrf_origin');
  });

  it('requires the game URL name to delete a game', async () => {
    const s = await signIn(ctx.app);
    const game = await createGame(s);
    expect((await call(s, 'delete', `/api/admin/games/${game.id}`).send({})).status).toBe(400);
    expect((await call(s, 'delete', `/api/admin/games/${game.id}`).send({ confirmSlug: 'wrong' })).status).toBe(400);
    expect(await ctx.deps.db.game.count()).toBe(1);
    expect((await call(s, 'delete', `/api/admin/games/${game.id}`).send({ confirmSlug: game.slug })).status).toBe(204);
    expect(await ctx.deps.db.game.count()).toBe(0);
  });

  it('keeps drafts out of the public API and the public game host', async () => {
    const s = await signIn(ctx.app);
    const game = await createGame(s, { title: 'Secret Draft' });
    expect((await request(ctx.app).get('/api/games')).body.total).toBe(0);
    expect((await request(ctx.app).get(`/api/games/${game.slug}`)).status).toBe(404);
  });

  it('only exposes the safe fields publicly', async () => {
    const s = await signIn(ctx.app);
    const game = await createGame(s);
    const version = await ctx.deps.db.gameVersion.create({
      data: { gameId: game.id, version: '1.0.0', storagePrefix: `games/${game.id}/${ID}/`, fileCount: 1, totalBytes: 10 },
    });
    expect((await call(s, 'post', `/api/admin/games/${game.id}/publish`).send({ versionId: version.id })).status).toBe(200);
    const res = await request(ctx.app).get(`/api/games/${game.slug}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.game).sort()).toEqual(
      ['category', 'controls', 'coverUrl', 'description', 'featured', 'instructions', 'playUrl', 'publishedAt', 'slug', 'title', 'version'].sort(),
    );
    expect(res.body.game.playUrl).toBe(`${GAMES_ORIGIN}/g/${version.id}/index.html`);
  });

  it('refuses to publish a version that belongs to another game', async () => {
    const s = await signIn(ctx.app);
    const a = await createGame(s, { title: 'Game A' });
    const b = await createGame(s, { title: 'Game B' });
    const versionOfB = await ctx.deps.db.gameVersion.create({
      data: { gameId: b.id, version: '1.0.0', storagePrefix: `games/${b.id}/${ID}/`, fileCount: 1, totalBytes: 1 },
    });
    const res = await call(s, 'post', `/api/admin/games/${a.id}/publish`).send({ versionId: versionOfB.id });
    expect(res.status).toBe(404);
    expect((await ctx.deps.db.game.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('DRAFT');
  });
});
