-- Tasks a person writes and hands to a colleague (the audit's C7).
-- Additive: two nullable columns and an index; no row changes.
ALTER TABLE "FollowUp" ADD COLUMN "createdById" TEXT, ADD COLUMN "listingId" TEXT;
CREATE INDEX "FollowUp_orgId_createdById_completedAt_idx" ON "FollowUp"("orgId", "createdById", "completedAt");
