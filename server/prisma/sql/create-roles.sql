-- Creates the two least-privilege runtime roles. Run once, BEFORE "prisma migrate deploy", as a role that can
-- create roles (the superuser in a local container, or your host's admin user). Safe to run again: it only
-- creates what is missing and always refreshes the passwords.
--
--   psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -v app_password='...' -v public_password='...' -f prisma/sql/create-roles.sql
--
-- The roles cannot create or drop tables, cannot bypass row-level security and cannot change their own privileges.
-- The migration "..._security" then grants each one exactly what it needs.

SELECT format('CREATE ROLE nexplay_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexplay_app')
\gexec

SELECT format('CREATE ROLE nexplay_public LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', :'public_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexplay_public')
\gexec

ALTER ROLE nexplay_app WITH PASSWORD :'app_password';
ALTER ROLE nexplay_public WITH PASSWORD :'public_password';

GRANT CONNECT ON DATABASE :"DBNAME" TO nexplay_app, nexplay_public;
