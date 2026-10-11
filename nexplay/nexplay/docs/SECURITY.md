# Security map

Each row names the control, where it lives, and the test that exercises it.
"Ran" means it was executed while this was written. "Written" means the test exists but needs a database and has not been run.
Passing tests do not prove the application is secure.

| Requirement | Control | Where | Test |
| --- | --- | --- | --- |
| SQL injection | Prisma query API only. The tagged-template `$queryRaw` form is parameterized. A lint rule bans `$queryRawUnsafe` and `$executeRawUnsafe`. Input is validated with Zod. | `src/routes/*`, `schemas.ts`, `eslint.config.js` | `injection.test.ts` (written) |
| Database errors | Central handler returns a generic message and request id. Details go only to logs. | `middleware/errors.ts` | `injection.test.ts`, `headers-cors.test.ts` (written) |
| Least privilege DB | Three roles: owner (migrations, admin scripts), `nexplay_app` (no INSERT/DELETE on users, append-only audit), `nexplay_public` (read-only). | `prisma/sql/create-roles.sql`, `prisma/migrations/*_security` | `rls.test.ts` (written) |
| Row-level security | RLS on `Game` and `GameVersion`: the public role sees published games and their live version only. | `prisma/migrations/*_security` | `rls.test.ts` (written) |
| DB constraints | Slug format, published games must have a version, lowercase emails, size checks, unique keys. | `prisma/migrations/*_security` | `rls.test.ts` (written) |
| XSS | All text is plain text. JSON responses carry `nosniff` and a locked CSP. The server never renders HTML. The React app renders game text as text only, lint forbids `dangerouslySetInnerHTML`, and the CSP allows no inline script or `eval`. | `schemas.ts`, `middleware/security.ts`, `web/eslint.config.js`, `web/scripts/make-headers.mjs` | `injection.test.ts` (written). Browser run: hostile titles shown literally, nothing executed (ran). `web/tests/GameCard.test.tsx` (written). |
| CSRF | Origin/Referer allowlist plus a per-session token compared in constant time. State changes never use GET. | `middleware/csrf.ts`, `lib/origin.ts` | `unit/origin.test.ts` (ran), `authorization.test.ts`, `auth.test.ts` (written) |
| Session security | Server-side sessions in Postgres. Random 256-bit ids, `HttpOnly`, `SameSite=Strict`, `Secure` and `__Host-` prefix in production. New id at login and at security changes. Idle and absolute timeouts. Logout destroys the server session. | `app.ts`, `routes/auth.ts`, `middleware/auth.ts` | `auth.test.ts` (written) |
| JWT | Not used. Server-side sessions meet the need, so there are no tokens to leak or revoke. | n/a | n/a |
| Passwords | Argon2id (OWASP minimum profile). Unknown emails take the same time as wrong passwords. Length-based policy. | `password.ts`, `lib/password-policy.ts` | `unit/password-policy.test.ts` (ran), `auth.test.ts` (written) |
| MFA | TOTP with replay protection, secrets encrypted with AES-256-GCM, ten single-use recovery codes stored only as keyed hashes. Setup and disable need the password. | `routes/auth.ts`, `lib/crypto.ts` | `unit/crypto.test.ts` (ran), `auth.test.ts` (written) |
| Account recovery | CLI on the server. No emailed links, because no email provider is configured. | `scripts/reset-password.ts` | manual |
| Rate limiting | Global, login (per IP and per account), admin, upload, launch counter, game assets. Postgres store for production. 429 with `Retry-After`. | `limiters.ts` | `auth.test.ts` (written) |
| Authorization | `requireAdmin` runs before the whole admin router, re-reads the account every request, and denies by default. | `app.ts`, `middleware/auth.ts` | `authorization.test.ts` (written) |
| Upload: who | Admin only, CSRF protected, rate limited, two at a time, 5-minute cap. | `routes/admin.ts` | `uploads.test.ts` (written) |
| Upload: contents | Names, types, symlinks, encryption, sizes, entry count, compression ratio, duplicate names, text and magic-number checks. Server-generated storage keys. | `archive.ts`, `lib/archive-paths.ts`, `lib/file-types.ts` | `unit/archive-paths.test.ts`, `unit/file-types.test.ts` (ran), `uploads.test.ts` (written) |
| Upload: atomic | Validate everything, copy to storage, then create the row. Any failure deletes what was stored. Publishing is a separate action. | `upload.ts` | `uploads.test.ts` (written) |
| Malware scan | Optional ClamAV (`CLAMAV_HOST`). If configured and it fails, the upload fails. If not configured, the upload is marked unscanned and the server logs a warning. | `scanner.ts` | `uploads.test.ts` uses a stub scanner (written). Not tested against real clamd. |
| Game isolation | Separate origin and process, no cookies, CSP with `frame-ancestors` for the app only, `connect-src 'self'` so games cannot call other sites, `sandbox` in the CSP, `nosniff`. The front-end must embed with `sandbox="allow-scripts allow-pointer-lock"`. | `gamehost.ts` | `uploads.test.ts` (written) |
| Preview links | HMAC-signed, 10 minutes, bound to one version, carried in the path. | `lib/preview-token.ts` | `unit/preview-token.test.ts` (ran), `uploads.test.ts` (written) |
| SSRF | No feature fetches a user-supplied URL. External game URLs are not supported. | n/a | n/a |
| CORS | Exact origin match, credentials only for that origin, explicit methods and headers. | `app.ts` | `headers-cors.test.ts` (written) |
| Security headers | Helmet defaults narrowed, locked CSP, `no-referrer`, Permissions-Policy, HSTS in production. Front-end headers are set by its host (see DEPLOYMENT.md). | `middleware/security.ts` | `headers-cors.test.ts` (written). Must also be checked on the real deployment. |
| Secrets | Read from the environment, validated at start-up, errors name settings but never values, production refuses placeholders. `.env` is git-ignored. | `config.ts`, `.gitignore` | `unit/config.test.ts` (ran) |
| Logging and privacy | Credentials redacted, no IPs, no query strings, no user agents. Audit events for sensitive actions, retention script. Launch stats are one counter per game per day. | `logger.ts`, `audit.ts`, `scripts/purge-audit.ts` | `unit/redact.test.ts` (ran) |
| Webhooks | None exist. None were added just to tick a box. | n/a | n/a |
| Source maps | `build.sourcemap` is false in the Vite config. | `web/vite.config.ts` | check `dist/` has no `.map` files after a build |
| Front-end game isolation | Player refuses any address not on `VITE_GAMES_ORIGIN`, checks the game is reachable, frames it with `sandbox="allow-scripts allow-pointer-lock"` and no referrer. | `web/src/lib/urls.ts`, `web/src/components/GamePlayer.tsx` | `web/tests/urls.test.ts` (ran), browser run (ran), `web/tests/GamePlayer.test.tsx` (written) |
| Front-end tokens | CSRF token held in memory only, never in web storage. Public calls send no cookies. Admin session is a server-set HttpOnly cookie. | `web/src/lib/api.ts` | `web/tests/api.test.ts` (ran) |
| Front-end data in the browser | Only slugs, validated on read, in `localStorage`. | `web/src/lib/storage.ts` | `web/tests/storage.test.ts` (ran) |
| Front-end headers | CSP, HSTS, nosniff, referrer policy and permissions policy are generated for the real origins at build time. | `web/scripts/make-headers.mjs` | `web/tests/make-headers.test.ts` (ran). Verify on the real deployment with `curl -I`. |

