#!/bin/sh
# Runs ON THE SERVER, from the deploy folder. The GitHub "Deploy" workflow calls it; you can also run it by hand:
#   sh deploy.sh ghcr.io/you/nexplay-server:sha-abc1234 ghcr.io/you/nexplay-server-tools:sha-abc1234
#
# It records the image, prepares the database, starts the new version, waits until it is ready, and goes back to the
# previous version if it never becomes ready. (Database migrations only move forward, so keep them backward compatible.)
set -eu
cd "$(dirname "$0")"

SERVER_IMAGE="${1:?usage: deploy.sh <server-image> <tools-image>}"
TOOLS_IMAGE="${2:?usage: deploy.sh <server-image> <tools-image>}"

[ -f .env ] || { echo "Missing .env. Run ./init-env.sh once first." >&2; exit 1; }
[ -f Caddyfile ] && [ -f headers.caddy ] && [ -d web ] || { echo "Missing Caddyfile, headers.caddy or web/. The deploy workflow copies them." >&2; exit 1; }

set_var() {
  grep -v "^$1=" .env > .env.tmp || true
  printf '%s=%s\n' "$1" "$2" >> .env.tmp
  mv .env.tmp .env
  chmod 600 .env
}

PREVIOUS="$(sed -n 's/^NEXPLAY_IMAGE=//p' .env | tail -n 1)"
PREVIOUS_TOOLS="$(sed -n 's/^NEXPLAY_TOOLS_IMAGE=//p' .env | tail -n 1)"
set_var NEXPLAY_IMAGE "$SERVER_IMAGE"
set_var NEXPLAY_TOOLS_IMAGE "$TOOLS_IMAGE"

docker compose pull
docker compose --profile tools run --rm bootstrap
docker compose up -d --remove-orphans

ready=0
for _ in $(seq 1 40); do
  if docker compose exec -T api node -e "fetch('http://127.0.0.1:4000/readyz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 3
done

if [ "$ready" -ne 1 ]; then
  echo "The new version did not become ready." >&2
  docker compose logs --tail=60 api >&2 || true
  if [ -n "$PREVIOUS" ]; then
    echo "Going back to $PREVIOUS" >&2
    set_var NEXPLAY_IMAGE "$PREVIOUS"
    [ -n "$PREVIOUS_TOOLS" ] && set_var NEXPLAY_TOOLS_IMAGE "$PREVIOUS_TOOLS"
    docker compose up -d api games
  fi
  exit 1
fi

# pick up changes to the Caddyfile or headers (the first start already has them)
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true
echo "Deployed $SERVER_IMAGE"
