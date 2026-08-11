-- The agent's calendar feed token.
--
-- Nullable, because a feed is opt-in: a token only exists once somebody
-- has asked for one. Unique, because the token is the whole credential —
-- the route looks a membership up by it and nothing else.
--
-- No default. Generating one for every existing membership would mint a
-- live secret for people who never asked for it, and a capability URL
-- that exists is a capability URL that can leak.
ALTER TABLE "Membership"
  ADD COLUMN IF NOT EXISTS "calendarToken"      TEXT,
  ADD COLUMN IF NOT EXISTS "calendarTokenAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "calendarLastReadAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Membership_calendarToken_key"
  ON "Membership"("calendarToken");
