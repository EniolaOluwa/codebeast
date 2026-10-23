-- Jira destination (M5.5): tickets created from reports, plus the TICKETED
-- issue status used when a ticket exists but no PR has been opened yet.

ALTER TYPE "IssueStatus" ADD VALUE IF NOT EXISTS 'TICKETED';

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_issueId_key" ON "Ticket"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_tenantId_key_key" ON "Ticket"("tenantId", "key");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_idx" ON "Ticket"("tenantId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row Level Security (ADR-002/ADR-009): standard tenant isolation.
ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ticket" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Ticket"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));

-- New tables need their own grants (the initial GRANT covered tables at the
-- time it ran).
GRANT SELECT, INSERT, UPDATE, DELETE ON "Ticket" TO codebeast_app;
