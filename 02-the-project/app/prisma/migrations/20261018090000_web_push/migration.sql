-- Web push: alerts to the installed web app, on any phone.
--
-- Additive only. One new device platform, and four nullable columns on
-- PushDevice that only a browser subscription fills in: the two keys its
-- payloads are encrypted to, the sign-in session it belongs to, and a
-- label the agent recognises ("iPhone", "Android", "Mac"). Expo rows,
-- of which there have never been any, are untouched.

ALTER TYPE "DevicePlatform" ADD VALUE IF NOT EXISTS 'WEB';

ALTER TABLE "PushDevice"
  ADD COLUMN "p256dh"    TEXT,
  ADD COLUMN "auth"      TEXT,
  ADD COLUMN "sessionId" TEXT,
  ADD COLUMN "label"     TEXT;

CREATE INDEX "PushDevice_sessionId_idx" ON "PushDevice"("sessionId");
