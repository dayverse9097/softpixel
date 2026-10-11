import { randomUUID } from 'node:crypto';
import { open, rm } from 'node:fs/promises';
import { Router, type Request, type RequestHandler } from 'express';
import multer from 'multer';
import type { Prisma } from '@prisma/client';
import { pipeline } from 'node:stream/promises';
import { audit } from '../audit.js';
import type { Deps } from '../deps.js';
import { HttpError } from '../errors.js';
import { sniffImage } from '../lib/file-types.js';
import { signPreviewToken } from '../lib/preview-token.js';
import { isValidSlug, slugify } from '../lib/slug.js';
import { limit } from '../limiters.js';
import { adminOf } from '../middleware/auth.js';
import { concurrencyLimit, requestTimeout } from '../middleware/limits.js';
import { adminListQuery, deleteGameBody, gameInput, gameUpdate, pageQuery, publishBody, uuid, versionLabel } from '../schemas.js';
import { toAdminGame } from '../serialize.js';
import { ingestBuild } from '../upload.js';

const MB = 1024 * 1024;
const GAME_INCLUDE = { currentVersion: { select: { id: true, version: true } }, _count: { select: { versions: true } } } as const;

/**
 * Every route here sits behind requireAdmin and CSRF protection, applied when the router is mounted
 * (see app.ts), so a new route is protected by default. Authorization is decided here on the server;
 * nothing the browser sends can grant access.
 */
