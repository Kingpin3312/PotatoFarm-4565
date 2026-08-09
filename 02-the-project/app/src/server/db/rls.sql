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
-- The application connects as a role that does NOT own these tables and
-- does NOT have BYPASSRLS. Migrations run as a separate owner role.

-- ---------------------------------------------------------------- roles
CREATE ROLE potato_app NOLOGIN;
GRANT USAGE ON SCHEMA public TO potato_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO potato_app;

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
  FOREACH t IN ARRAY ARRAY[
    'Membership','Invitation','Lead','Conversation','Message','Channel',
    'Listing','Enquiry','Viewing','QualificationProfile','Answer','AuditLog'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    -- FORCE applies the policy to the table owner too. Without it, anyone
    -- connecting as owner silently sees everything.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);

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
CREATE POLICY tenant_isolation ON "Organisation"
  USING (id = current_setting('app.current_org', true));

-- Users are global — an agent moving between agencies keeps one login.
-- Access to a user's data is gated by Membership, which is policed above.

-- ------------------------------------------------------------ soft delete
-- Deleted rows stay readable for the retention window and are removed by
-- a scheduled job, so "delete my data" is answerable with a date rather
-- than a shrug.
CREATE INDEX IF NOT EXISTS lead_deleted_idx    ON "Lead" ("orgId", "deletedAt");
CREATE INDEX IF NOT EXISTS listing_deleted_idx ON "Listing" ("orgId", "deletedAt");

-- ---------------------------------------------------------------
-- A conversation is with exactly one party.
--
-- Prisma cannot express "one of these two columns, never both, never
-- neither". Without it, a bad insert creates a conversation belonging
-- to nobody — which is invisible in every list and impossible to reach.
-- ---------------------------------------------------------------
ALTER TABLE "Conversation"
  ADD CONSTRAINT conversation_one_party
  CHECK (("leadId" IS NULL) <> ("vendorId" IS NULL));
