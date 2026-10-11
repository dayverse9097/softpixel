# Status

## Review and GitHub setup (latest pass)

### What the scan covered
* A repository scanner (`scripts/check-repo.py`, also run by CI): leaked secrets and sensitive file names, risky code patterns (raw SQL, injected HTML, `eval`, loose CORS, insecure cookies, `Math.random` for secrets), workflow mistakes (missing permissions, unpinned actions, script injection, missing files), Dockerfile and Compose rules (non-root, read-only, only Caddy publishes ports), package manifests, migrations, and documentation links. Result: **0 errors**. I planted five deliberate problems and it caught all five.
* A line-by-line re-read of the server's request handling, uploads, game host and storage code, and a comparison of the server's response shapes with what the web app expects.
* The hand-written database migration was compared with `schema.prisma` column by column (names, types, required, defaults): they agree.
* Re-ran everything after the changes: 93 server unit tests, 65 web unit tests, type checks (0 errors), 49 + 32 browser checks. All pass.

### Problems found and fixed
* **File names:** upload validation accepted accented and symbol characters in file names, which the storage layer then refused, so a valid-looking game could fail with a server error. Names are now checked up front, with a clear message (tests added).
* **Game host:** `HEAD` requests (the player's reachability check) downloaded the whole file. They now return headers only. A visitor closing the tab mid-download no longer logs an error.
* **Uploads:** zipping the folder instead of its contents is the most common mistake; the error now says exactly that.
* **Operations:** added `/readyz` (checks the database), and the server now exits on an unhandled promise rejection so the platform restarts it instead of limping on.
* **CI:** the production-build check would have rejected `http://localhost` and broken the browser tests. It now allows plain http for localhost only.

### What the scan cannot tell you
* Known vulnerabilities in packages (needs the registry; `npm audit` and Dependabot do this on GitHub).
* CodeQL findings, Trivy results and gitleaks history scans (they run on GitHub).
* Whether the workflows, Docker image, Compose stack and Caddy config work: none has been run. The first CI run will probably need a fix or two.

### GitHub and deployment (new)
Workflows for CI, CodeQL, secret scanning, dependency review, weekly audits, container build and scan, lockfile creation and deploy; Dependabot; a production Docker image; a Compose stack with HTTPS (Caddy), the API, the game host and Postgres; deploy and server-setup scripts; database migrations; and a Codespaces environment. See `docs/GITHUB.md`.


## Front-end (`web/`)

### Ran in this environment
* The app was bundled with esbuild and Tailwind 3.4 and driven in headless Chromium (phone and desktop sizes) against a mock API and mock game host: **49 public-site checks and 32 admin checks passed.** They cover search and filters, hostile game text rendering as plain text, the sandboxed player (sandbox flags, failure and retry, untrusted addresses never framed), favorites and recently played (including corrupted storage), the mobile menu, no horizontal scrolling on 8 pages at phone width, skip link and focus handling, sign-in with two-factor, the admin guard, upload, preview, delete confirmation, the security page, session loss, and that every admin write carried the CSRF token. A simple accessibility audit (labels, names, one heading, unique ids, alt text, frame titles) came back clean on every public page at desktop and phone width and on the admin pages.
* 59 unit tests (API client including CSRF retry, URL allowlist, favorites storage, formatting, header generator) passed through a Vitest stand-in, and failed when I deliberately removed the URL credential check and the CSRF retry.
* A type check passed with no errors, against loose stand-in declarations for React and the router.
* Two bugs were found and fixed this way: page focus jumping on first load, and background gradients hidden behind the page colour.

### Not run
* `npm install`, `npm run build` (real Vite), `npm run lint`, the Vitest component tests, the axe tests, and the Playwright specs in `e2e/`. They are written but have never been executed.
* The app was run with small stand-ins for `react-router-dom` and `framer-motion`, because those packages could not be installed here. Navigation and rendering were verified, but the real animation library and router were not exercised. Expect small differences.
* Colour contrast was estimated by eye and design tokens, not measured. The Playwright axe run measures it.
* The front-end has never talked to the real server. Field names follow the server's serializers, but a mismatch would only show up in a real run.
* The fonts (Manrope, Unbounded) load from npm packages and were not present in my test browser, so screenshots used fallback fonts.

### Known limits
* No QR code for two-factor setup (manual key and `otpauth://` link only).
* A game that has keyboard focus keeps the Escape key, so the preview dialog's Close button or backdrop is the way out for keyboard users.
* Fullscreen is hidden where the browser does not offer it (for example iPhone Safari).
* Favorites and recently played show only games that are still published.

## Server (`server/`)

## Ran in this environment
* 90 unit tests (security-critical pure modules and configuration validation): all passed. A deliberate break of the path check was caught by the tests, so the harness does detect failures.
  They ran through a minimal stand-in for Vitest, because packages could not be installed here. Run `npm run test:unit` to confirm with the real runner.
* A TypeScript type check with the type definitions available here. It found one real bug (Zod chaining), which is fixed. It could not check code that uses Express, Prisma and other packages, because their types were not installable.
* A syntax check of every file.

## Written but not run
* All integration tests (`tests/integration/*`): authentication, sessions, MFA, CSRF, authorization, injection, XSS, uploads, game host isolation, headers and CORS, row-level security. They need Postgres and the real dependencies.
* The server itself has never been started. Expect some fixes on first run.
* `npm install`, `npm audit`, `npm run lint` and a production build have not been run. Dependency versions were chosen from memory without registry access. Run `npm install`, then `npm audit`, and update anything it flags.

## Decisions and known limits
* One role (administrator). Games are not owned per user, so "cross-user" tests are replaced by tests for deleted accounts and for versions that belong to another game.
* No emailed password reset (no provider). Recovery is a server CLI.
* No webhooks, no external game URLs, no rich text.
* Uploads are processed inside the request. Large builds hold a connection for a while. Limits and a two-at-a-time cap protect the server.
* Games run in a sandbox without `allow-same-origin`, so `localStorage` is unavailable to them. Games that need saves will need a deliberate change.
* The game host does not support HTTP range requests (seeking in long audio or video).
* Unity builds must be uncompressed (`.br` and `.gz` files are not allowed). Godot web exports without threads work. Threaded exports need cross-origin isolation headers, which are not configured.
* Cover images are checked by their first bytes and size, not decoded, so pixel dimensions are not limited.
* The ClamAV client scans the ZIP, and clamd's `StreamMaxLength` must be raised to at least `MAX_ARCHIVE_MB`.
* The Postgres rate-limit table layout follows the library's documented schema and should be confirmed against the installed version.
* Rotating `ENCRYPTION_KEY` needs a re-encryption step that is not scripted yet. See DEPLOYMENT.md.

## Not built
* A CI pipeline file for the front-end and back-end.
* A real end-to-end run of front-end plus server together.
