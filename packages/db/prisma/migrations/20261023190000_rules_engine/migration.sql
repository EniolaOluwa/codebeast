-- Phase 8 rules engine: detection + automation rules per tenant.

-- CreateEnum
CREATE TYPE "RuleKind" AS ENUM ('DETECTION', 'AUTOMATION');

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "RuleKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rule_tenantId_kind_idx" ON "Rule"("tenantId", "kind");

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row Level Security (ADR-002/ADR-009): standard tenant isolation.
ALTER TABLE "Rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Rule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Rule"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "Rule" TO codebeast_app;
