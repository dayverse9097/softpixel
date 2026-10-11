import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

const dev = {
  DATABASE_URL: 'postgresql://nexplay_app:pw@localhost:5432/nexplay',
  DATABASE_URL_PUBLIC: 'postgresql://nexplay_public:pw@localhost:5432/nexplay',
  APP_ORIGIN: 'http://localhost:5173',
  GAMES_ORIGIN: 'http://localhost:4001',
  SESSION_SECRET: 'a'.repeat(48),
  PREVIEW_SECRET: 'b'.repeat(48),
  ENCRYPTION_KEY: 'cd'.repeat(32),
};

const prod = {
  ...dev,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://nexplay_app:pw@db.internal:5432/nexplay',
  DATABASE_URL_PUBLIC: 'postgresql://nexplay_public:pw@db.internal:5432/nexplay',
  MIGRATOR_DATABASE_URL: 'postgresql://nexplay_migrator:pw@db.internal:5432/nexplay',
  APP_ORIGIN: 'https://play.nexplay.example',
  GAMES_ORIGIN: 'https://nexplay-games.example',
  STORAGE_DRIVER: 's3',
  S3_BUCKET: 'games',
  S3_REGION: 'eu-west-1',
  S3_ACCESS_KEY_ID: 'AKIAEXAMPLE0000',
  S3_SECRET_ACCESS_KEY: 'x'.repeat(40),
  RATE_LIMIT_STORE: 'postgres',
};

function failure(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
  } catch (err) {
    return (err as Error).message;
  }
  return '';
}

describe('loadConfig', () => {
  it('loads a valid development config with defaults', () => {
    const config = loadConfig(dev);
    expect(config.PORT).toBe(4000);
    expect(config.MAX_ARCHIVE_MB).toBe(200);
    expect(config.STORAGE_DRIVER).toBe('local');
  });

  it('treats empty values from a .env file as unset', () => {
    expect(loadConfig({ ...dev, S3_BUCKET: '', CLAMAV_HOST: '', S3_ENDPOINT: '' }).CLAMAV_HOST).toBe(undefined);
  });

  it('names missing settings but never prints a value', () => {
    const message = failure({ ...dev, SESSION_SECRET: 'tooshort-LEAKCHECK', ENCRYPTION_KEY: undefined });
    expect(message).toContain('SESSION_SECRET');
    expect(message).toContain('ENCRYPTION_KEY');
    expect(message).not.toContain('LEAKCHECK');
  });

  it('requires the games origin to differ from the app origin', () => {
    expect(failure({ ...dev, GAMES_ORIGIN: dev.APP_ORIGIN })).toContain('GAMES_ORIGIN');
  });

  it('rejects origins that include a path', () => {
    expect(failure({ ...dev, APP_ORIGIN: 'http://localhost:5173/app' })).toContain('APP_ORIGIN');
  });

  it('requires S3 settings when the S3 driver is chosen', () => {
    expect(failure({ ...dev, STORAGE_DRIVER: 's3' })).toContain('S3_BUCKET');
  });

  it('rejects a single file limit larger than the unpacked limit', () => {
    expect(failure({ ...dev, MAX_FILE_MB: '600', MAX_UNPACKED_MB: '500' })).toContain('MAX_FILE_MB');
  });
});

describe('loadConfig in production', () => {
  it('accepts a correct production config', () => {
    expect(loadConfig(prod).NODE_ENV).toBe('production');
  });
  it('requires https for both origins', () => {
    expect(failure({ ...prod, APP_ORIGIN: 'http://play.nexplay.example' })).toContain('APP_ORIGIN');
    expect(failure({ ...prod, GAMES_ORIGIN: 'http://nexplay-games.example' })).toContain('GAMES_ORIGIN');
  });
  it('requires the games host to have a different hostname', () => {
    expect(failure({ ...prod, GAMES_ORIGIN: 'https://play.nexplay.example:8443' })).toContain('GAMES_ORIGIN');
  });
  it('rejects placeholder secrets', () => {
    expect(failure({ ...prod, SESSION_SECRET: 'REPLACE_ME'.repeat(5) })).toContain('SESSION_SECRET');
  });
  it('requires private object storage and a shared rate-limit store', () => {
    expect(failure({ ...prod, STORAGE_DRIVER: 'local' })).toContain('STORAGE_DRIVER');
    expect(failure({ ...prod, RATE_LIMIT_STORE: 'memory' })).toContain('RATE_LIMIT_STORE');
  });
  it('requires separate database roles', () => {
    expect(failure({ ...prod, DATABASE_URL_PUBLIC: prod.DATABASE_URL })).toContain('DATABASE_URL_PUBLIC');
    expect(failure({ ...prod, MIGRATOR_DATABASE_URL: prod.DATABASE_URL })).toContain('DATABASE_URL');
  });
});
