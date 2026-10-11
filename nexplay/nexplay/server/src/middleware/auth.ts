import type { Request, RequestHandler } from 'express';
import type { Deps } from '../deps.js';
import { HttpError } from '../errors.js';

export function destroySession(req: Request): Promise<void> {
  return new Promise((resolve) => (req.session ? req.session.destroy(() => resolve()) : resolve()));
}

export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}

export function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
}

/**
 * Deny by default. The account is read from the database on every request, so a deleted account or a
 * changed role takes effect immediately and nothing is trusted from the browser or from the session alone.
 */
export function requireAdmin(d: Pick<Deps, 'db' | 'config'>): RequestHandler {
  const absoluteMs = d.config.SESSION_ABSOLUTE_HOURS * 3_600_000;
  return async (req, _res, next) => {
    const session = req.session;
    if (!session?.userId) return next(new HttpError(401, 'unauthenticated', 'Sign in to continue.'));
    if (!session.createdAt || Date.now() - session.createdAt > absoluteMs) {
      await destroySession(req);
      return next(new HttpError(401, 'session_expired', 'Your session expired. Sign in again.'));
    }
    const user = await d.db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, role: true, totpEnabled: true },
    });
    if (!user) {
      await destroySession(req);
      return next(new HttpError(401, 'unauthenticated', 'Sign in to continue.'));
    }
    if (user.role !== 'ADMIN') return next(new HttpError(403, 'forbidden', 'You do not have access to this resource.'));
    req.admin = { ...user, role: 'ADMIN' };
    next();
  };
}

export function adminOf(req: Request): NonNullable<Request['admin']> {
  if (!req.admin) throw new HttpError(401, 'unauthenticated', 'Sign in to continue.');
  return req.admin;
}
