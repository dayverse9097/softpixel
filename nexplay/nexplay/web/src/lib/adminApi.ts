import { ApiError, buildUrl, fetchCsrfToken, request, setCsrfToken } from './api';
import type { AdminGame, AdminGameDetail, AdminUser, AuditEvent, GameInput, GameStatus, Page, StatsItem, VersionSummary } from './types';

const auth = { auth: true } as const;

export interface LoginInput {
  email: string;
  password: string;
  totp?: string;
  recoveryCode?: string;
}

/** Calls that return a fresh CSRF token (after login or a security change) store it for later requests. */
async function withToken<T extends { csrfToken?: string }>(promise: Promise<T>): Promise<T> {
  const result = await promise;
  if (result.csrfToken) setCsrfToken(result.csrfToken);
  return result;
}

export const adminApi = {
  // ---- Session and security ----
  me: (signal?: AbortSignal) => withToken(request<{ user: AdminUser; csrfToken: string }>('/api/auth/me', { ...auth, signal })),
  login: (input: LoginInput) => withToken(request<{ user: AdminUser; csrfToken: string }>('/api/auth/login', { ...auth, method: 'POST', body: input })),
  logout: async () => {
    await request<void>('/api/auth/logout', { ...auth, method: 'POST' });
    setCsrfToken(null);
  },
  changePassword: (input: { currentPassword: string; newPassword: string; totp?: string }) =>
    withToken(request<{ csrfToken: string }>('/api/auth/password', { ...auth, method: 'POST', body: input })),
  mfaSetup: (password: string) => request<{ secret: string; otpauthUrl: string }>('/api/auth/mfa/setup', { ...auth, method: 'POST', body: { password } }),
  mfaEnable: (code: string) => withToken(request<{ recoveryCodes: string[]; csrfToken: string }>('/api/auth/mfa/enable', { ...auth, method: 'POST', body: { code } })),
  mfaDisable: (input: { password: string; code?: string; recoveryCode?: string }) =>
    withToken(request<{ csrfToken: string }>('/api/auth/mfa/disable', { ...auth, method: 'POST', body: input })),

  // ---- Games ----
  listGames: (query: { q?: string; status?: GameStatus; page?: number; pageSize?: number }, signal?: AbortSignal) =>
    request<Page<AdminGame>>('/api/admin/games', { ...auth, query, signal }),
  getGame: async (id: string, signal?: AbortSignal) => (await request<{ game: AdminGameDetail }>(`/api/admin/games/${id}`, { ...auth, signal })).game,
  createGame: async (input: GameInput) => (await request<{ game: AdminGame }>('/api/admin/games', { ...auth, method: 'POST', body: input })).game,
  updateGame: async (id: string, input: Partial<GameInput>) => (await request<{ game: AdminGame }>(`/api/admin/games/${id}`, { ...auth, method: 'PATCH', body: input })).game,
  deleteGame: (id: string, confirmSlug: string) => request<void>(`/api/admin/games/${id}`, { ...auth, method: 'DELETE', body: { confirmSlug } }),
  publish: async (id: string, versionId: string) => (await request<{ game: AdminGame }>(`/api/admin/games/${id}/publish`, { ...auth, method: 'POST', body: { versionId } })).game,
  setState: async (id: string, action: 'unpublish' | 'archive' | 'unarchive') =>
    (await request<{ game: AdminGame }>(`/api/admin/games/${id}/${action}`, { ...auth, method: 'POST' })).game,
  previewUrl: (id: string, versionId: string) => request<{ url: string; expiresAt: number }>(`/api/admin/games/${id}/versions/${versionId}/preview`, auth),
  deleteVersion: (id: string, versionId: string) => request<void>(`/api/admin/games/${id}/versions/${versionId}`, { ...auth, method: 'DELETE' }),
  uploadCover: (id: string, file: File) => {
    const form = new FormData();
    form.append('cover', file);
    return request<{ hasCover: boolean }>(`/api/admin/games/${id}/cover`, { ...auth, method: 'POST', body: form });
  },
  coverUrl: (id: string, bust: string | number) => buildUrl(`/api/admin/games/${id}/cover`, { v: bust }),

  // ---- Reports ----
  stats: (signal?: AbortSignal) => request<{ days: number; items: StatsItem[] }>('/api/admin/stats', { ...auth, signal }),
  audit: (page: number, signal?: AbortSignal) => request<Page<AuditEvent>>('/api/admin/audit', { ...auth, query: { page, pageSize: 25 }, signal }),
};

/** Upload a game ZIP with progress. XMLHttpRequest is used because fetch cannot report upload progress. */
export async function uploadVersion(
  gameId: string,
  file: File,
  version: string,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<VersionSummary> {
  const token = await fetchCsrfToken(signal);
  return new Promise<VersionSummary>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', buildUrl(`/api/admin/games/${gameId}/versions`));
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-CSRF-Token', token);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: { version?: VersionSummary; error?: string; message?: string; issues?: { path: string; message: string }[] } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.version) return resolve(body.version);
      if (body.error === 'csrf_token') setCsrfToken(null);
      reject(new ApiError(xhr.status, body.error ?? 'error', body.message ?? 'The upload failed. Please try again.', { issues: body.issues }));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network', 'Could not reach the server. Check your connection and try again.'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });

    const form = new FormData();
    form.append('version', version);
    form.append('build', file);
    xhr.send(form);
  });
}
