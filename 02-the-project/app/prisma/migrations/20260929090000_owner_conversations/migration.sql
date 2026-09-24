-- A conversation is with a buyer or with a property owner.
--
-- `Conversation.leadId` was required and unique, so every WhatsApp
-- message an agent exchanged with an owner happened outside the product:
-- no thread, no reply window, no history when a colleague took the
-- listing over. CLAUDE.md described this as done and rls.sql carried a
-- constraint for a column that did not exist.
--
-- Nothing is removed. `leadId` becomes optional (every existing row keeps
-- its value), `vendorId` is added, and the constraint that each row has
-- exactly one of them is the one rls.sql could never apply.
ALTER TABLE "Conversation" ALTER COLUMN "leadId" DROP NOT NULL;
ALTER TABLE "Conversation" ADD COLUMN "vendorId" TEXT;

CREATE UNIQUE INDEX "Conversation_vendorId_key" ON "Conversation"("vendorId");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_one_party"
  CHECK (("leadId" IS NULL) <> ("vendorId" IS NULL));
