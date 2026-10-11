# Deployment guide

## Domains
Use three hostnames over HTTPS:

* `play.example.com` for the static front-end.
* `api.example.com` for the API. It shares a registrable domain with the front-end, so the `SameSite=Strict` session cookie is sent.
* `nexplay-games.example` for uploaded games. **Use a different registrable domain**, not a subdomain of `example.com`. Then nothing a game does can reach the app's cookies or storage, even in a browser bug.

Set `APP_ORIGIN` and `GAMES_ORIGIN` to the exact origins, with no trailing slash. The server refuses to start in production if they are not https or share a hostname.

## The easy path: one server, deployed from GitHub
`docs/GITHUB.md` sets this up step by step. The `deploy/` folder runs Caddy (HTTPS), the API, the game host and Postgres with Docker Compose on one Linux server, and the Deploy workflow updates it. The rest of this page explains each part, for when you run things differently.

## Running the server
Run two services from the same image: `SERVICE=api` and `SERVICE=games`. Put each behind its own domain. Set `TRUST_PROXY` to the number of proxies in front (1 for a single load balancer). If it is wrong, every visitor appears to have the proxy's IP and rate limits misfire.

Health checks: `/healthz` says the process is up, and `/readyz` (API) also checks the database.

## Database
1. Create the database and an owner role (`nexplay_migrator`).
2. Run `prisma/sql/create-roles.sql` as a role that can create roles. It creates the two runtime roles and sets their passwords (the command is at the top of the file).
3. Run `prisma migrate deploy` as the owner. It creates the tables, constraints, grants and row-level security.
4. Set `DATABASE_URL` (app role) and `DATABASE_URL_PUBLIC` (public role). Keep `MIGRATOR_DATABASE_URL` out of the running servers' environment; only the admin scripts and the migration step need it.
5. Create the first admin with `npm run admin:create`, then turn on MFA.

`deploy/deploy.sh` does steps 2 and 3 on every deploy. Migrations only move forward, so write new ones so the previous version of the app still works with them. If you add a table, add grants for the right role in the same migration.

Backups: the Compose stack writes a nightly `pg_dump` to a volume and keeps 14 days. That is only a safety net on the same machine. Also copy the dumps off the server (for example with `rclone` to a bucket, or your host's snapshots) and **practice a restore** on a scratch database: create the roles first (`create-roles.sql`), then `gunzip -c dump.sql.gz | psql ...`. Enable versioning on the object-storage bucket.

## Object storage
Create a **private** bucket on any S3-compatible service (Cloudflare R2, Backblaze B2, AWS S3, Wasabi, DigitalOcean Spaces...). No public access, no static website hosting. Give the API and game host one access key limited to that bucket. Games are served only through the game host. For Cloudflare R2 use the endpoint `https://<account id>.r2.cloudflarestorage.com` and the region `auto`.

## Front-end build and headers
Build with `VITE_API_URL` and `VITE_GAMES_ORIGIN` set (see `web/README.md`). The build writes `dist/_headers` with the values below for your real origins, plus `dist/_redirects` for deep links. Netlify and Cloudflare Pages read both files. The build also writes `dist/headers.caddy`, the same policy for Caddy, which the Compose stack uses. On another host, copy the values into its configuration. GitHub Pages cannot send custom response headers, so it cannot carry this policy; use it only for throwaway previews. The generated policy is:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://nexplay-games.example; font-src 'self'; connect-src 'self' https://api.example.com; frame-src https://nexplay-games.example; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), fullscreen=(self "https://nexplay-games.example")
```
Embed games like this: `<iframe src="…" sandbox="allow-scripts allow-pointer-lock" allow="fullscreen" referrerpolicy="no-referrer">`. Do not add `allow-same-origin`, `allow-popups`, `allow-top-navigation` or `allow-downloads` without a reason you have reviewed.

Only enable HSTS once HTTPS works on every hostname it covers.

## Check the real deployment
Do not trust local tests for headers. After each deploy:
```bash
curl -sI https://play.example.com/            # CSP, HSTS, nosniff, referrer policy
curl -sI https://api.example.com/api/games     # nosniff, CSP default-src 'none'
curl -sI -H 'Origin: https://evil.test' https://api.example.com/api/games   # no Access-Control-Allow-Origin
curl -sI https://nexplay-games.example/g/<versionId>/index.html             # frame-ancestors, no Set-Cookie
```

## Secrets
Keep them in your host's secret manager. Never in git, never in the front-end bundle, never printed at start-up (the server prints setting names only).

Rotation:
* `SESSION_SECRET`: change it and restart. Everyone is signed out.
* `PREVIEW_SECRET`: change it. Open preview links stop working.
* Database or storage credentials: create new ones, deploy, then revoke the old ones.
* `ENCRYPTION_KEY`: protects MFA secrets and recovery-code hashes. Changing it invalidates both, so each admin must have MFA reset (`admin:reset-password -- --disable-mfa`) and re-enrolled. A re-encryption script is not provided yet.
* If a credential may have been exposed, rotate it first and investigate second.

## Game engines
* Plain HTML5, Canvas, Phaser: upload the folder as a ZIP with `index.html` at the top level.
* Godot: export for Web without threads, zip the export folder.
* Unity WebGL: build with compression disabled. `.br`, `.gz` and `.unityweb` files are rejected.
