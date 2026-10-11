# Deploying with GitHub

GitHub runs the checks and does the deploy. You push code, GitHub tests and scans it, and one button ships it to your own server over HTTPS.

**What you get**

* Checks on every change: types, lint, unit and browser tests, the database tests, a real start-up test of the server.
* Security scans: code scanning (CodeQL), secret scanning, dependency review, weekly package audits, container scanning.
* Container images stored on GitHub (ghcr.io), built from your code.
* A **Deploy** workflow: builds, scans, copies to your server, runs migrations, waits until it is healthy, goes back automatically if it is not, then checks the live site.
* GitHub Codespaces: a ready-made development environment you can open in a browser, including from a phone.

Nothing here has been run on GitHub yet. See "What is not verified" at the end, and expect to fix a few things on the first run: the logs will say what.

## 1. Put the code on GitHub

**Do not use "Upload files" on github.com, or the GitHub phone app.** They cannot open a zip file (the zip would just sit there as one file), they take at most 100 files at a time (this project has about 175), and a phone cannot pick whole folders or hidden ones such as `.github`. That is the usual reason an upload "doesn't work".

Create a **private** repository (for example `nexplay`; no README needed for either option), then use one of these.

**Option A: on a phone or tablet (upload the zip itself, then unzip it inside GitHub Codespaces)**

A single file does upload fine from a phone. The trick is to upload the zip as one file and let GitHub's own editor unzip it.

1. In your phone's **browser** (not the GitHub app), open the new empty repository on github.com. Tap the link **uploading an existing file**, choose `nexplay-platform.zip`, and tap **Commit changes**. (If the page looks cramped, turn on "Desktop site" in the browser menu.)
2. The repository now has a file in it, so a **Code** button appears. Tap **Code > Codespaces > Create codespace on main**. A code editor opens in the browser.
3. Open a terminal (menu > Terminal > New Terminal) and run these, one line at a time:

```bash
unzip -o nexplay-platform.zip && cp -r nexplay/. . && rm -rf nexplay nexplay-platform.zip
git add -A
git commit -m "First version"
git push
```

If `unzip` is not found, use `python3 -m zipfile -e nexplay-platform.zip .` for the first step instead (then `cp -r nexplay/. . && rm -rf nexplay nexplay-platform.zip`).

When it finishes, refresh the repository page: all the folders are there.

**Option B: with a computer.** Leave "Add a README" **unticked**. Unzip `nexplay-platform.zip`, then in that folder:

```bash
git init -b main
git add .
git commit -m "First version"
git remote add origin https://github.com/YOUR-NAME/nexplay.git
git push -u origin main
```

Common push errors on a computer:

* *"Authentication failed"* or asking for a password: GitHub no longer accepts account passwords. Install the GitHub CLI and run `gh auth login`, or use a personal access token as the password.
* *"refusing to allow ... to create or update workflow ... without `workflow` scope"*: the login you used may not change files in `.github/workflows`. Run `gh auth refresh -s workflow`, or make the token with the **workflow** permission ticked, then push again.
* *"Updates were rejected"* or *"remote contains work that you do not have"*: the repository was created with a README. Run `git pull origin main --allow-unrelated-histories`, resolve the README conflict by keeping your file, commit, and push.

## 2. Create the lockfiles

Lockfiles pin every package version, so builds are repeatable. On GitHub: **Settings > Actions > General > Workflow permissions**, tick **Allow GitHub Actions to create and approve pull requests**, save. Then **Actions > Create lockfiles > Run workflow**, and merge the pull request it opens.

(Or run `npm install` in `server/` and in `web/` yourself and commit the two `package-lock.json` files.)

## 3. Turn on GitHub's protections

In the repository **Settings**:

| Where | Turn on |
| --- | --- |
| Code security | Dependabot alerts, Dependabot security updates, Secret scanning and **Push protection**, Private vulnerability reporting |
| Code security | Code scanning. The CodeQL workflow is included. Private repositories need GitHub Code Security for the results page |
| Branches | Add a rule for `main`: require a pull request, require status checks (**Repository checks**, **Server (types, lint, tests, build)**, **Web (types, lint, tests, build)**, **Browser tests (desktop and phone)**), block force pushes |
| Actions > General | Workflow permissions: **Read repository contents** (each workflow asks for more only where it needs it) |

Edit `.github/CODEOWNERS` to put your username in, so changes to security-sensitive folders need your review.

## 4. What runs, and when

| Workflow | When | What it does |
| --- | --- | --- |
| CI | every push to `main` and every pull request | repository scanner; server: types, lint, unit tests, database setup, integration tests, build and start-up check; web: types, lint, tests, build, no source maps; browser tests on desktop and phone sizes |
| CodeQL | pull requests, pushes to `main`, weekly | looks for security bugs in the TypeScript |
| Secret scan | pushes, pull requests, weekly | searches the whole history for passwords and keys |
| Dependency review | pull requests | blocks new packages with high-severity problems |
| Dependency audit | weekly, and when `package.json` changes | `npm audit` for shipped packages |
| Container images | changes under `server/` | builds, scans (Trivy), pushes to ghcr.io from `main` |
| Deploy | you start it, or push a tag like `v1.0.0` | builds, deploys to your server, checks the live site |
| Dependabot | weekly | opens pull requests for package, Docker and GitHub Actions updates |

If a check fails, open it in the **Actions** tab. The red step names the problem.

## 5. Get a server ready (once)

You need:

