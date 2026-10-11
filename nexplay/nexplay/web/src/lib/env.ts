type Env = Record<string, string | boolean | undefined>;

// Vite fills import.meta.env when it builds the app. Outside a build (for example in a unit test) it does not exist.
const raw: Env = (import.meta as unknown as { env?: Env }).env ?? {};

/** Origin of the API, or empty when the dev server proxies /api. */
export const API_BASE: string = String(raw.VITE_API_URL ?? '').replace(/\/$/, '');

/** The only origin the player will load games and cover art from. */
export const GAMES_ORIGIN: string = String(raw.VITE_GAMES_ORIGIN ?? 'http://localhost:4001').replace(/\/$/, '');

function secureOrLocal(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
  } catch {
    return false;
  }
}

/** Problems with the build settings. A production build must say so plainly instead of failing in confusing ways. */
export function envProblems(env: Env = raw): string[] {
  const problems: string[] = [];
  if (!env.PROD) return problems;
  const games = typeof env.VITE_GAMES_ORIGIN === 'string' ? env.VITE_GAMES_ORIGIN : '';
  if (!games) problems.push('VITE_GAMES_ORIGIN is not set.');
  else if (!secureOrLocal(games)) problems.push('VITE_GAMES_ORIGIN must use https (plain http is only allowed for localhost).');
  return problems;
}
