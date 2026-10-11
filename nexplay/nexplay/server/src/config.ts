import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const int = (fallback: number, min: number, max: number) => z.coerce.number().int().min(min).max(max).default(fallback);
// An empty value in a .env file means "not set".
const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    SERVICE: z.enum(['all', 'api', 'games']).default('all'),
    PORT: int(4000, 1, 65535),
    GAMES_PORT: int(4001, 1, 65535),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    TRUST_PROXY: int(0, 0, 10),

    DATABASE_URL: z.string().url(),
    DATABASE_URL_PUBLIC: z.string().url(),
    MIGRATOR_DATABASE_URL: optional(z.string().url()),

    APP_ORIGIN: z.string().url(),
    GAMES_ORIGIN: z.string().url(),

    SESSION_SECRET: z.string().min(32),
    PREVIEW_SECRET: z.string().min(32),
    ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/),
    SESSION_IDLE_MINUTES: int(30, 5, 1440),
    SESSION_ABSOLUTE_HOURS: int(12, 1, 72),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./.storage'),
    S3_BUCKET: optional(z.string()),
    S3_REGION: optional(z.string()),
    S3_ENDPOINT: optional(z.string().url()),
    S3_ACCESS_KEY_ID: optional(z.string()),
    S3_SECRET_ACCESS_KEY: optional(z.string()),

    UPLOAD_TMP_DIR: z.string().default(path.join(os.tmpdir(), 'nexplay-uploads')),
    MAX_ARCHIVE_MB: int(200, 1, 2000),
    MAX_UNPACKED_MB: int(500, 1, 2000),
    MAX_FILE_MB: int(100, 1, 1000),
    MAX_FILES: int(2000, 1, 20000),
    MAX_COMPRESSION_RATIO: int(100, 2, 1000),
    EXTRACT_TIMEOUT_SECONDS: int(120, 5, 900),
    MAX_COVER_MB: int(2, 1, 10),
    MAX_VERSIONS_PER_GAME: int(20, 1, 200),
    MAX_GAME_MB: int(1024, 10, 2000),

    CLAMAV_HOST: optional(z.string()),
    CLAMAV_PORT: int(3310, 1, 65535),

    RATE_LIMIT_STORE: z.enum(['memory', 'postgres']).default('memory'),
    AUDIT_RETENTION_DAYS: int(180, 1, 3650),
  })
  .superRefine((env, ctx) => {
    const fail = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    const app = safeUrl(env.APP_ORIGIN);
    const games = safeUrl(env.GAMES_ORIGIN);
    if (app && games) {
      if (app.origin !== env.APP_ORIGIN.replace(/\/$/, '')) fail('APP_ORIGIN', 'must be an origin only (scheme, host, port), no path');
      if (games.origin !== env.GAMES_ORIGIN.replace(/\/$/, '')) fail('GAMES_ORIGIN', 'must be an origin only (scheme, host, port), no path');
      if (app.origin === games.origin) fail('GAMES_ORIGIN', 'must differ from APP_ORIGIN so uploaded games never share the app origin');
    }
    if (env.NODE_ENV !== 'production') return;

    if (app && app.protocol !== 'https:') fail('APP_ORIGIN', 'must use https in production');
    if (games && games.protocol !== 'https:') fail('GAMES_ORIGIN', 'must use https in production');
    if (app && games && app.hostname === games.hostname) fail('GAMES_ORIGIN', 'must use a different hostname from the app in production');
    for (const key of ['SESSION_SECRET', 'PREVIEW_SECRET', 'ENCRYPTION_KEY'] as const) {
      if (/replace|change.?me|example/i.test(env[key])) fail(key, 'looks like a placeholder');
    }
    if (env.STORAGE_DRIVER !== 's3') fail('STORAGE_DRIVER', 'must be "s3" in production');
    if (env.RATE_LIMIT_STORE !== 'postgres') fail('RATE_LIMIT_STORE', 'must be "postgres" in production so limits are shared');
    if (env.DATABASE_URL === env.DATABASE_URL_PUBLIC || dbUser(env.DATABASE_URL) === dbUser(env.DATABASE_URL_PUBLIC)) {
      fail('DATABASE_URL_PUBLIC', 'must use a different database role from DATABASE_URL');
    }
    if (env.MIGRATOR_DATABASE_URL && dbUser(env.MIGRATOR_DATABASE_URL) === dbUser(env.DATABASE_URL)) {
      fail('DATABASE_URL', 'the runtime role must not be the migration role');
    }
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required when STORAGE_DRIVER=s3' });
      }
    }
    if (env.MAX_FILE_MB > env.MAX_UNPACKED_MB) {
      ctx.addIssue({ code: 'custom', path: ['MAX_FILE_MB'], message: 'cannot exceed MAX_UNPACKED_MB' });
    }
  });

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function dbUser(url: string): string {
  return safeUrl(url)?.username ?? '';
}

export type Config = z.infer<typeof schema>;

/** Validate the environment once at startup. Error text names the setting but never prints its value. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.code === 'custom' ? i.message : i.code}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
