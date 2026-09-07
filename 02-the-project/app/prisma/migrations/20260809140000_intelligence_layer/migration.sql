-- CreateEnum
CREATE TYPE "ClientFactKind" AS ENUM ('MOTIVATION', 'OBJECTION', 'CIRCUMSTANCE', 'PREFERENCE', 'COMMUNICATION', 'KEY_DATE', 'BUYING_SIGNAL', 'SELLING_SIGNAL', 'LOSS_REASON', 'OTHER');

-- CreateEnum
CREATE TYPE "ClientFactSource" AS ENUM ('AGENT', 'CLIENT', 'EXTRACTED', 'INFERRED');

-- CreateEnum
CREATE TYPE "NextAction" AS ENUM ('CALL', 'SEND_PROPERTY', 'FOLLOW_UP', 'REQUEST_DOCUMENTS', 'PREPARE_CMA', 'BOOK_VIEWING', 'ASK_FOR_LISTING', 'REACTIVATE', 'INTRODUCE_FINANCE', 'NEGOTIATE', 'RECORD_OUTCOME');

-- CreateEnum
CREATE TYPE "RecommendationState" AS ENUM ('OPEN', 'ACTED', 'DISMISSED', 'STALE');

-- CreateEnum
CREATE TYPE "AutonomyLevel" AS ENUM ('SUGGEST', 'DRAFT', 'CONFIRM', 'EXECUTE');

-- CreateEnum
CREATE TYPE "AiActionOutcome" AS ENUM ('PENDING', 'DONE', 'REJECTED', 'FAILED', 'REFUSED');

-- CreateTable
CREATE TABLE "ClientFact" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT,
    "vendorId" TEXT,
    "blackbookEntryId" TEXT,
    "kind" "ClientFactKind" NOT NULL,
    "body" TEXT NOT NULL,
    "source" "ClientFactSource" NOT NULL DEFAULT 'AGENT',
    "confidence" DOUBLE PRECISION,
    "originRequestId" TEXT,
    "statedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "retractedAt" TIMESTAMP(3),
    "retractedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "leadId" TEXT,
    "vendorId" TEXT,
    "listingId" TEXT,
    "dealId" TEXT,
    "action" "NextAction" NOT NULL,
    "headline" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" DOUBLE PRECISION NOT NULL,
    "valueFils" BIGINT,
    "autonomy" "AutonomyLevel" NOT NULL DEFAULT 'SUGGEST',
    "state" "RecommendationState" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "dismissReason" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadScoreEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "recency" INTEGER NOT NULL,
    "engagement" INTEGER NOT NULL,
    "intent" INTEGER NOT NULL,
    "budgetFit" INTEGER NOT NULL,
    "drivers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadScoreEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAction" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "agentId" TEXT,
    "request" TEXT,
    "interpretation" TEXT,
    "origin" TEXT NOT NULL,
    "action" "NextAction",
    "entity" TEXT,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "autonomy" "AutonomyLevel" NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "outcome" "AiActionOutcome" NOT NULL,
    "error" TEXT,
    "undoneAt" TIMESTAMP(3),
    "undoneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientFact_orgId_leadId_retractedAt_idx" ON "ClientFact"("orgId", "leadId", "retractedAt");

-- CreateIndex
CREATE INDEX "ClientFact_orgId_vendorId_retractedAt_idx" ON "ClientFact"("orgId", "vendorId", "retractedAt");

-- CreateIndex
CREATE INDEX "ClientFact_orgId_blackbookEntryId_retractedAt_idx" ON "ClientFact"("orgId", "blackbookEntryId", "retractedAt");

-- CreateIndex
CREATE INDEX "ClientFact_orgId_kind_idx" ON "ClientFact"("orgId", "kind");

-- CreateIndex
CREATE INDEX "Recommendation_orgId_agentId_state_priority_idx" ON "Recommendation"("orgId", "agentId", "state", "priority");

-- CreateIndex
CREATE INDEX "Recommendation_orgId_state_computedAt_idx" ON "Recommendation"("orgId", "state", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_orgId_agentId_leadId_action_key" ON "Recommendation"("orgId", "agentId", "leadId", "action");

-- CreateIndex
CREATE INDEX "LeadScoreEvent_orgId_leadId_computedAt_idx" ON "LeadScoreEvent"("orgId", "leadId", "computedAt");

-- CreateIndex
CREATE INDEX "LeadScoreEvent_orgId_computedAt_idx" ON "LeadScoreEvent"("orgId", "computedAt");

-- CreateIndex
CREATE INDEX "AiAction_orgId_createdAt_idx" ON "AiAction"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AiAction_orgId_agentId_createdAt_idx" ON "AiAction"("orgId", "agentId", "createdAt");

-- CreateIndex
CREATE INDEX "AiAction_orgId_entity_entityId_idx" ON "AiAction"("orgId", "entity", "entityId");

-- AddForeignKey
ALTER TABLE "ClientFact" ADD CONSTRAINT "ClientFact_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScoreEvent" ADD CONSTRAINT "LeadScoreEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAction" ADD CONSTRAINT "AiAction_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------
-- Row-level security for the four new tables.
--
-- The block in the init migration discovers tenant tables from
-- information_schema rather than a hand-written list, which is why it
-- covers 59 tables instead of the 12 it started with. But it ran once,
-- at init, when these four did not exist — so a table added later is
-- outside the tenant boundary until this runs again.
--
-- **That is the failure worth naming.** It does not error. A brokerage
-- reads another brokerage's client facts and recommendations, and the
-- application looks like it is working. Any migration that adds a table
-- with an `orgId` must end with this block. It is idempotent by
-- construction, so re-running it over the existing 59 is free.
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name  = 'orgId'
       AND tb.table_type  = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING ("orgId" = current_setting('app.current_org', true))
        WITH CHECK ("orgId" = current_setting('app.current_org', true));
    $f$, t);
  END LOOP;
END $$;

-- The application role needs the new tables. Default privileges cover
-- anything created by the owner from here on, but these were created by
-- this migration, so they are granted explicitly.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON "ClientFact", "Recommendation", "LeadScoreEvent", "AiAction"
  TO potato_app;

-- ---------------------------------------------------------------------
-- A fact, and a recommendation, must be about exactly one thing.
--
-- Prisma cannot express "exactly one of these nullable columns is set",
-- so without this a row can belong to nobody — invisible in every list,
-- reachable from nothing, and counted in every total. That is the same
-- shape as the Conversation constraint noted in rls.sql, which was
-- written up as done and never applied.
--
-- `num_nonnulls` is the honest way to say it; a chain of `<>` on IS NULL
-- only works for two columns and quietly does the wrong thing for three.
-- ---------------------------------------------------------------------
ALTER TABLE "ClientFact"
  ADD CONSTRAINT client_fact_one_subject
  CHECK (num_nonnulls("leadId", "vendorId", "blackbookEntryId") = 1);

ALTER TABLE "Recommendation"
  ADD CONSTRAINT recommendation_one_subject
  CHECK (num_nonnulls("leadId", "vendorId", "listingId", "dealId") = 1);

-- A score is a number out of a hundred. Storing 4,200 because a weight
-- was added twice is the kind of thing that is obvious in a chart and
-- invisible in a row.
ALTER TABLE "LeadScoreEvent"
  ADD CONSTRAINT lead_score_range CHECK (score BETWEEN 0 AND 100);
