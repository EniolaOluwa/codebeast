-- Grow the RefreshToken policy with the user claim so a detected token reuse
-- can revoke the user's whole refresh-token family (ADR-009). The hash claim
-- remains for pre-tenant lookups; WITH CHECK still requires the acting tenant.
DROP POLICY "tenant_isolation" ON "RefreshToken";

CREATE POLICY "tenant_isolation" ON "RefreshToken"
  USING (
    "tenantId" = current_setting('app.current_tenant', true)
    OR "tokenHash" = current_setting('app.current_refresh_token_hash', true)
    OR "userId" = current_setting('app.current_user', true)
  )
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));
