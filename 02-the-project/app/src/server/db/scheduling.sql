-- Double booking, prevented properly.
--
-- The obvious implementation is: query for a clash, and if there isn't
-- one, insert. That is a race. Two agents — or the assistant and an agent
-- — can both read "free" before either writes, and both bookings land.
-- It happens rarely enough in testing to look fine and often enough in
-- production to embarrass somebody in front of a buyer.
--
-- Postgres can enforce it instead. An exclusion constraint refuses any
-- row whose time range overlaps an existing one for the same agent, at
-- the point of insert, under concurrency, with no application logic.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- The range is derived, so it can never disagree with the columns it
-- comes from — which is the usual failure when a start and an end are
-- maintained separately.
ALTER TABLE "Viewing"
  ADD COLUMN IF NOT EXISTS timespan tstzrange
  GENERATED ALWAYS AS (
    tstzrange("scheduledAt",
              "scheduledAt" + ("durationMins" || ' minutes')::interval,
              '[)')
  ) STORED;

-- Only live bookings block a slot. A cancelled or no-show viewing must
-- not keep an agent's diary blocked.
ALTER TABLE "Viewing"
  ADD CONSTRAINT viewing_no_double_booking
  EXCLUDE USING gist (
    "agentId" WITH =,
    timespan  WITH &&
  )
  WHERE (status IN ('SCHEDULED', 'CONFIRMED') AND "agentId" IS NOT NULL);

-- Held-but-unconfirmed slots expire. Without this, an assistant that
-- offers three slots and gets no reply blocks a diary for a week.
CREATE INDEX IF NOT EXISTS viewing_held_idx
  ON "Viewing" ("orgId", "heldUntil")
  WHERE "heldUntil" IS NOT NULL;

-- Reminder sweeps read this constantly.
CREATE INDEX IF NOT EXISTS viewing_reminder_idx
  ON "Viewing" ("scheduledAt")
  WHERE status IN ('SCHEDULED', 'CONFIRMED') AND "remindedLeadAt" IS NULL;
