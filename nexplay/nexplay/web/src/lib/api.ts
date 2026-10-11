import { API_BASE } from './env';
import type { Category, GameDetail, GameQuery, GameSummary, Page } from './types';

export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  issues: FieldIssue[];
  retryAfterSeconds?: number;
  requestId?: string;

  constructor(status: number, code: string, message: string, extra: { issues?: FieldIssue[]; retryAfterSeconds?: number; requestId?: string } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = extra.issues ?? [];
    this.retryAfterSeconds = extra.retryAfterSeconds;
    this.requestId = extra.requestId;
  }
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

// The CSRF token lives only in memory. It is never written to web storage.
let csrfToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function buildUrl(path: string, query?: Query): string {
  const base = API_BASE || (typeof location !== 'undefined' ? location.origin : 'http://localhost');
  const url = new URL(path, `${base}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function toError(res: Response): Promise<ApiError> {
  let body: { error?: string; message?: string; issues?: FieldIssue[]; retryAfterSeconds?: number; requestId?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  const header = Number(res.headers.get('Retry-After'));
  return new ApiError(res.status, body.error ?? 'error', body.message ?? 'Something went wrong. Please try again.', {
    issues: body.issues,
    retryAfterSeconds: body.retryAfterSeconds ?? (Number.isFinite(header) && header > 0 ? header : undefined),
    requestId: body.requestId,
  });
}

const NETWORK_MESSAGE = 'Could not reach the server. Check your connection and try again.';

export async function fetchCsrfToken(signal?: AbortSignal): Promise<string> {
  let res: Response;
  try {
    res = await fetch(buildUrl('/api/auth/csrf'), { credentials: 'include', headers: { Accept: 'application/json' }, signal });
  } catch (err) {
    if (isAbort(err)) throw err;
    throw new ApiError(0, 'network', NETWORK_MESSAGE);
  }
  if (!res.ok) throw await toError(res);
  const data = (await res.json()) as { csrfToken: string };
  csrfToken = data.csrfToken;
  return data.csrfToken;
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Send the admin session cookie and, for writes, the CSRF token. Public calls send no cookies at all. */
  auth?: boolean;
}

const CREDENTIAL_ERRORS = new Set(['invalid_credentials', 'mfa_required', 'invalid_mfa', 'wrong_password']);

export async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;

  const attempt = async (canRetry: boolean): Promise<T> => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.auth && method !== 'GET') headers['X-CSRF-Token'] = csrfToken ?? (await fetchCsrfToken(opts.signal));
    if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await fetch(buildUrl(path, opts.query), {
        method,
        headers,
        credentials: opts.auth ? 'include' : 'omit',
        body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
        signal: opts.signal,
      });
    } catch (err) {
      if (isAbort(err)) throw err;
      throw new ApiError(0, 'network', NETWORK_MESSAGE);
    }

    if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;

    const err = await toError(res);
    if (canRetry && opts.auth && err.code === 'csrf_token') {
      csrfToken = null; // the session changed under us; fetch a fresh token and try once more
      return attempt(false);
    }
    if (err.status === 401 && opts.auth && !CREDENTIAL_ERRORS.has(err.code)) onUnauthorized?.();
    throw err;
  };
  return attempt(true);
}

// ---- Public catalogue ----

export const api = {
  listGames: (query: GameQuery, signal?: AbortSignal) =>
    request<Page<GameSummary>>('/api/games', { query: { ...query, featured: query.featured === undefined ? undefined : String(query.featured) }, signal }),

  getGame: async (slug: string, signal?: AbortSignal) => (await request<{ game: GameDetail }>(`/api/games/${encodeURIComponent(slug)}`, { signal })).game,

  categories: async (signal?: AbortSignal) => (await request<{ items: Category[] }>('/api/categories', { signal })).items,

  /** Adds one to the game's anonymous daily launch count. Failures are ignored. */
  recordLaunch: (slug: string) => request<void>(`/api/games/${encodeURIComponent(slug)}/launch`, { method: 'POST' }).catch(() => undefined),
};
