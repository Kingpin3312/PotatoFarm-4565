-- Automatic replies only while the brokerage is closed. Meaningful only
-- when "autoReply" is on; off by default, so nothing changes for anybody
-- until an owner chooses it.
ALTER TABLE "AssistantSettings" ADD COLUMN "autoReplyOutOfHours" BOOLEAN NOT NULL DEFAULT false;
