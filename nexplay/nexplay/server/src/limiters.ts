import type { Request, RequestHandler } from 'express';
import type { Pool } from 'pg';
import { RateLimiterMemory, RateLimiterPostgres, RateLimiterRes, type RateLimiterAbstract } from 'rate-limiter-flexible';
import type { Config } from './config.js';

export interface Limiters {
  global: RateLimiterAbstract;
  login: RateLimiterAbstract;
  loginAccount: RateLimiterAbstract;
  admin: RateLimiterAbstract;
  upload: RateLimiterAbstract;
  launch: RateLimiterAbstract;
  assets: RateLimiterAbstract;
}

/**
 * Production uses Postgres so counters are shared by every instance (table "rate_limit" is created by the migration).
 * Development and tests use memory. Tests pass scale to relax every limit, or loginAccountPoints to set the per-account limit exactly.
 */
export function createLimiters(config: Config, pool?: Pool, opts: { loginAccountPoints?: number; scale?: number } = {}): Limiters {
  const scale = opts.scale ?? 1;
  const make = (name: string, points: number, durationSeconds: number): RateLimiterAbstract =>
    config.RATE_LIMIT_STORE === 'postgres' && pool
      ? new RateLimiterPostgres({ storeClient: pool, tableName: 'rate_limit', tableCreated: true, keyPrefix: name, points: points * scale, duration: durationSeconds })
      : new RateLimiterMemory({ keyPrefix: name, points: points * scale, duration: durationSeconds });

  return {
    global: make('global', 300, 60),
    login: make('login_ip', 20, 900),
    loginAccount: make('login_acct', opts.loginAccountPoints ?? 8, 900),
    admin: make('admin', 240, 60),
    upload: make('upload', 10, 3600),
    launch: make('launch', 30, 60),
    assets: make('assets', 900, 60),
  };
}

/** Express middleware: consume one point per request. When exhausted, the error handler answers 429 with Retry-After. */
export function limit(limiter: RateLimiterAbstract, key: (req: Request) => string = (req) => req.ip ?? 'unknown'): RequestHandler {
  return async (req, _res, next) => {
    try {
      await limiter.consume(key(req));
      next();
    } catch (rejection) {
      next(rejection);
    }
  };
}

export { RateLimiterRes };
