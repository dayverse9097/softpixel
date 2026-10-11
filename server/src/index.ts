import http from 'node:http';
import { mkdir } from 'node:fs/promises';
import pg from 'pg';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { createGameHostApp } from './gamehost.js';
import { createLimiters } from './limiters.js';
import { createLogger } from './logger.js';
import { createScanner } from './scanner.js';
import { createStorage } from './storage.js';
import { purgeStaleUploads } from './upload.js';
import type { Deps } from './deps.js';

// Refuses to start (naming the setting, never its value) if anything required is missing or unsafe.
const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);

await mkdir(config.UPLOAD_TMP_DIR, { recursive: true, mode: 0o700 });
await purgeStaleUploads(config.UPLOAD_TMP_DIR);

const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10, statement_timeout: 15_000 });
const deps: Deps = {
  config,
  db: createDb(config.DATABASE_URL),
  dbPublic: createDb(config.DATABASE_URL_PUBLIC),
  pool,
  storage: createStorage(config),
  scanner: createScanner(config),
  limiters: createLimiters(config, pool),
  logger,
};
if (deps.scanner.name === 'none') logger.warn('malware scanning is not configured (CLAMAV_HOST is empty)');

function harden(server: http.Server): http.Server {
  server.headersTimeout = 20_000;
  server.requestTimeout = 5 * 60_000; // long enough for a large upload, short enough to stop slow-loris clients
  server.keepAliveTimeout = 5_000;
  server.maxConnections = 2000;
  return server;
}

const servers: http.Server[] = [];
if (config.SERVICE === 'all' || config.SERVICE === 'api') {
  servers.push(harden(createApp(deps).listen(config.PORT, () => logger.info({ port: config.PORT }, 'API listening'))));
}
if (config.SERVICE === 'all' || config.SERVICE === 'games') {
  servers.push(harden(createGameHostApp(deps).listen(config.GAMES_PORT, () => logger.info({ port: config.GAMES_PORT }, 'game host listening'))));
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  await Promise.all([deps.db.$disconnect(), deps.dbPublic.$disconnect(), pool.end()]);
  process.exit(0);
}
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled promise rejection');
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  process.exit(1);
});
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