* A small Linux server (Ubuntu 22.04 or 24.04, 2 GB of memory or more) with a public IP address.
* **Three domain names** pointing at that IP with A records: the app (`play.example.com`), the API (`api.example.com`), and the games, which must be a **different website name** from the app (`nexplay-games.example`). Different names keep uploaded games away from the admin login.
* A **private bucket** on an S3-compatible service (Cloudflare R2, Backblaze B2, AWS S3...) and an access key for it.

On the server:

```bash
curl -fsSL https://get.docker.com | sh                 # installs Docker and the compose plugin
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
mkdir -p /opt/nexplay && chown deploy:deploy /opt/nexplay
```

On your own computer, make a key just for deploys and let it in:

```bash
ssh-keygen -t ed25519 -f nexplay-deploy -C github-deploy -N ""
ssh-copy-id -i nexplay-deploy.pub deploy@YOUR_SERVER_IP
ssh-keyscan -t ed25519 YOUR_SERVER_IP                   # copy this output, it is the "known hosts" secret
```

Then create the server's private settings file. It asks for your domains and bucket details and generates every secret itself:

```bash
scp deploy/init-env.sh deploy@YOUR_SERVER_IP:/opt/nexplay/
ssh -t deploy@YOUR_SERVER_IP "cd /opt/nexplay && ./init-env.sh"
```

Keep a copy of that `.env` in a password manager. It never goes in GitHub.

## 6. Add the deploy settings in GitHub

**Settings > Environments > New environment**, name it `production`. Under **Required reviewers** add yourself, so every deploy needs your approval. Then add:

| Type | Name | Value |
| --- | --- | --- |
| Secret | `DEPLOY_SSH_KEY` | the contents of `nexplay-deploy` (the private key file) |
| Secret | `DEPLOY_KNOWN_HOSTS` | the `ssh-keyscan` output from above |
| Variable | `DEPLOY_HOST` | your server's IP address or name |
| Variable | `DEPLOY_USER` | `deploy` |
| Variable | `APP_HOST` | `play.example.com` |
| Variable | `API_HOST` | `api.example.com` |
| Variable | `GAMES_HOST` | `nexplay-games.example` |
| Variable (optional) | `DEPLOY_PATH`, `DEPLOY_PORT` | defaults are `/opt/nexplay` and `22` |

## 7. First deploy

**Actions > Deploy > Run workflow**, approve it, and wait. The first run takes a few minutes while certificates are issued. When it is green, open `https://play.example.com`.

Create the administrator on the server (it asks for the email and a hidden password):

```bash
ssh -t deploy@YOUR_SERVER_IP "cd /opt/nexplay && docker compose --profile tools run --rm admin"
```

Sign in at `https://play.example.com/admin/login`, open **Security**, and turn on two-factor authentication.

## 8. Everyday use

1. Make a change on a branch and open a pull request. CI and the scans run.
2. Merge when everything is green.
3. Deploy: **Actions > Deploy > Run workflow**, or tag a release: `git tag v1.0.1 && git push --tags`.

## 9. If something goes wrong

* The deploy script checks the new version and **goes back to the previous one by itself** if it never becomes ready. Database changes only move forward, so write migrations so the old version still works with them.
* To go back manually: **Actions > Deploy > Run workflow**, and under **Use workflow from** choose an earlier tag.
* Logs on the server: `docker compose logs --tail=100 api` (run in `/opt/nexplay`).
* Lost admin access: `docker compose --profile tools run --rm --entrypoint "npx tsx src/scripts/reset-password.ts" admin --email=you@example.com` (add `--disable-mfa` if the phone is lost).

## 10. Developing in GitHub Codespaces

**Code > Codespaces > Create codespace** gives you Node, Postgres and the settings, ready to go (`.devcontainer/` does the setup). Follow the short instructions it prints: create the admin, start the server, start the web app with `npm run dev -- --host`. For the game player, make port 4001 **Public** (Ports tab, right-click the port, Port Visibility). Run `npm test` in `server/` and `web/` any time. This is also the easiest place to run the full test suite for the first time.

## 11. Other hosting

* **GitHub Pages** cannot send security headers (the Content Security Policy, HSTS), so it is not suitable for the real site. The server part needs a real server anyway.
* **Cloudflare Pages or Netlify** for the web app: the build writes `dist/_headers` and `dist/_redirects`, which both understand. The API and game host still need a server or a container host.
* **Another way to run containers** (Fly.io, Render, Railway...): use the image from ghcr.io (`nexplay-server`, with `SERVICE=api` or `SERVICE=games`) and the variables in `deploy/.env.example`. Run `scripts/db-bootstrap.sh` once from the `nexplay-server-tools` image.

## What is not verified

* None of the workflows has run on GitHub, no image has been built, and the Compose stack and Caddy settings have never been started. They were checked for structure by the repository scanner (valid YAML, real file references, least-privilege permissions, no script injection).
* Action versions (for example `aquasecurity/trivy-action@0.28.0`, `docker/build-push-action@v6`) are written from memory. If a step says it cannot find a version, change it to the current one. Dependabot will then keep them updated.
* The migrations were written by hand and compared with `schema.prisma` column by column. CI also runs `prisma migrate diff` as an advisory check.
* The Trivy step can fail on a vulnerability in the base operating system. Re-run it later, since the base image is refreshed on every build.
* Plan for one or two rounds of fixes on the first CI run. Paste the log of any red step and it can be fixed quickly.
