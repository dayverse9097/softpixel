#!/usr/bin/env bash
# Runs once when the Codespace is created: installs packages, writes development settings and prepares the database.
set -euo pipefail
cd "$(dirname "$0")/.."

sudo apt-get update -y >/dev/null
sudo apt-get install -y postgresql-client >/dev/null

APP_ORIGIN="http://localhost:5173"
GAMES_ORIGIN="http://localhost:4001"
if [ -n "${CODESPACE_NAME:-}" ]; then
  # In a Codespace every forwarded port has its own web address
  APP_ORIGIN="https://${CODESPACE_NAME}-5173.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  GAMES_ORIGIN="https://${CODESPACE_NAME}-4001.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
fi

secret() { node -e "console.log(require('crypto').randomBytes($1).toString('$2'))"; }

(
  cd server
  if [ ! -f .env ]; then
    sed -e "s|^APP_ORIGIN=.*|APP_ORIGIN=${APP_ORIGIN}|" \
        -e "s|^GAMES_ORIGIN=.*|GAMES_ORIGIN=${GAMES_ORIGIN}|" \
        -e "s|^SESSION_SECRET=.*|SESSION_SECRET=$(secret 48 base64url)|" \
        -e "s|^PREVIEW_SECRET=.*|PREVIEW_SECRET=$(secret 48 base64url)|" \
        -e "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(secret 32 hex)|" \
        -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://nexplay_app:dev-app@db:5432/nexplay|" \
        -e "s|^DATABASE_URL_PUBLIC=.*|DATABASE_URL_PUBLIC=postgresql://nexplay_public:dev-public@db:5432/nexplay|" \
        -e "s|^MIGRATOR_DATABASE_URL=.*|MIGRATOR_DATABASE_URL=postgresql://nexplay_migrator:dev-only-change-me@db:5432/nexplay|" \
        .env.example > .env
  fi
  npm install
  npx prisma generate
  psql "postgresql://nexplay_migrator:dev-only-change-me@db:5432/nexplay" -v ON_ERROR_STOP=1 \
    -v app_password=dev-app -v public_password=dev-public -f prisma/sql/create-roles.sql
  npx prisma migrate deploy
)

(
  cd web
  [ -f .env ] || printf 'VITE_API_URL=\nVITE_GAMES_ORIGIN=%s\n' "$GAMES_ORIGIN" > .env
  npm install
)

cat <<MSG

NEXPLAY is ready.
  1. Create the first admin:   cd server && npm run admin:create
  2. Start the server:         cd server && npm run dev
  3. Start the web app:        cd web && npm run dev -- --host
  4. Open port 5173 (Ports tab). For the game player, make port 4001 Public (right-click it > Port Visibility).
Run the checks any time:      cd server && npm test      |      cd web && npm test

MSG
