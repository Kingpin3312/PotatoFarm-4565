-- Real free times offered to a buyer, and the one they picked.
--
-- The assistant used to say "an agent will confirm the time" and offer
-- none. Now it offers up to three of the agent's actual free slots
-- (working hours, the diary, the agent's own calendar); the buyer's pick
-- holds that slot as a viewing request, and nothing is booked until the
-- agent confirms it. The owner's decision: the agent always confirms.
--
-- Additive: a new table, and one nullable column on Viewing marking a
-- hold as a buyer's request waiting for the agent rather than an agent's
-- own fifteen-minute hold — so a lapsed request is never silently
-- deleted the way an unused hold is.

CREATE TABLE "ViewingOffer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "listingId" TEXT,
    "agentId" TEXT NOT NULL,
    "slots" TIMESTAMP(3)[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "viewingId" TEXT,

    CONSTRAINT "ViewingOffer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ViewingOffer_orgId_conversationId_closedAt_idx" ON "ViewingOffer"("orgId", "conversationId", "closedAt");

ALTER TABLE "ViewingOffer" ADD CONSTRAINT "ViewingOffer_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ViewingOffer" ADD CONSTRAINT "ViewingOffer_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Viewing" ADD COLUMN "requestedAt" TIMESTAMP(3);

ALTER TABLE "ViewingOffer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ViewingOffer" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ViewingOffer";
CREATE POLICY tenant_isolation ON "ViewingOffer"
  USING ("orgId" = current_setting('app.current_org', true))
  WITH CHECK ("orgId" = current_setting('app.current_org', true));
