-- Non-superuser application role for RLS enforcement.
--
-- Superusers and table owners bypass RLS even with FORCE ROW LEVEL SECURITY.
-- The API must connect as this role so `tenant_isolation` policies apply.
--
-- Dev password is fixed for local use only; rotate it per environment before
-- deploying (see apps/api/errors.md E-002). Additive migration: never edit.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'codebeast_app') THEN
    CREATE ROLE codebeast_app
      LOGIN
      PASSWORD 'codebeast_app'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO codebeast_app', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO codebeast_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO codebeast_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO codebeast_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO codebeast_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO codebeast_app;
