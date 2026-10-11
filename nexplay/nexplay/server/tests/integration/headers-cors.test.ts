import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ORIGIN, hasDb, makeCtx, type Ctx } from './helpers.js';

describe.skipIf(!hasDb)('security headers and CORS', () => {
  let ctx: Ctx;
  beforeAll(() => {
    ctx = makeCtx();
  });
  afterAll(() => ctx.close());

  it('sets restrictive headers on API responses', async () => {
    const res = await request(ctx.app).get('/api/games');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['permissions-policy']).toContain('camera=()');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('never caches login-dependent responses', async () => {
    expect((await request(ctx.app).get('/api/auth/csrf')).headers['cache-control']).toBe('no-store');
    expect((await request(ctx.app).get('/api/admin/games')).headers['cache-control']).toBe('no-store');
  });

  it('allows credentialed requests only from the configured frontend origin', async () => {
    const allowed = await request(ctx.app).get('/api/games').set('Origin', ORIGIN);
    expect(allowed.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    for (const origin of ['https://evil.test', 'null', `${ORIGIN}.evil.test`, 'http://localhost:5174']) {
      const res = await request(ctx.app).get('/api/games').set('Origin', origin);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('answers preflight with an explicit method and header allowlist, never a wildcard', async () => {
    const res = await request(ctx.app).options('/api/admin/games').set('Origin', ORIGIN).set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type,x-csrf-token');
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(res.headers['access-control-allow-methods']).not.toMatch(/PUT|\*/);
    expect(res.headers['access-control-allow-headers']).not.toBe('*');
  });

  it('returns a generic JSON error for unknown routes', async () => {
    const res = await request(ctx.app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(Object.keys(res.body).sort()).toEqual(['error', 'message', 'requestId']);
  });
});
