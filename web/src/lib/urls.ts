import { GAMES_ORIGIN } from './env';

/**
 * Anything that comes back from the API and ends up in an iframe or an image is checked against the one
 * origin that is allowed to host games. If the API were ever tricked into returning another URL,
 * the front-end would still refuse to load it.
 */
function parse(value: string | null | undefined, origin: string, prefixes: string[]): URL | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
  if (!secure || url.origin !== origin || url.username || url.password) return null;
  if (!prefixes.some((p) => url.pathname.startsWith(p))) return null;
  return url;
}

export function isPlayUrl(value: string | null | undefined, origin: string = GAMES_ORIGIN): value is string {
  return parse(value, origin, ['/g/', '/pv/']) !== null;
}

export function isCoverUrl(value: string | null | undefined, origin: string = GAMES_ORIGIN): value is string {
  return parse(value, origin, ['/covers/']) !== null;
}
