-- Search that stays fast as the book grows.
--
-- Measured, not guessed. `npm run check:load` builds a real brokerage
-- and times the queries an agent waits on:
--
--     5,000 leads   full-sentence search   104ms warm
--    20,000 leads   full-sentence search   350ms warm, 3,649ms first
--
-- Warm was always fine. The first execution was not, and it is the one
-- that matters: the first agent to search each morning waited three and
-- a half seconds, on a screen whose whole promise is that it answers
-- faster than scrolling.
--
-- The cause is `contains` with `mode: insensitive`, which compiles to
-- ILIKE '%term%'. A btree index cannot serve a leading wildcard, so
-- every search read all of Lead, all of ClientFact and all of Listing
-- from disk. `run.ts` already named this as the upgrade path — "a
-- pg_trgm index behind the same call, not a rewrite of the caller" —
-- and the measurement says now.
--
-- Trigram GIN indexes make ILIKE '%x%' index-scannable. No application
-- code changes: the same Prisma query planner-switches onto them.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- The three columns the people search reads.
CREATE INDEX IF NOT EXISTS "Lead_name_trgm"
  ON "Lead" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Lead_notes_trgm"
  ON "Lead" USING gin ("notes" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Lead_email_trgm"
  ON "Lead" USING gin ("email" gin_trgm_ops);

-- Remembered facts. The half of search that is not a column, and the
-- largest text table after messages.
CREATE INDEX IF NOT EXISTS "ClientFact_body_trgm"
  ON "ClientFact" USING gin ("body" gin_trgm_ops);

-- Properties.
CREATE INDEX IF NOT EXISTS "Listing_title_trgm"
  ON "Listing" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Listing_reference_trgm"
  ON "Listing" USING gin ("reference" gin_trgm_ops);

-- Owners.
CREATE INDEX IF NOT EXISTS "Vendor_name_trgm"
  ON "Vendor" USING gin ("name" gin_trgm_ops);

-- The pipeline's own query filters on status and orders by
-- stageEnteredAt. There are separate indexes for each, so Postgres
-- picks one and sorts the rest; this covers both in one.
CREATE INDEX IF NOT EXISTS "Lead_org_status_stage_idx"
  ON "Lead" ("orgId", "status", "stageEnteredAt" DESC);
