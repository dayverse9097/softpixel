import { createHmac } from 'node:crypto';
import { safeEqual } from './crypto.js';

/**
 * A preview link lets an admin view an unpublished build on the games origin.
 * Token format: <expiresAtMs>.<hmac>. The HMAC covers the version id and the expiry,
 * so a token cannot be reused for another version or stretched to last longer.
 * The token sits in the URL path (not the query) so the game's own relative asset requests carry it.
 */
function mac(secret: string, versionId: string, expiresAt: number): string {
  return createHmac('sha256', secret).update(`preview:${versionId}:${expiresAt}`).digest('base64url');
}

export function signPreviewToken(secret: string, versionId: string, expiresAt: number): string {
  return `${expiresAt}.${mac(secret, versionId, expiresAt)}`;
}

export function verifyPreviewToken(secret: string, versionId: string, token: string, now = Date.now()): boolean {
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const expiresAt = Number(token.slice(0, dot));
  if (!Number.isSafeInteger(expiresAt) || expiresAt < now) return false;
  return safeEqual(token.slice(dot + 1), mac(secret, versionId, expiresAt));
}
