import { pipeline } from 'node:stream/promises';
import express, { type Express, type Response } from 'express';
import { pinoHttp } from 'pino-http';
import type { Deps } from './deps.js';
import { checkEntryName, extensionOf } from './lib/archive-paths.js';
import { GAME_PATH_RULES, contentTypeFor } from './lib/file-types.js';
import { verifyPreviewToken } from './lib/preview-token.js';
import { safeUrl } from './logger.js';
import { limit } from './limiters.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COVER_FILE = /^[0-9a-f-]{36}\.(png|jpg|webp)$/i;

/**
 * Serves uploaded games. This must run on its own origin (a different host from the app), so game code
 * can never touch the admin session or the app's storage. It has no cookies, no login and no API.
 *
 * Published games are served from /g/<versionId>/... using the read-only database role, which can only see
 * the live version of a published game. Admin previews use /pv/<token>/<versionId>/..., where the token is
 * a short-lived signed value. Because the token is part of the path, the game's relative asset URLs carry it.
 */
export function createGameHostApp(d: Deps): Express {
  const { config } = d;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger: d.logger,
      serializers: { req: (req) => ({ method: req.method, url: safeUrl(req.url ?? '') }), res: (res) => ({ statusCode: res.statusCode }) },
    }),
  );
  app.use(limit(d.limiters.assets));

  const csp = [
    "default-src 'self' data: blob:",
    // Game engines often need inline scripts, eval or WebAssembly compilation. That is acceptable only because this origin holds nothing private.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' data: blob:", // games cannot call other websites
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${config.APP_ORIGIN}`, // only the NEXPLAY app may embed games
    'sandbox allow-scripts allow-pointer-lock', // even if opened directly, the page gets no origin privileges
  ].join('; ');

  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Sandboxed frames have an opaque origin, so their asset requests are cross-origin. Nothing here is private.
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });

  const missing = (res: Response) => res.status(404).type('text/plain').send('Not found');

  async function send(req: express.Request, res: Response, key: string, ext: string, cacheControl: string): Promise<void> {
    const object = await d.storage.get(key);
    if (!object) return void missing(res);
    res.status(200);
    res.setHeader('Content-Type', contentTypeFor(ext));
    res.setHeader('Cache-Control', cacheControl);
    if (object.size !== undefined) res.setHeader('Content-Length', String(object.size));
    if (req.method === 'HEAD') {
      // The player checks a game with HEAD before showing it. Answer with headers only, without downloading the file.
      object.stream.destroy();
      res.end();
      return;
    }
    try {
      await pipeline(object.stream, res);
    } catch (err) {
      // A visitor closing the tab mid-download is normal, not an error.
      if ((err as NodeJS.ErrnoException).code !== 'ERR_STREAM_PREMATURE_CLOSE') throw err;
    }
  }

  const serveVersion = (preview: boolean) =>
    async (req: express.Request, res: Response): Promise<void> => {
      const versionId = String(req.params.versionId);
      if (!UUID.test(versionId)) return void missing(res);
      const checked = checkEntryName([req.params.path ?? []].flat().join('/'), GAME_PATH_RULES);
      if (!checked.ok) return void missing(res);

      let prefix: string | undefined;
      if (preview) {
        if (!verifyPreviewToken(config.PREVIEW_SECRET, versionId, String(req.params.token))) return void missing(res);
        prefix = (await d.db.gameVersion.findUnique({ where: { id: versionId }, select: { storagePrefix: true } }))?.storagePrefix;
      } else {
        prefix = (await d.dbPublic.gameVersion.findUnique({ where: { id: versionId }, select: { storagePrefix: true } }))?.storagePrefix;
      }
      if (!prefix) return void missing(res);
      // A version's files never change, so published assets can be cached for a long time.
      await send(req, res, prefix + checked.path, extensionOf(checked.path), preview ? 'no-store' : 'public, max-age=31536000, immutable');
    };

  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/g/:versionId/*path', serveVersion(false));
  app.get('/pv/:token/:versionId/*path', serveVersion(true));

  // Cover art for published games only.
  app.get('/covers/:gameId/:file', async (req, res) => {
    const { gameId, file } = req.params;
    if (!UUID.test(String(gameId)) || !COVER_FILE.test(String(file))) return void missing(res);
    const coverKey = `${gameId}/${file}`;
    const game = await d.dbPublic.game.findFirst({ where: { coverKey, status: 'PUBLISHED' }, select: { id: true } });
    if (!game) return void missing(res);
    await send(req, res, `covers/${coverKey}`, extensionOf(String(file)), 'public, max-age=31536000, immutable');
  });

  app.use((_req, res) => missing(res));
  app.use((err: unknown, _req: express.Request, res: Response, next: express.NextFunction) => {
    d.logger.error({ err }, 'game host error');
    if (res.headersSent) return next(err);
    res.status(500).type('text/plain').send('Something went wrong.');
  });
  return app;
}
