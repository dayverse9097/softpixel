# NEXPLAY

A browser gaming platform where the owner publishes games and visitors play them in the browser.

This repository currently holds:

| Folder | What it is | State |
| --- | --- | --- |
| `server/` | API, admin login, game uploads, isolated game host, database schema, tests | Written. Unit tests ran. Integration tests written, **not yet run** (see `docs/STATUS.md`). |
| `web/` | The React front-end: public site, game player and admin dashboard | Written and run in a real browser against a mock API (see `docs/STATUS.md`). Not yet run against the real server. |
| `web-preview/` | The earlier single-page design preview with built-in demo games | Kept for reference. |
| `deploy/` | Production Docker Compose stack, HTTPS front door (Caddy), deploy and server-setup scripts | Written, never started. |
| `.github/` | CI, security scanning, container build, one-click deploy, Dependabot | Written, never run on GitHub. |
| `docs/` | Security map, deployment guide, GitHub guide, honest status | Written. |

The front-end in `web/` and the API in `server/` have not been run together yet. That is the next thing to do on your machine.

## How it fits together

```
 Visitor's browser
   |  app.example.com            static React app (CSP, HSTS)
   |  api.example.com            JSON API + admin login   (server: SERVICE=api)
   |  nexplay-games.example      uploaded games, nothing else (server: SERVICE=games)
   |
 Postgres  <- two runtime roles: nexplay_app (admin API), nexplay_public (read-only, row-level security)
 Private object storage (S3-compatible)  <- game builds and covers; only the game host reads it
```

Key rules the code enforces:

* Games run on a different origin from the app and from the admin dashboard, inside sandboxed iframes.
* Only a logged-in administrator can create, upload, publish or delete. There is no public sign-up and no default password.
* Public routes use a read-only database role that can only see published games.
* Every uploaded ZIP is checked entry by entry before anything is stored or published.

## Local development

You need Node 22 or newer and Docker (for Postgres).

```bash
docker compose up -d db

cd server
cp .env.example .env            # then fill in SESSION_SECRET, PREVIEW_SECRET, ENCRYPTION_KEY (commands are in the file)
npm install
npm run db:generate

# Database setup, in this order. MIGRATOR_DATABASE_URL is the owner URL from your .env.
psql "$MIGRATOR_DATABASE_URL" -v ON_ERROR_STOP=1 -v app_password=dev-app -v public_password=dev-public -f prisma/sql/create-roles.sql
npx prisma migrate deploy       # tables, constraints, least-privilege grants and row-level security
# Put those two passwords into DATABASE_URL and DATABASE_URL_PUBLIC in .env.

npm run admin:create            # asks for an email and a password (hidden). Creates the first administrator.
npm run dev                     # API on :4000, game host on :4001
```

In a second terminal, start the front-end (`web/README.md` has the details):

```bash
cd web && cp .env.example .env && npm install && npm run dev      # http://localhost:5173
```

The server's `.env` should have `APP_ORIGIN=http://localhost:5173`. Sign in at `/admin/login`.

After the first sign-in, turn on two-factor authentication (`POST /api/auth/mfa/setup`, then `/mfa/enable`).

## Checks and tests

```bash
npm run typecheck
npm run lint
npm run test:unit               # no database needed
npm run audit                   # dependency advisories; read the output, do not just trust it
```

Integration tests need a **throwaway** database prepared the same way as above, with these set:

```bash
export TEST_DATABASE_URL=postgresql://nexplay_migrator:...@localhost:5432/nexplay_test
export TEST_DATABASE_URL_APP=postgresql://nexplay_app:...@localhost:5432/nexplay_test      # row-level security tests
export TEST_DATABASE_URL_PUBLIC=postgresql://nexplay_public:...@localhost:5432/nexplay_test
npm run test:integration
```

They truncate tables. Never run them against real data. Without `TEST_DATABASE_URL` they are skipped, and a skipped test is not a passed test.

## Admin recovery

No email provider is configured, so there is no emailed reset link. Recovery is done on the server:

```bash
npm run admin:reset-password -- --email=you@example.com               # add --disable-mfa if the device is lost
```

## Put it on GitHub and deploy

`docs/GITHUB.md` walks through it step by step: pushing the code, turning on GitHub's security features, the checks that run on every change (tests, code scanning, secret scanning, dependency review, container scanning, weekly audits), and a Deploy workflow that ships the site to your own server over SSH with HTTPS handled automatically. It also covers GitHub Codespaces, a ready-made development environment you can open in a browser.

Run the repository scanner yourself any time: `python3 scripts/check-repo.py`.

## More

* `docs/SECURITY.md`: each security requirement, where it is implemented, and how it is tested.
* `web/README.md`: running, building and testing the front-end.
* `docs/DEPLOYMENT.md`: domains, headers, storage, database roles, secrets, backups, engine notes.
* `docs/STATUS.md`: what was run, what was not, and the remaining risks.