## Pipeline and supply chain (GitHub)

| Risk | Control | Where |
| --- | --- | --- |
| Bugs and vulnerable code | CodeQL code scanning on every pull request and weekly | `.github/workflows/codeql.yml` |
| Leaked credentials | Gitleaks over the full history on every push, plus the repository scanner for patterns and sensitive file names | `.github/workflows/secret-scan.yml`, `.gitleaks.toml`, `scripts/check-repo.py` |
| Vulnerable packages | Dependency review blocks risky additions on pull requests, weekly `npm audit`, Dependabot updates for packages, actions, Docker and Compose | `dependency-review.yml`, `audit.yml`, `.github/dependabot.yml` |
| Vulnerable container | Trivy scan (fixable HIGH and CRITICAL findings fail the build) before anything is pushed; images carry provenance and an SBOM | `.github/workflows/docker.yml` |
| Unpinned builds | Lockfiles (created by the `Create lockfiles` workflow) and `npm ci` once they exist | `.github/workflows/lockfiles.yml`, `.github/actions/setup-node-app` |
| Workflow mistakes and script injection | Every workflow declares least-privilege `permissions`; untrusted values are never placed in shell scripts; the scanner flags both | `scripts/check-repo.py` |
| Stolen deploy credentials | SSH key and pinned host key live in a protected `production` environment that can require approval; the server pulls images with a short-lived token | `.github/workflows/deploy.yml` |
| Hardened runtime | Non-root user, read-only filesystem, all capabilities dropped, only Caddy publishes ports, database not reachable from outside | `server/Dockerfile`, `deploy/docker-compose.yml` |
| Broken release | Deploy waits for `/readyz`, rolls back automatically if the new version never becomes ready, then checks headers and CORS on the live site | `deploy/deploy.sh`, `deploy.yml` |

Third-party actions are referenced by version tag. For the strongest protection, pin them to full commit hashes (Dependabot can then keep the hashes current).
