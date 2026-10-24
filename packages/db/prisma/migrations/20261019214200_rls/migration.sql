-- Row-Level Security for tenant-scoped tables (root AGENTS.md §4).
--
-- Enforcement model:
--   * The application sets `app.current_tenant` per transaction via
--     PrismaService.withTenant().
--   * Policies compare the table's tenant column to that GUC.
--   * NOTE: superusers and table owners BYPASS RLS unless FORCE is set; the
--     production app role must be a non-superuser with BYPASSRLS disabled.
--     See apps/api/errors.md E-002.
--
-- Additive-only: never edit this file after it ships; add a new migration.

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'Membership',
    'ApiKey',
    'RefreshToken',
    'Repository',
    'Integration',
    'GitHubInstallation',
    'SlackWorkspace',
    'WebhookEvent',
    'Issue',
    'IssueSignal',
    'Run',
    'Plan',
    'Patch',
    'FileChange',
    'ValidationRun',
    'PullRequest',
    'AuditLog'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("tenantId" = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK ("tenantId" = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)',
      t
    );
  END LOOP;
END $$;

-- Tenant is scoped by its own primary key.
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Tenant"
  USING ("id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK ("id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
