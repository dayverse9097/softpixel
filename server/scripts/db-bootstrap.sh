#!/bin/sh
# Prepares the database: creates the two runtime roles, then applies every migration.
# Safe to run on every deploy. It only changes what is missing.
#
# Needs:
#   ADMIN_DATABASE_URL   owner or superuser connection (can create roles and tables)
#   APP_DB_PASSWORD      password to give the nexplay_app role
#   PUBLIC_DB_PASSWORD   password to give the nexplay_public role
set -eu

: "${ADMIN_DATABASE_URL:?ADMIN_DATABASE_URL is required}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"
: "${PUBLIC_DB_PASSWORD:?PUBLIC_DB_PASSWORD is required}"

tries=0
until psql "$ADMIN_DATABASE_URL" -c 'select 1' >/dev/null 2>&1; do
  tries=$((tries + 1))
  if [ "$tries" -gt 30 ]; then
    echo "The database did not become reachable in time." >&2
    exit 1
  fi
  sleep 2
done

psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v app_password="$APP_DB_PASSWORD" -v public_password="$PUBLIC_DB_PASSWORD" \
  -f prisma/sql/create-roles.sql

# Prisma reads the owner connection from MIGRATOR_DATABASE_URL
MIGRATOR_DATABASE_URL="$ADMIN_DATABASE_URL" npx prisma migrate deploy

echo "Database is ready."
