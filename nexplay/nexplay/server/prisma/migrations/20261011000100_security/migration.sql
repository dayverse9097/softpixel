-- Security rules that Prisma cannot describe: database constraints, least-privilege grants and row-level security.
-- Run once by "prisma migrate deploy", as the owner role. The two runtime roles must already exist (sql/create-roles.sql).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexplay_app')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexplay_public') THEN
    RAISE EXCEPTION 'Create the runtime roles first: run prisma/sql/create-roles.sql, then run the migrations again.';
  END IF;
END
$$;

-- ---- Constraints: these hold even if application code has a bug ----

ALTER TABLE "Game"
  ADD CONSTRAINT game_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT game_title_not_blank CHECK (length(btrim(title)) > 0),
  -- A published game must always point at a build to play.
  ADD CONSTRAINT game_published_has_version CHECK (status <> 'PUBLISHED' OR "currentVersionId" IS NOT NULL);

ALTER TABLE "GameVersion"
  ADD CONSTRAINT version_sizes_valid CHECK ("fileCount" >= 0 AND "totalBytes" >= 0),
  ADD CONSTRAINT version_prefix_format CHECK ("storagePrefix" ~ '^games/[0-9a-f-]{36}/[0-9a-f-]{36}/$');

ALTER TABLE "User"
  ADD CONSTRAINT user_email_lowercase CHECK (email = lower(email));

-- ---- Grants: each runtime role gets only what it needs ----

GRANT USAGE ON SCHEMA public TO nexplay_app, nexplay_public;

-- Read-only role for the public catalogue and the game host. Row-level security (below) limits it to live, published games.
GRANT SELECT ON "Game", "GameVersion" TO nexplay_public;

-- Runtime role used by the admin API.
GRANT SELECT, INSERT, UPDATE, DELETE ON "Game", "GameVersion", "GameLaunchDaily" TO nexplay_app;
-- It can read and update accounts (sessions, MFA, password change) but cannot create or delete them.
-- Accounts are created by the admin script, which uses the owner role.
GRANT SELECT, UPDATE ON "User" TO nexplay_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "RecoveryCode" TO nexplay_app;
-- The audit trail is append-only for the application. Only the purge script (owner role) deletes rows.
GRANT SELECT, INSERT ON "AuditEvent" TO nexplay_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "session", "rate_limit" TO nexplay_app;

-- ---- Row-level security (the owner role is exempt, so migrations still work) ----

ALTER TABLE "Game" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GameVersion" ENABLE ROW LEVEL SECURITY;

-- Public role: published games only.
CREATE POLICY game_public_read ON "Game"
  FOR SELECT TO nexplay_public
  USING (status = 'PUBLISHED');

-- Public role: only the live version of a published game.
CREATE POLICY version_public_read ON "GameVersion"
  FOR SELECT TO nexplay_public
  USING (EXISTS (
    SELECT 1 FROM "Game" g
    WHERE g.id = "GameVersion"."gameId" AND g.status = 'PUBLISHED' AND g."currentVersionId" = "GameVersion".id
  ));

-- Admin API role: full access to its own tables.
CREATE POLICY game_app_all ON "Game" FOR ALL TO nexplay_app USING (true) WITH CHECK (true);
CREATE POLICY version_app_all ON "GameVersion" FOR ALL TO nexplay_app USING (true) WITH CHECK (true);
