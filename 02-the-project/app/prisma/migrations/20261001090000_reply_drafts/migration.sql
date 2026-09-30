-- Replies the assistant drafts and a person sends.
--
-- The assistant never sends by itself: it writes a reply the moment a
-- buyer writes in, and an agent reads, edits if they like, and presses
-- send. The state each draft ends in is the evidence for ever letting it
-- send unattended.
CREATE TYPE "DraftState" AS ENUM ('OPEN', 'SENT', 'EDITED', 'DISCARDED', 'STALE');

CREATE TABLE "ReplyDraft" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "inboundMessageId" TEXT,
    "body" TEXT NOT NULL,
    "state" "DraftState" NOT NULL DEFAULT 'OPEN',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "messageId" TEXT,

    CONSTRAINT "ReplyDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReplyDraft_orgId_state_createdAt_idx" ON "ReplyDraft"("orgId", "state", "createdAt");
CREATE INDEX "ReplyDraft_conversationId_state_idx" ON "ReplyDraft"("conversationId", "state");

ALTER TABLE "ReplyDraft" ADD CONSTRAINT "ReplyDraft_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A tenant table: the same policy as every other, applied to its owner too.
ALTER TABLE "ReplyDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReplyDraft" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ReplyDraft";
CREATE POLICY tenant_isolation ON "ReplyDraft"
  USING ("orgId" = current_setting('app.current_org', true))
  WITH CHECK ("orgId" = current_setting('app.current_org', true));
