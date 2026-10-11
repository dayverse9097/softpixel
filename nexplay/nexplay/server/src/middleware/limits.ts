import type { RequestHandler } from 'express';
import { HttpError } from '../errors.js';

/** Allow only N of these requests at once. Used for uploads, which are expensive. */
export function concurrencyLimit(max: number): RequestHandler {
  let active = 0;
  return (_req, res, next) => {
    if (active >= max) return next(new HttpError(503, 'busy', 'The server is busy. Try again in a moment.'));
    active++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        active--;
      }
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };
}

export function requestTimeout(ms: number): RequestHandler {
  return (_req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) res.status(503).json({ error: 'timeout', message: 'The request took too long.' });
    }, ms);
    res.on('close', () => clearTimeout(timer));
    next();
  };
}
