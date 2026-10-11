import { describe, expect, it } from 'vitest';
import { buildCaddyHeaders, buildHeaders } from '../scripts/make-headers.mjs';

describe('buildHeaders', () => {
  const text = buildHeaders({ apiOrigin: 'https://api.example.com', gamesOrigin: 'https://games.example' });

  it('allows only the app, the API and the games origin', () => {
    expect(text).toContain("default-src 'self'");
    expect(text).toContain("script-src 'self'");
    expect(text).toContain('frame-src https://games.example');
    expect(text).toContain("connect-src 'self' https://api.example.com https://games.example");
    expect(text).toContain("frame-ancestors 'none'");
    expect(text).toContain("object-src 'none'");
    expect(text).not.toContain('unsafe-inline');
    expect(text).not.toContain('unsafe-eval');
  });

  it('adds the transport and content-type headers', () => {
    expect(text).toContain('Strict-Transport-Security');
    expect(text).toContain('X-Content-Type-Options: nosniff');
    expect(text).toContain('Referrer-Policy');
    expect(text).toContain('Permissions-Policy');
  });

  it('works when the API shares the site origin', () => {
    const same = buildHeaders({ apiOrigin: '', gamesOrigin: 'https://games.example' });
    expect(same).toContain("connect-src 'self' https://games.example");
  });

  it('rejects origins with a path or a missing scheme', () => {
    expect(() => buildHeaders({ apiOrigin: '', gamesOrigin: 'https://games.example/path' })).toThrow();
    expect(() => buildHeaders({ apiOrigin: '', gamesOrigin: 'games.example' })).toThrow();
  });
});

describe('loadEnvFiles', () => {
  it('lets real environment variables win over files', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { loadEnvFiles } = await import('../scripts/make-headers.mjs');
    const dir = mkdtempSync(join(tmpdir(), 'env-'));
    const file = join(dir, '.env.production');
    writeFileSync(file, '# comment\nVITE_GAMES_ORIGIN="https://from-file.example"\nVITE_API_URL=https://api-file.example\nSECRET=ignored\n');
    const merged = loadEnvFiles({ VITE_API_URL: 'https://api-env.example' }, [file]);
    expect(merged.VITE_GAMES_ORIGIN).toBe('https://from-file.example');
    expect(merged.VITE_API_URL).toBe('https://api-env.example');
    expect(merged.SECRET).toBeUndefined();
  });
});

describe('buildCaddyHeaders', () => {
  const snippet = buildCaddyHeaders({ apiOrigin: 'https://api.example.com', gamesOrigin: 'https://games.example' });

  it('wraps the same policy in a Caddy header block', () => {
    expect(snippet.startsWith('header {')).toBe(true);
    expect(snippet.trimEnd().endsWith('}')).toBe(true);
    expect(snippet).toContain('Content-Security-Policy "default-src \'self\'');
    expect(snippet).toContain('frame-src https://games.example');
    expect(snippet).toContain('Strict-Transport-Security "max-age=31536000"');
    expect(snippet).toContain('-Server');
  });

  it('never contains a double quote inside a value, which would break the Caddy syntax', () => {
    const values = snippet.split('\n').filter((l) => l.startsWith('\t') && !l.includes('-Server'));
    for (const line of values) expect(line.match(/"/g)?.length).toBe(2);
  });
});
