import { pino, type Logger } from 'pino';

/** Log without credentials. Keys below are removed wherever pino sees them. */
export function createLogger(level: string): Logger {
  return pino({
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.currentPassword',
        '*.newPassword',
        '*.totp',
        '*.recoveryCode',
        '*.token',
        '*.secret',
      ],
      censor: '[redacted]',
    },
  });
}

/** Paths for logging: no query string, and preview tokens are hidden. */
export function safeUrl(url: string): string {
  return (url.split('?')[0] ?? '').replace(/^\/pv\/[^/]+\//, '/pv/[redacted]/');
}
