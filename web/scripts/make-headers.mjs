// Writes dist/_headers and dist/_redirects after "vite build".
// These files are understood by Netlify and Cloudflare Pages. On another host, copy the values into its settings.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/** Read VITE_ settings from .env.production and .env (real environment variables win), the way Vite does. */
export function loadEnvFiles(env = process.env, files = ['.env.production', '.env']) {
  const merged = { ...env };
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && merged[match[1]] === undefined) merged[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return merged;
}

function policy({ apiOrigin, gamesOrigin }) {
  const origin = (value, name) => {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`${name} must be a full origin such as https://example.com`);
    }
    if (url.origin !== value.replace(/\/$/, '')) throw new Error(`${name} must be an origin only, with no path`);
    return url.origin;
  };
  const games = origin(gamesOrigin, 'VITE_GAMES_ORIGIN');
  const api = apiOrigin ? origin(apiOrigin, 'VITE_API_URL') : '';
  const apiSrc = api ? ` ${api}` : '';
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src 'self' data: ${games}${apiSrc}`,
    "font-src 'self'",
    `connect-src 'self'${apiSrc} ${games}`,
    `frame-src ${games}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
  return {
    'Content-Security-Policy': csp,
    'Strict-Transport-Security': 'max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)',
  };
}

/** Netlify and Cloudflare Pages format. */
export function buildHeaders(options) {
  const lines = ['/*', ...Object.entries(policy(options)).map(([name, value]) => `  ${name}: ${value}`), '', '/assets/*', '  Cache-Control: public, max-age=31536000, immutable', ''];
  return lines.join('\n');
}

/** A snippet for the Caddy web server: import it inside the site block that serves the front-end. */
export function buildCaddyHeaders(options) {
  const lines = ['header {', ...Object.entries(policy(options)).map(([name, value]) => `\t${name} "${value}"`), '\t-Server', '}', ''];
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = loadEnvFiles();
  const gamesOrigin = env.VITE_GAMES_ORIGIN;
  if (!gamesOrigin) {
    console.error('Set VITE_GAMES_ORIGIN (and VITE_API_URL if the API is on another origin) before building.');
    process.exit(1);
  }
  mkdirSync('dist', { recursive: true });
  const options = { apiOrigin: env.VITE_API_URL ?? '', gamesOrigin };
  writeFileSync('dist/_headers', buildHeaders(options));
  writeFileSync('dist/headers.caddy', buildCaddyHeaders(options));
  writeFileSync('dist/_redirects', '/*    /index.html   200\n');
  console.log('Wrote dist/_headers, dist/headers.caddy and dist/_redirects');
}
