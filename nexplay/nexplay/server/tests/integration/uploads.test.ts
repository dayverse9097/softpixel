import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UploadRejected } from '../../src/errors.js';
import { signPreviewToken } from '../../src/lib/preview-token.js';
import {
  GOOD_BUILD, ORIGIN, PNG, call, createAdmin, createGame, hasDb, makeCtx, makeZip, resetDb, signIn, upload, type Ctx, type Session,
} from './helpers.js';

describe.skipIf(!hasDb)('game uploads', () => {
  let ctx: Ctx;
  let s: Session;
  let gameId: string;

  beforeAll(() => {
    ctx = makeCtx({ MAX_FILES: '6', MAX_FILE_MB: '1', MAX_UNPACKED_MB: '50', MAX_ARCHIVE_MB: '60' });
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetDb(ctx.deps.db);
    await createAdmin(ctx.deps.db);
    s = await signIn(ctx.app);
    gameId = (await createGame(s)).id;
  });

  async function expectRejected(zip: Buffer | string, code: string) {
    const res = await upload(s, gameId, zip);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe(code);
    // A rejected upload leaves nothing behind: no files in storage, no database row.
    expect(await ctx.deps.storage.list('games/')).toEqual([]);
    expect(await ctx.deps.db.gameVersion.count()).toBe(0);
  }

  it('accepts a valid build, stores it privately, and does not publish it', async () => {
    const res = await upload(s, gameId, GOOD_BUILD());
    expect(res.status).toBe(201);
    expect(res.body.version.fileCount).toBe(3);
    const files = await ctx.deps.storage.list(`games/${gameId}/`);
    expect(files.map((f) => f.split('/').slice(3).join('/')).sort()).toEqual(['assets/a.png', 'game.js', 'index.html']);
    expect((await ctx.deps.db.game.findUniqueOrThrow({ where: { id: gameId } })).status).toBe('DRAFT');
    expect((await request(ctx.games).get(`/g/${res.body.version.id}/index.html`)).status).toBe(404);
  });

  it.each([
    ['path traversal', { '../evil.js': 'x', 'index.html': '<p>' }, 'unsafe_entry'],
    ['nested traversal', { 'a/../../evil.js': 'x', 'index.html': '<p>' }, 'unsafe_entry'],
    ['absolute path', { '/abs.js': 'x', 'index.html': '<p>' }, 'unsafe_entry'],
    ['backslash path', { 'a\\b.js': 'x', 'index.html': '<p>' }, 'unsafe_entry'],
    ['hidden file', { '.env': 'SECRET=1', 'index.html': '<p>' }, 'unsafe_entry'],
    ['server script', { 'run.php': '<?php', 'index.html': '<p>' }, 'unsafe_entry'],
    ['executable', { 'setup.exe': 'MZ', 'index.html': '<p>' }, 'unsafe_entry'],
    ['duplicate names differing by case', { 'index.html': '<p>', 'Game.js': 'a', 'game.js': 'b' }, 'duplicate_entry'],
    ['no index.html', { 'game.js': 'x' }, 'missing_entry_point'],
    ['index.html in a subfolder', { 'sub/index.html': '<p>' }, 'missing_entry_point'],
    ['accented file name', { 'index.html': '<p>', 'café.js': 'x' }, 'unsafe_entry'],
  ])('rejects %s', async (_label, entries, code) => {
    await expectRejected(makeZip(entries as Record<string, string>), code);
  });

  it('rejects a program disguised as an image', async () => {
    await expectRejected(makeZip({ 'index.html': '<p>', 'logo.png': new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]) }), 'bad_content');
  });

  it('rejects text files that contain binary data', async () => {
    await expectRejected(makeZip({ 'index.html': '<p>', 'game.js': new Uint8Array([0x4d, 0x5a, 0x00, 0x00]) }), 'bad_content');
  });

  it('rejects symbolic links', async () => {
    const link: [Uint8Array, { os: number; attrs: number }] = [new TextEncoder().encode('/etc/passwd'), { os: 3, attrs: (0o120777 << 16) >>> 0 }];
    await expectRejected(makeZip({ 'index.html': '<p>', 'link.txt': link }), 'unsafe_entry');
  });

  it('rejects too many files', async () => {
    const entries: Record<string, string> = { 'index.html': '<p>' };
    for (let i = 0; i < 8; i++) entries[`f${i}.js`] = 'x';
    await expectRejected(makeZip(entries), 'too_many_files');
  });

  it('rejects an oversized file', async () => {
    await expectRejected(makeZip({ 'index.html': '<p>', 'big.bin': new Uint8Array(randomBytes(2 * 1024 * 1024)) }), 'file_too_large');
  });

  it('rejects a decompression bomb by its compression ratio', async () => {
    const bomb = makeZip({ 'index.html': '<p>', 'zeros.bin': new Uint8Array(30 * 1024 * 1024) });
    const small = makeCtx({ MAX_FILE_MB: '100', MAX_UNPACKED_MB: '500', MAX_ARCHIVE_MB: '60' });
    try {
      const session = await signIn(small.app);
      const res = await upload(session, gameId, bomb);
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('suspicious_compression');
      expect(await small.deps.storage.list('games/')).toEqual([]);
    } finally {
      await small.close();
    }
  });

  it('rejects files that are not ZIP archives', async () => {
    await expectRejected('this is not a zip file', 'invalid_archive');
  });

  it('refuses uploads without a session or a CSRF token', async () => {
    const anon = await request(ctx.app).post(`/api/admin/games/${gameId}/versions`).set('Origin', ORIGIN).attach('build', GOOD_BUILD(), 'g.zip');
    expect(anon.status).toBe(401);
    const noCsrf = await s.agent.post(`/api/admin/games/${gameId}/versions`).set('Origin', ORIGIN).field('version', '1').attach('build', GOOD_BUILD(), 'g.zip');
    expect(noCsrf.status).toBe(403);
  });

  it('refuses a duplicate version label and a stray form field name', async () => {
    expect((await upload(s, gameId, GOOD_BUILD(), '1.0.0')).status).toBe(201);
    expect((await upload(s, gameId, GOOD_BUILD(), '1.0.0')).status).toBe(409);
    const wrongField = await call(s, 'post', `/api/admin/games/${gameId}/versions`).field('version', '2').attach('file', GOOD_BUILD(), 'g.zip');
    expect([400, 422]).toContain(wrongField.status);
  });

  it('reports a scanner finding as a rejection and keeps nothing', async () => {
    const infected = makeCtx({}, {
      scanner: { name: 'test', scanFile: async () => { throw new UploadRejected('malware_detected', 'flagged'); } },
    });
    try {
      const session = await signIn(infected.app);
      const res = await upload(session, gameId, GOOD_BUILD());
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('malware_detected');
      expect(await infected.deps.storage.list('games/')).toEqual([]);
      expect(await infected.deps.db.gameVersion.count()).toBe(0);
    } finally {
      await infected.close();
    }
  });

  it('cover images are checked by content, not by name', async () => {
    const good = await call(s, 'post', `/api/admin/games/${gameId}/cover`).attach('cover', PNG, { filename: 'cover.png', contentType: 'image/png' });
    expect(good.status).toBe(201);
    const disguised = await call(s, 'post', `/api/admin/games/${gameId}/cover`).attach('cover', Buffer.from('<svg onload=alert(1)>'), { filename: 'cover.png', contentType: 'image/png' });
    expect(disguised.status).toBe(422);
  });
});

