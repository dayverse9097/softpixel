import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import helmet from 'helmet';
import type { Config } from '../config.js';

export const requestId: RequestHandler = (req, res, next) => {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};

/** Headers for the JSON API. The frontend's own headers are set by its host (see docs/DEPLOYMENT.md). */
export function apiSecurityHeaders(config: Config): RequestHandler[] {
  const production = config.NODE_ENV === 'production';
  return [
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      // Only meaningful over HTTPS, so it is off in local development.
      hsts: production ? { maxAge: 15_552_000, includeSubDomains: false } : false,
    }),
    (_req, res, next) => {
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
      next();
    },
  ];
}

/** Responses that depend on a login must never be cached by browsers or proxies. */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
