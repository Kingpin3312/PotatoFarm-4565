-- Potato CRM — row-level security
--
-- This file is the actual tenant boundary. Everything above it in the
-- stack is convenience.
--
-- The argument for doing it here rather than in application code: a
-- `where orgId` clause is one forgotten line away from serving one
-- brokerage another brokerage's client list, and that mistake looks
-- exactly like working code in review. With RLS on, a query that forgets
-- the clause returns nothing instead of returning everything.
--
-- ---------------------------------------------------------------------
-- WHY THIS FILE IS NOW GENERATED FROM THE SCHEMA
-- ---------------------------------------------------------------------
--
-- It used to name twelve tables in a hand-written list. The schema has
-- **fifty-nine tables carrying `orgId`**. The other forty-seven had no
-- row-level security of any kind, and they are not the unimportant ones:
--
--   KycRecord, KycDocument, Screening, UltimateBeneficialOwner,
--   ComplianceReport   — every AML record in the product
--   Deal, Offer, OfferResponse, Commission, CommissionSplit — the money
--   BlackbookEntry     — an agent's private contacts
--   EmailMessage, EmailAccount, Attachment, Document
--   Invoice, Subscription, SeatEvent
--
-- The promise on the security page is that tenant isolation is enforced
-- by the database. For those forty-seven tables it was enforced by
-- remembering to write `where orgId`, which is exactly the thing this
-- file exists because nobody can be relied on to do.
--
-- A hand-maintained list of tables in a product that adds models will
-- drift, and it drifted from twelve to fifty-nine without anybody
-- noticing. So the policy is applied by asking the catalogue which
-- tables have an `orgId` column. A new model is protected the moment it
-- is migrated, and forgetting to add it to a list is no longer a
-- mistake that can be made.
--
-- ---------------------------------------------------------------------
-- THE ROLES THIS ASSUMES
-- ---------------------------------------------------------------------
--
-- `potato_app` owns nothing and has no BYPASSRLS, so every policy below
-- applies to it. `forOrg()` sets `app.current_org` inside the
-- transaction and the query is scoped by the database rather than by
-- the caller's diligence.
--
-- **The scheduled jobs and the webhooks are a different case and are not
-- solved by this file.** `crossTenant()` deliberately queries across
-- brokerages — a nightly sweep is meant to. Under these policies a
-- connection that has not set `app.current_org` sees nothing at all,
-- which is the correct default and also means those paths need a role
-- with BYPASSRLS and a second connection string. The application has one
-- `DATABASE_URL` today, so that separation is still to be made. Written
-- down here rather than discovered when the first sweep silently
-- processes zero rows.

-- ---------------------------------------------------------------- roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'potato_app') THEN
    CREATE ROLE potato_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO potato_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO potato_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO potato_app;

-- New tables and sequences from later migrations, without having to
-- remember to re-run the grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO potato_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO potato_app;

-- The audit log is append only, for everyone, including us.
REVOKE UPDATE, DELETE ON "AuditLog" FROM potato_app;

-- --------------------------------------------------------------- policy
-- Every request sets app.current_org for the life of the transaction.
-- See src/server/db/client.ts — it is set inside the same transaction as
-- the query, never on a pooled connection that another request could
-- inherit.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name  = 'orgId'
       AND tb.table_type  = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    -- FORCE applies the policy to the table owner too. Without it, anyone
    -- connecting as owner silently sees everything.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING ("orgId" = current_setting('app.current_org', true))
        WITH CHECK ("orgId" = current_setting('app.current_org', true));
    $f$, t);
  END LOOP;
END $$;

-- Organisation is the one table keyed by id rather than orgId.
ALTER TABLE "Organisation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organisation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Organisation";
CREATE POLICY tenant_isolation ON "Organisation"
  USING (id = current_setting('app.current_org', true));

-- Users are global — an agent moving between agencies keeps one login.
-- Access to a user's data is gated by Membership, which is policed above.
--
-- The NextAuth tables are global for the same reason: sign-in happens
-- before any brokerage is known, so a session cannot be tenant-scoped.

-- ------------------------------------------------------------ soft delete
-- Deleted rows stay readable for the retention window and are removed by
-- a scheduled job, so "delete my data" is answerable with a date rather
-- than a shrug.
CREATE INDEX IF NOT EXISTS lead_deleted_idx    ON "Lead" ("orgId", "deletedAt");
CREATE INDEX IF NOT EXISTS listing_deleted_idx ON "Listing" ("orgId", "deletedAt");

-- ---------------------------------------------------------------
-- A conversation is with exactly one party.
--
-- The constraint that stood here read:
--
--   CHECK (("leadId" IS NULL) <> ("vendorId" IS NULL))
--
-- and it could never have been applied, because **`Conversation` has no
-- `vendorId` column**. `leadId` is still `String @unique` and required.
--
-- That is not a typo in this file, it is a schema change that was
-- designed, written up in CLAUDE.md as done, and never made. Offer,
-- EmailMessage, BlackbookEntry, AgentRequest and FollowUp all carry a
-- `vendorId`; Conversation is the one that was missed — which means the
-- seller side of every deal is still, in CLAUDE.md's own words, half of
-- an agent's talking happening outside the system.
--
-- Reinstating the constraint needs the column, the relation, `leadId`
-- made optional, and the seventeen places that read `conversation.lead`
-- taught to handle its absence. That is a piece of work in its own right
-- and doing it badly, in passing, would be worse than leaving it
-- visible. The constraint returns with the column.
-- ---------------------------------------------------------------