describe.skipIf(!hasDb)('game host isolation', () => {
  let ctx: Ctx;
  let s: Session;
  let gameId: string;
  let versionId: string;

  beforeAll(() => {
    ctx = makeCtx();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetDb(ctx.deps.db);
    await createAdmin(ctx.deps.db);
    s = await signIn(ctx.app);
    gameId = (await createGame(s)).id;
    versionId = (await upload(s, gameId, GOOD_BUILD())).body.version.id;
  });

  const publish = () => call(s, 'post', `/api/admin/games/${gameId}/publish`).send({ versionId });

  it('serves a published game with isolation headers and no cookies', async () => {
    await publish();
    const res = await request(ctx.games).get(`/g/${versionId}/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain(`frame-ancestors ${ORIGIN}`);
    expect(res.headers['content-security-policy']).toContain("connect-src 'self' data: blob:");
    expect(res.headers['content-security-policy']).toMatch(/sandbox allow-scripts/);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect((await request(ctx.games).get(`/g/${versionId}/assets/a.png`)).headers['content-type']).toBe('image/png');
  });

  it('answers HEAD with the headers only, which is how the player checks a game', async () => {
    await publish();
    const res = await request(ctx.games).head(`/g/${versionId}/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.text ?? '').toBe('');
  });

  it('tells the admin when the folder was zipped instead of its contents', async () => {
    const res = await upload(s, gameId, makeZip({ 'mygame/index.html': '<p>' }), '9.9.9');
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('Zip the contents of the folder');
  });

  it('stops serving a game as soon as it is unpublished', async () => {
    await publish();
    expect((await request(ctx.games).get(`/g/${versionId}/index.html`)).status).toBe(200);
    await call(s, 'post', `/api/admin/games/${gameId}/unpublish`);
    expect((await request(ctx.games).get(`/g/${versionId}/index.html`)).status).toBe(404);
  });

  it('refuses traversal, hidden files, unknown types and bad ids', async () => {
    await publish();
    for (const p of ['..%2F..%2Fsecret.txt', '%2e%2e/x.js', '.env', 'run.php', 'a//index.html', 'index.html%00.png', 'missing.js']) {
      expect((await request(ctx.games).get(`/g/${versionId}/${p}`)).status).toBe(404);
    }
    expect((await request(ctx.games).get('/g/not-a-uuid/index.html')).status).toBe(404);
    expect((await request(ctx.games).get(`/g/${gameId}/index.html`)).status).toBe(404); // right shape, wrong id
  });

  it('shows drafts only through a valid, unexpired, matching preview token', async () => {
    const secret = ctx.deps.config.PREVIEW_SECRET;
    const previewUrl = (await call(s, 'get', `/api/admin/games/${gameId}/versions/${versionId}/preview`)).body.url as string;
    const path = new URL(previewUrl).pathname;
    const ok = await request(ctx.games).get(path);
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    // relative asset URLs inside the page resolve under the same token path
    expect((await request(ctx.games).get(path.replace('index.html', 'game.js'))).status).toBe(200);

    const expired = signPreviewToken(secret, versionId, Date.now() - 1000);
    expect((await request(ctx.games).get(`/pv/${expired}/${versionId}/index.html`)).status).toBe(404);
    const tampered = path.replace(/\/pv\/(\d+)\./, (_m, t) => `/pv/${Number(t) + 100000}.`);
    expect((await request(ctx.games).get(tampered)).status).toBe(404);
    const otherVersion = (await upload(s, gameId, GOOD_BUILD(), '2.0.0')).body.version.id as string;
    expect((await request(ctx.games).get(path.replace(versionId, otherVersion))).status).toBe(404);
  });

  it('cannot delete the live version, and cleans storage when deleting another', async () => {
    await publish();
    expect((await call(s, 'delete', `/api/admin/games/${gameId}/versions/${versionId}`)).status).toBe(409);
    const second = (await upload(s, gameId, GOOD_BUILD(), '2.0.0')).body.version.id as string;
    expect((await call(s, 'delete', `/api/admin/games/${gameId}/versions/${second}`)).status).toBe(204);
    expect((await ctx.deps.storage.list(`games/${gameId}/${second}/`)).length).toBe(0);
    expect((await ctx.deps.storage.list(`games/${gameId}/${versionId}/`)).length).toBe(3);
  });

  it('records uploads and publishing in the audit trail', async () => {
    await publish();
    const actions = (await ctx.deps.db.auditEvent.findMany()).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['game.create', 'game.upload', 'game.publish']));
  });
});
