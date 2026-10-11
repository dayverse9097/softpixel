import type { PrismaClient } from '@prisma/client';
import type { Pool } from 'pg';
import type { Logger } from 'pino';
import type { Config } from './config.js';
import type { Limiters } from './limiters.js';
import type { Scanner } from './scanner.js';
import type { Storage } from './storage.js';

/** Everything the apps need, passed in so tests can substitute their own. */
export interface Deps {
  config: Config;
  /** Runtime role: read and write for admin routes. */
  db: PrismaClient;
  /** Read-only role for public routes. Postgres row-level security limits it to published games. */
  dbPublic: PrismaClient;
  pool: Pool;
  storage: Storage;
  scanner: Scanner;
  limiters: Limiters;
  logger: Logger;
}
