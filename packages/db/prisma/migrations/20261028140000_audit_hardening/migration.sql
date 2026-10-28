-- Phase 9 hardening: AuditLog.userAgent + SECURITY DEFINER maintenance helpers.
-- The helpers let codebeast_app list stalled runs and purge expired raw
-- payloads across tenants without bypassing RLS on ordinary queries.

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "userAgent" TEXT;

-- Stalled-run listing (read-only). Returns runs stuck in an active stage whose
-- updatedAt is older than the cutoff. Owned by the migration role so RLS is
-- bypassed inside the function body only.
CREATE OR REPLACE FUNCTION codebeast_stalled_runs(
  p_cutoff TIMESTAMPTZ,
  p_max INT DEFAULT 100
)
RETURNS TABLE (
  id TEXT,
  "tenantId" TEXT,
  status "RunStatus",
  attempt INT,
  "maxAttempts" INT,
  "updatedAt" TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r."tenantId", r.status, r.attempt, r."maxAttempts", r."updatedAt"
  FROM "Run" r
  WHERE r.status IN ('QUEUED', 'PLANNING', 'CODING', 'VALIDATING')
    AND r."updatedAt" < p_cutoff
  ORDER BY r."updatedAt" ASC
  LIMIT GREATEST(p_max, 0);
$$;

REVOKE ALL ON FUNCTION codebeast_stalled_runs(TIMESTAMPTZ, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION codebeast_stalled_runs(TIMESTAMPTZ, INT) TO codebeast_app;

-- Null expired raw webhook payloads in batches. Keeps the row (idempotency key
-- + hash) and works for rows with tenantId NULL.
CREATE OR REPLACE FUNCTION codebeast_purge_raw_payloads(
  p_now TIMESTAMPTZ,
  p_max INT DEFAULT 1000
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INT;
BEGIN
  WITH doomed AS (
    SELECT w.id
    FROM "WebhookEvent" w
    WHERE w."rawPayload" IS NOT NULL
      AND w."rawPayloadExpiresAt" IS NOT NULL
      AND w."rawPayloadExpiresAt" < p_now
    ORDER BY w."rawPayloadExpiresAt" ASC
    LIMIT GREATEST(p_max, 0)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE "WebhookEvent" w
  SET "rawPayload" = NULL
  FROM doomed
  WHERE w.id = doomed.id;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION codebeast_purge_raw_payloads(TIMESTAMPTZ, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION codebeast_purge_raw_payloads(TIMESTAMPTZ, INT) TO codebeast_app;
