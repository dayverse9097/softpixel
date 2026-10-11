import { mkdirSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import pg from 'pg';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createDb } from '../../src/db.js';
import type { Deps } from '../../src/deps.js';
import { createGameHostApp } from '../../src/gamehost.js';
import { createLimiters } from '../../src/limiters.js';
import { createLogger } from '../../src/logger.js';
import { hashPassword } from '../../src/password.js';
import { NoopScanner, type Scanner } from '../../src/scanner.js';
import { LocalStorage } from '../../src/storage.js';

/** Integration tests need a throwaway Postgres database with the schema applied. Never point this at production. */
export const hasDb = Boolean(process.env.TEST_DATABASE_URL);
export const ORIGIN = 'http://localhost:5173';
export const GAMES_ORIGIN = 'http://localhost:4001';
export const EMAIL = 'admin@example.com';
export const PASSWORD = 'correct horse battery staple';

export interface Ctx {
  deps: Deps;
  app: Express;
  games: Express;
  root: string;
  close(): Promise<void>;
}

export function makeCtx(
  env: Record<string, string> = {},
  opts: { scale?: number; loginAccountPoints?: number; scanner?: Scanner } = {},
): Ctx {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nexplay-test-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    DATABASE_URL_PUBLIC: process.env.TEST_DATABASE_URL_PUBLIC ?? process.env.TEST_DATABASE_URL,
    APP_ORIGIN: ORIGIN,
    GAMES_ORIGIN,
    SESSION_SECRET: 's'.repeat(48),
    PREVIEW_SECRET: 'p'.repeat(48),
    ENCRYPTION_KEY: 'ab'.repeat(32),
    STORAGE_LOCAL_DIR: path.join(root, 'storage'),
    UPLOAD_TMP_DIR: path.join(root, 'tmp'),
    LOG_LEVEL: 'silent',
    ...env,
  });
  mkdirSync(config.UPLOAD_TMP_DIR, { recursive: true });
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 5 });
  const deps: Deps = {
    config,
    db: createDb(config.DATABASE_URL),
    dbPublic: createDb(config.DATABASE_URL_PUBLIC),
    pool,
    storage: new LocalStorage(config.STORAGE_LOCAL_DIR),
    scanner: opts.scanner ?? new NoopScanner(),
    limiters: createLimiters(config, undefined, { scale: opts.scale ?? 100, loginAccountPoints: opts.loginAccountPoints }),
    logger: createLogger('silent'),
  };
  return {
    deps,
    app: createApp(deps),
    games: createGameHostApp(deps),
    root,
    close: async () => {
      await Promise.all([deps.db.$disconnect(), deps.dbPublic.$disconnect(), pool.end()]);
    },
  };
}

export async function resetDb(db: PrismaClient): Promise<void> {
  await db.$executeRaw`TRUNCATE "AuditEvent","GameLaunchDaily","GameVersion","Game","RecoveryCode","User","session" CASCADE`;
}

export async function createAdmin(db: PrismaClient, email = EMAIL, password = PASSWORD) {
  return db.user.create({ data: { email, passwordHash: await hashPassword(password), role: 'ADMIN' } });
}

export interface Session {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  /** The session cookie as the browser holds it, for replay tests. */
  cookie: string;
}

export async function signIn(app: Express, email = EMAIL, password = PASSWORD): Promise<Session> {
  const agent = request.agent(app);
  const token = await agent.get('/api/auth/csrf').set('Origin', ORIGIN);
  const res = await agent.post('/api/auth/login').set('Origin', ORIGIN).set('X-CSRF-Token', token.body.csrfToken).send({ email, password });
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, csrf: res.body.csrfToken as string, cookie: cookieOf(res).split(';')[0] ?? '' };
}

/** Build a request with the headers a real browser session would send. */
export function call(s: Session, method: 'get' | 'post' | 'patch' | 'delete', url: string) {
  const req = s.agent[method](url).set('Origin', ORIGIN);
  return method === 'get' ? req : req.set('X-CSRF-Token', s.csrf);
}

export function cookieOf(res: { headers: Record<string, unknown> }): string {
  const header = res.headers['set-cookie'] as string[] | undefined;
  return (header ?? []).find((c) => c.startsWith('nexplay.sid=')) ?? '';
}

export const gameBody = (over: Record<string, unknown> = {}) => ({
  title: 'Neon Pong',
  description: 'A paddle duel.',
  category: 'Arcade',
  instructions: 'Return the ball.',
  controls: [{ input: 'Mouse', action: 'Move the paddle' }],
  ...over,
});

export async function createGame(s: Session, over: Record<string, unknown> = {}): Promise<{ id: string; slug: string }> {
  const res = await call(s, 'post', '/api/admin/games').send(gameBody(over));
  if (res.status !== 201) throw new Error(`create game failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.game;
}

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type ZipEntry = Uint8Array | string | [Uint8Array, { os?: number; attrs?: number }];

/** Build a ZIP in memory. Entry names are not sanitized, so tests can create hostile archives. */
export function makeZip(entries: Record<string, ZipEntry>): Buffer {
  const input: Record<string, Uint8Array | [Uint8Array, { os?: number; attrs?: number }]> = {};
  for (const [name, value] of Object.entries(entries)) input[name] = typeof value === 'string' ? strToU8(value) : value;
  return Buffer.from(zipSync(input));
}

export const GOOD_BUILD = () =>
  makeZip({ 'index.html': '<!doctype html><script src="game.js"></script>', 'game.js': 'console.log("hi")', 'assets/a.png': new Uint8Array(PNG) });

export function upload(s: Session, gameId: string, zip: Buffer | string, version = '1.0.0') {
  return call(s, 'post', `/api/admin/games/${gameId}/versions`)
    .field('version', version)
    .attach('build', Buffer.isBuffer(zip) ? zip : Buffer.from(zip), { filename: 'game.zip', contentType: 'application/zip' });
}
