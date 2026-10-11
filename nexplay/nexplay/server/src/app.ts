import { randomBytes, randomUUID } from 'node:crypto';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import express, { type Express } from 'express';
import session from 'express-session';
import { pinoHttp } from 'pino-http';
import type { Deps } from './deps.js';
import { safeUrl } from './logger.js';
import { limit } from './limiters.js';
import { requireAdmin } from './middleware/auth.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { apiSecurityHeaders, noStore, requestId } from './middleware/security.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';

/** The JSON API: public catalogue, admin login, and the admin dashboard's endpoints. */
export function createApp(d: Deps): Express {
  const { config } = d;
  const production = config.NODE_ENV === 'production';
  const app = express();

  app.disable('x-powered-by');
  // Only trust X-Forwarded-For when a known number of proxies sit in front, or clients could fake their IP.
  app.set('trust proxy', config.TRUST_PROXY);

  // __Host- cookies must be Secure, have Path=/ and no Domain, so another subdomain cannot overwrite them.
  const cookieName = production ? '__Host-nexplay.sid' : 'nexplay.sid';
  app.set('session cookie name', cookieName);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger: d.logger,
      genReqId: (req) => (req as { id?: string }).id ?? randomUUID(),
      serializers: {
        // No query strings, no IP addresses, no cookies.
        req: (req) => ({ id: req.id, method: req.method, url: safeUrl(req.url ?? '') }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(...apiSecurityHeaders(config));

  // Exact-match allowlist. Unknown origins get no CORS headers, and credentials are never combined with "*".
  app.use(
    cors({
      origin: (origin, callback) => callback(null, origin === config.APP_ORIGIN),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  // Readiness: is the database reachable? (Liveness above does not touch it.)
  app.get('/readyz', async (_req, res) => {
    try {
      await d.pool.query('select 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });
  app.use('/api', limit(d.limiters.global));

  // Public routes: no session, no cookies.
  app.use('/api', publicRouter(d));

  const PgStore = connectPgSimple(session);
  const sessions = session({
    name: cookieName,
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // no cookie until something is stored
    rolling: true, // each request restarts the idle timeout
    genid: () => randomBytes(32).toString('base64url'),
    store: new PgStore({ pool: d.pool, tableName: 'session', createTableIfMissing: false }),
    cookie: {
      httpOnly: true, // not readable by scripts
      secure: production, // HTTPS only in production
      sameSite: 'strict', // not sent on cross-site requests
      maxAge: config.SESSION_IDLE_MINUTES * 60_000,
      path: '/',
    },
  });

  app.use('/api/auth', noStore, sessions, authRouter(d));
  // Deny by default: everything under /api/admin needs a valid admin session first, then CSRF checks.
  app.use('/api/admin', noStore, sessions, requireAdmin(d), csrfProtection([config.APP_ORIGIN]), adminRouter(d));

  app.use(notFound);
  app.use(errorHandler(d.logger));
  return app;
}
