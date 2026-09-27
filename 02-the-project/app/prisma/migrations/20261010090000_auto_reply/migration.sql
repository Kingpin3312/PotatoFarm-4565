-- The owner's switch for replies the assistant sends by itself while a
-- buyer is being qualified. Off unless the owner turns it on.
ALTER TABLE "AssistantSettings" ADD COLUMN "autoReply" BOOLEAN NOT NULL DEFAULT false;
