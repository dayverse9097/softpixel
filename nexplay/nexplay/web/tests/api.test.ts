import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, api, request, setCsrfToken, setUnauthorizedHandler } from '../src/lib/api';

type Call = { url: URL; init: RequestInit };
const realFetch = globalThis.fetch;

function mockFetch(handler: (url: URL, init: RequestInit, n: number) => Response | Promise<Response>): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: new URL(String(input)), init: init ?? {} };
    calls.push(call);
    return handler(call.url, call.init, calls.length);
  }) as typeof fetch;
  return calls;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const header = (call: Call | undefined, name: string) => (call?.init.headers as Record<string, string> | undefined)?.[name];

beforeEach(() => {
  setCsrfToken(null);
  setUnauthorizedHandler(null);
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('public requests', () => {
  it('send no cookies and no CSRF token', async () => {
    const calls = mockFetch(() => json(200, { items: [], page: 1, pageSize: 12, total: 0 }));
    await api.listGames({ q: 'pong' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init.credentials).toBe('omit');
    expect(header(calls[0], 'X-CSRF-Token')).toBeUndefined();
  });

  it('build the query string without empty values', async () => {
    const calls = mockFetch(() => json(200, { items: [], page: 1, pageSize: 12, total: 0 }));
    await api.listGames({ q: '', category: 'Arcade', sort: 'title', page: 2, featured: true });
    const params = calls[0]?.url.searchParams;
    expect(params?.get('category')).toBe('Arcade');
    expect(params?.get('featured')).toBe('true');
    expect(params?.has('q')).toBe(false);
  });

  it('encode slugs in the path', async () => {
    const calls = mockFetch(() => json(404, { error: 'not_found', message: 'Game not found.' }));
    await expect(api.getGame('a/b?c')).rejects.toThrow();
    expect(calls[0]?.url.pathname).toBe('/api/games/a%2Fb%3Fc');
  });
});

describe('admin requests', () => {
  it('fetch a CSRF token once, then attach it to every write', async () => {
    const calls = mockFetch((url) => (url.pathname === '/api/auth/csrf' ? json(200, { csrfToken: 'tok-1' }) : json(200, { ok: true })));
    await request('/api/admin/games', { method: 'POST', auth: true, body: { title: 'x' } });
    await request('/api/admin/games', { method: 'POST', auth: true, body: { title: 'y' } });
    expect(calls.filter((c) => c.url.pathname === '/api/auth/csrf')).toHaveLength(1);
    const writes = calls.filter((c) => c.url.pathname === '/api/admin/games');
    expect(writes.every((c) => header(c, 'X-CSRF-Token') === 'tok-1')).toBe(true);
    expect(writes[0]?.init.credentials).toBe('include');
  });

  it('do not send a token on reads', async () => {
    const calls = mockFetch(() => json(200, { ok: true }));
    await request('/api/admin/stats', { auth: true });
    expect(calls).toHaveLength(1);
    expect(header(calls[0], 'X-CSRF-Token')).toBeUndefined();
  });

  it('refresh the token and retry once when the server rejects it', async () => {
    let tokens = 0;
    const calls = mockFetch((url, init) => {
      if (url.pathname === '/api/auth/csrf') return json(200, { csrfToken: `tok-${++tokens}` });
      return (init.headers as Record<string, string>)['X-CSRF-Token'] === 'tok-2' ? json(200, { done: true }) : json(403, { error: 'csrf_token', message: 'Missing or invalid CSRF token.' });
    });
    await expect(request('/api/admin/games', { method: 'POST', auth: true, body: {} })).resolves.toEqual({ done: true });
    expect(calls.filter((c) => c.url.pathname === '/api/admin/games')).toHaveLength(2);
  });

  it('give up after one retry', async () => {
    mockFetch((url) => (url.pathname === '/api/auth/csrf' ? json(200, { csrfToken: 'tok' }) : json(403, { error: 'csrf_token', message: 'nope' })));
    await expect(request('/api/admin/games', { method: 'POST', auth: true, body: {} })).rejects.toMatchObject({ code: 'csrf_token', status: 403 });
  });

  it('tell the app when the session is gone, but not for a wrong password', async () => {
    let lost = 0;
    setUnauthorizedHandler(() => lost++);
    mockFetch((url) => (url.pathname === '/api/auth/csrf' ? json(200, { csrfToken: 't' }) : url.pathname === '/api/auth/login' ? json(401, { error: 'invalid_credentials', message: 'Invalid email or password.' }) : json(401, { error: 'unauthenticated', message: 'Sign in to continue.' })));
    await expect(request('/api/admin/games', { auth: true })).rejects.toThrow();
    expect(lost).toBe(1);
    await expect(request('/api/auth/login', { method: 'POST', auth: true, body: {} })).rejects.toThrow();
    expect(lost).toBe(1);
  });
});

describe('errors', () => {
  it('turn server errors into ApiError with field issues and a reference', async () => {
    mockFetch(() => json(400, { error: 'validation_failed', message: 'Some fields are invalid.', issues: [{ path: 'title', message: 'Required' }], requestId: 'req-1' }));
    const err = await api.listGames({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'validation_failed', requestId: 'req-1', issues: [{ path: 'title', message: 'Required' }] });
  });

  it('read the retry time from a 429', async () => {
    mockFetch(() => json(429, { error: 'rate_limited', message: 'Slow down.' }, { 'Retry-After': '42' }));
    await expect(api.listGames({})).rejects.toMatchObject({ status: 429, retryAfterSeconds: 42 });
  });

  it('survive a response that is not JSON', async () => {
    mockFetch(() => new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(api.listGames({})).rejects.toMatchObject({ status: 502, code: 'error' });
  });

  it('report a network failure in plain words', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(api.listGames({})).rejects.toMatchObject({ code: 'network', status: 0 });
  });

  it('let cancellation through untouched', async () => {
    mockFetch(() => {
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(api.listGames({})).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('return nothing for 204 responses', async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(api.recordLaunch('neon-pong')).resolves.toBeUndefined();
  });

  it('never let a failed launch count break the page', async () => {
    mockFetch(() => json(500, { error: 'internal', message: 'x' }));
    await expect(api.recordLaunch('neon-pong')).resolves.toBeUndefined();
  });
});
