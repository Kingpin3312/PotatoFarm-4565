-- Which viewing a follow-up asks about, so recording the buyer's answer
-- closes the task that asked for it. Additive and nullable: every
-- existing follow-up keeps working exactly as before.
ALTER TABLE "FollowUp" ADD COLUMN "viewingId" TEXT;

CREATE INDEX "FollowUp_viewingId_idx" ON "FollowUp"("viewingId");
