import type { RequestHandler } from 'express';
import { HttpError } from '../errors.js';
import { safeEqual } from '../lib/crypto.js';
import { isAllowedOrigin } from '../lib/origin.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests, in two independent layers:
 *  1. the Origin (or Referer) header must name an allowed frontend origin;
 *  2. the X-CSRF-Token header must match the random token stored in the server-side session.
 * State-changing routes never use GET, so the safe methods are skipped.
 */
export function csrfProtection(allowedOrigins: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (!isAllowedOrigin(req.get('origin'), req.get('referer'), allowedOrigins)) {
      return next(new HttpError(403, 'csrf_origin', 'This request did not come from an allowed origin.'));
    }
    const sent = req.get('x-csrf-token');
    const expected = req.session?.csrf;
    if (!sent || !expected || !safeEqual(sent, expected)) {
      return next(new HttpError(403, 'csrf_token', 'Missing or invalid CSRF token.'));
    }
    next();
  };
}
