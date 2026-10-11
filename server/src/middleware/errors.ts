import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import type { Logger } from 'pino';
import { RateLimiterRes } from 'rate-limiter-flexible';
import { ZodError } from 'zod';
import { HttpError } from '../errors.js';

export const notFound: RequestHandler = (_req, _res, next) => next(new HttpError(404, 'not_found', 'Not found.'));

/**
 * One place that turns every failure into a safe response. Stack traces, SQL and file paths go to the
 * log (with credentials redacted) and never to the client.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    const send = (status: number, error: string, message: string, extra: Record<string, unknown> = {}) =>
      res.status(status).json({ error, message, ...extra, requestId: req.id });

    if (err instanceof RateLimiterRes) {
      const seconds = Math.max(1, Math.ceil(err.msBeforeNext / 1000));
      res.set('Retry-After', String(seconds));
      return send(429, 'rate_limited', `Too many requests. Try again in ${seconds} seconds.`, { retryAfterSeconds: seconds });
    }
    if (err instanceof HttpError) return send(err.status, err.code, err.message);
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return send(400, 'validation_failed', 'Some fields are invalid.', { issues });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') return send(409, 'conflict', 'That value is already in use.');
      if (err.code === 'P2025') return send(404, 'not_found', 'Not found.');
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return send(413, 'file_too_large', 'The file is too large.');
      return send(400, 'bad_upload', 'The upload could not be read.');
    }
    const type = (err as { type?: string }).type;
    if (type === 'entity.too.large') return send(413, 'body_too_large', 'The request body is too large.');
    if (type === 'entity.parse.failed' || type === 'encoding.unsupported') return send(400, 'invalid_body', 'The request body could not be read.');

    logger.error({ err, requestId: req.id, method: req.method }, 'unhandled error');
    return send(500, 'internal', 'Something went wrong on our side.');
  };
}