export function adminRouter(d: Deps): Router {
  const r = Router();
  const { db, storage, config, logger } = d;
  const adminKey = (req: Request) => req.admin?.id ?? req.ip ?? 'anon';
  const log = (req: Request, event: Omit<Parameters<typeof audit>[2], 'actorId'>) => audit(db, logger, { ...event, actorId: adminOf(req).id });

  r.use(limit(d.limiters.admin, adminKey));

  // ---- Games ----

  r.get('/games', async (req, res) => {
    const q = adminListQuery.parse(req.query);
    const where: Prisma.GameWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.category) where.category = { equals: q.category, mode: 'insensitive' };
    if (q.q) where.OR = [{ title: { contains: q.q, mode: 'insensitive' } }, { slug: { contains: q.q.toLowerCase() } }];
    const [total, rows] = await Promise.all([
      db.game.count({ where }),
      db.game.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: GAME_INCLUDE }),
    ]);
    res.json({ items: rows.map(toAdminGame), page: q.page, pageSize: q.pageSize, total });
  });

  r.post('/games', async (req, res) => {
    const input = gameInput.parse(req.body);
    const slug = input.slug ?? slugify(input.title);
    if (!isValidSlug(slug)) throw new HttpError(400, 'invalid_slug', 'A URL name could not be made from the title. Provide a slug.');
    const game = await db.game.create({ data: { ...input, slug, createdById: adminOf(req).id }, include: GAME_INCLUDE });
    await log(req, { action: 'game.create', targetType: 'game', targetId: game.id, meta: { slug } });
    res.status(201).json({ game: toAdminGame(game) });
  });

  r.get('/games/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const game = await db.game.findUnique({
      where: { id },
      include: { ...GAME_INCLUDE, versions: { orderBy: { createdAt: 'desc' }, select: { id: true, version: true, fileCount: true, totalBytes: true, scanned: true, createdAt: true } } },
    });
    if (!game) throw new HttpError(404, 'not_found', 'Game not found.');
    res.json({ game: { ...toAdminGame(game), versions: game.versions } });
  });

  r.patch('/games/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = gameUpdate.parse(req.body);
    const game = await db.game.update({ where: { id }, data: input, include: GAME_INCLUDE });
    await log(req, { action: 'game.update', targetType: 'game', targetId: id, meta: { fields: Object.keys(input) } });
    res.json({ game: toAdminGame(game) });
  });

  r.post('/games/:id/publish', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { versionId } = publishBody.parse(req.body);
    const game = await db.$transaction(async (tx) => {
      const current = await tx.game.findUnique({ where: { id } });
      if (!current) throw new HttpError(404, 'not_found', 'Game not found.');
      if (current.status === 'ARCHIVED') throw new HttpError(409, 'archived', 'Restore this game from the archive first.');
      const version = await tx.gameVersion.findFirst({ where: { id: versionId, gameId: id } });
      if (!version) throw new HttpError(404, 'version_not_found', 'That version does not belong to this game.');
      return tx.game.update({
        where: { id },
        data: { status: 'PUBLISHED', currentVersionId: version.id, publishedAt: current.publishedAt ?? new Date() },
        include: GAME_INCLUDE,
      });
    });
    await log(req, { action: 'game.publish', targetType: 'game', targetId: id, meta: { versionId } });
    res.json({ game: toAdminGame(game) });
  });

  const setStatus = (status: 'DRAFT' | 'ARCHIVED', action: string, from: Array<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>): RequestHandler =>
    async (req, res) => {
      const id = uuid.parse(req.params.id);
      const current = await db.game.findUnique({ where: { id }, select: { status: true } });
      if (!current) throw new HttpError(404, 'not_found', 'Game not found.');
      if (!from.includes(current.status)) throw new HttpError(409, 'invalid_state', `This game is ${current.status.toLowerCase()}.`);
      const game = await db.game.update({ where: { id }, data: { status }, include: GAME_INCLUDE });
      await log(req, { action, targetType: 'game', targetId: id });
      res.json({ game: toAdminGame(game) });
    };
  r.post('/games/:id/unpublish', setStatus('DRAFT', 'game.unpublish', ['PUBLISHED']));
  r.post('/games/:id/archive', setStatus('ARCHIVED', 'game.archive', ['DRAFT', 'PUBLISHED']));
  r.post('/games/:id/unarchive', setStatus('DRAFT', 'game.unarchive', ['ARCHIVED']));

  // Deleting needs the game's slug in the body, so a stray or forged request cannot delete by accident.
  r.delete('/games/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { confirmSlug } = deleteGameBody.parse(req.body);
    const game = await db.game.findUnique({ where: { id }, select: { slug: true } });
    if (!game) throw new HttpError(404, 'not_found', 'Game not found.');
    if (confirmSlug !== game.slug) throw new HttpError(400, 'confirmation_required', 'Type the game URL name to confirm deletion.');
    await db.game.delete({ where: { id } });
    await Promise.all([storage.deletePrefix(`games/${id}/`), storage.deletePrefix(`covers/${id}/`)]).catch((err) =>
      logger.error({ err, gameId: id }, 'storage cleanup after delete failed'),
    );
    await log(req, { action: 'game.delete', targetType: 'game', targetId: id, meta: { slug: game.slug } });
    res.status(204).end();
  });

  // ---- Builds ----

  const uploadDir = config.UPLOAD_TMP_DIR;
  const zipUpload = multer({
    storage: multer.diskStorage({ destination: (_req, _file, cb) => cb(null, uploadDir), filename: (_req, _file, cb) => cb(null, `${randomUUID()}.upload`) }),
    limits: { fileSize: config.MAX_ARCHIVE_MB * MB, files: 1, fields: 4, parts: 6, fieldSize: 1024 },
    fileFilter: (_req, file, cb) => (file.fieldname === 'build' ? cb(null, true) : cb(new HttpError(400, 'unexpected_field', 'Send the ZIP in a field named "build".'))),
  });

  // Checked before any bytes are accepted, so an upload to a missing or full game is refused early.
  const precheckUpload: RequestHandler = async (req, _res, next) => {
    const id = uuid.parse(req.params.id);
    const game = await db.game.findUnique({ where: { id }, select: { id: true, _count: { select: { versions: true } } } });
    if (!game) return next(new HttpError(404, 'not_found', 'Game not found.'));
    if (game._count.versions >= config.MAX_VERSIONS_PER_GAME) {
      return next(new HttpError(409, 'quota_exceeded', 'This game has reached its version limit. Delete an old version first.'));
    }
    next();
  };

  r.post(
    '/games/:id/versions',
    limit(d.limiters.upload, adminKey),
    concurrencyLimit(2),
    requestTimeout(5 * 60_000),
    precheckUpload,
    zipUpload.single('build'),
    async (req, res) => {
      const file = req.file;
      const gameId = uuid.parse(req.params.id);
      try {
        if (!file) throw new HttpError(400, 'no_file', 'Attach the game as a ZIP in the "build" field.');
        const label = versionLabel.parse((req.body as Record<string, unknown> | undefined)?.version);
        const version = await ingestBuild(d, { gameId, label, zipPath: file.path });
        await log(req, { action: 'game.upload', targetType: 'game', targetId: gameId, meta: { versionId: version.id, files: version.fileCount, bytes: version.totalBytes } });
        res.status(201).json({ version: { id: version.id, version: version.version, fileCount: version.fileCount, totalBytes: version.totalBytes, scanned: version.scanned, createdAt: version.createdAt } });
      } catch (err) {
        await log(req, { action: 'game.upload_rejected', targetType: 'game', targetId: gameId, meta: { code: (err as { code?: string }).code ?? 'error' } });
        throw err;
      } finally {
        if (file) await rm(file.path, { force: true });
      }
    },
  );

  r.delete('/games/:id/versions/:versionId', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const versionId = uuid.parse(req.params.versionId);
    const version = await db.gameVersion.findFirst({ where: { id: versionId, gameId: id }, include: { current: { select: { id: true } } } });
    if (!version) throw new HttpError(404, 'not_found', 'Version not found.');
    if (version.current) throw new HttpError(409, 'version_in_use', 'This is the live version. Publish another version or unpublish the game first.');
    await db.gameVersion.delete({ where: { id: versionId } });
    await storage.deletePrefix(version.storagePrefix).catch((err) => logger.error({ err }, 'storage cleanup after version delete failed'));
    await log(req, { action: 'game.version_delete', targetType: 'game', targetId: id, meta: { versionId } });
    res.status(204).end();
  });

  r.get('/games/:id/versions/:versionId/preview', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const versionId = uuid.parse(req.params.versionId);
    const version = await db.gameVersion.findFirst({ where: { id: versionId, gameId: id }, select: { id: true } });
    if (!version) throw new HttpError(404, 'not_found', 'Version not found.');
    const expiresAt = Date.now() + 10 * 60_000;
    const token = signPreviewToken(config.PREVIEW_SECRET, version.id, expiresAt);
    res.json({ url: `${config.GAMES_ORIGIN}/pv/${token}/${version.id}/index.html`, expiresAt });
  });

  // ---- Cover images ----

  const coverUpload = multer({
    storage: multer.diskStorage({ destination: (_req, _file, cb) => cb(null, uploadDir), filename: (_req, _file, cb) => cb(null, `${randomUUID()}.cover`) }),
    limits: { fileSize: config.MAX_COVER_MB * MB, files: 1, fields: 0, parts: 2 },
  });

  r.post('/games/:id/cover', limit(d.limiters.upload, adminKey), coverUpload.single('cover'), async (req, res) => {
    const file = req.file;
    try {
      const id = uuid.parse(req.params.id);
      if (!file) throw new HttpError(400, 'no_file', 'Attach an image in the "cover" field.');
      const game = await db.game.findUnique({ where: { id }, select: { coverKey: true } });
      if (!game) throw new HttpError(404, 'not_found', 'Game not found.');

      // The type comes from the file's own bytes, never from its name or the browser's Content-Type.
      const handle = await open(file.path, 'r');
      const head = Buffer.alloc(16);
      try {
        await handle.read(head, 0, 16, 0);
      } finally {
        await handle.close();
      }
      const kind = sniffImage(head);
      if (!kind) throw new HttpError(422, 'bad_image', 'Use a PNG, JPEG or WebP image.');

      const name = `${id}/${randomUUID()}.${kind}`;
      await storage.putFile(`covers/${name}`, file.path, kind === 'jpg' ? 'image/jpeg' : `image/${kind}`);
      await db.game.update({ where: { id }, data: { coverKey: name } });
      if (game.coverKey) await storage.deleteKey(`covers/${game.coverKey}`).catch(() => {});
      await log(req, { action: 'game.cover', targetType: 'game', targetId: id });
      res.status(201).json({ hasCover: true });
    } finally {
      if (file) await rm(file.path, { force: true });
    }
  });

  // Draft covers are streamed through the API so they stay behind the admin login.
  r.get('/games/:id/cover', async (req, res) => {
    const game = await db.game.findUnique({ where: { id: uuid.parse(req.params.id) }, select: { coverKey: true } });
    const object = game?.coverKey ? await storage.get(`covers/${game.coverKey}`) : null;
    if (!game?.coverKey || !object) throw new HttpError(404, 'not_found', 'No cover image.');
    const ext = game.coverKey.split('.').pop();
    res.setHeader('Content-Type', ext === 'jpg' ? 'image/jpeg' : `image/${ext}`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    try {
      await pipeline(object.stream, res);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ERR_STREAM_PREMATURE_CLOSE') throw err;
    }
  });

  // ---- Statistics and audit trail ----

  r.get('/stats', async (_req, res) => {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const groups = await db.gameLaunchDaily.groupBy({ by: ['gameId'], where: { day: { gte: since } }, _sum: { count: true } });
    const games = await db.game.findMany({ where: { id: { in: groups.map((g) => g.gameId) } }, select: { id: true, title: true, slug: true } });
    const titles = new Map<string, { slug: string; title: string }>();
    for (const g of games) titles.set(g.id, g);
    res.json({
      days: 30,
      items: groups.map((g) => ({ slug: titles.get(g.gameId)?.slug ?? null, title: titles.get(g.gameId)?.title ?? null, launches: g._sum.count ?? 0 })).sort((a, b) => b.launches - a.launches),
    });
  });

  r.get('/audit', async (req, res) => {
    const q = pageQuery.parse(req.query);
    const [total, rows] = await Promise.all([
      db.auditEvent.count(),
      db.auditEvent.findMany({ orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true, action: true, targetType: true, targetId: true, meta: true, createdAt: true, actor: { select: { email: true } } } }),
    ]);
    res.json({ items: rows.map((e) => ({ ...e, actor: e.actor?.email ?? null })), page: q.page, pageSize: q.pageSize, total });
  });

  return r;
}
