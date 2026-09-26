-- One person, several pieces of business (the audit's B5). Additive: a new
-- enum and a new table. The lead keeps its own status and stage as the
-- person's main business, so every existing screen, report and job reads
-- exactly what it read before; an Opportunity is each further one — the
-- buyer who is also letting their villa.

CREATE TYPE "OpportunityKind" AS ENUM ('BUY', 'SELL', 'RENT', 'LET');

CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" "OpportunityKind" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "stageId" TEXT,
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentId" TEXT,
    "listingId" TEXT,
    "valueFils" BIGINT,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Opportunity_orgId_leadId_idx" ON "Opportunity"("orgId", "leadId");
CREATE INDEX "Opportunity_orgId_stageId_idx" ON "Opportunity"("orgId", "stageId");
CREATE INDEX "Opportunity_orgId_agentId_idx" ON "Opportunity"("orgId", "agentId");

ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security: a table added after init is not covered by the
-- init loop. See 20260905124141_deal_payments.
ALTER TABLE "Opportunity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Opportunity" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Opportunity";
CREATE POLICY tenant_isolation ON "Opportunity"
  USING ("orgId" = current_setting('app.current_org', true))
  WITH CHECK ("orgId" = current_setting('app.current_org', true));
