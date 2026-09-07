-- Somewhere to put a token.
--
-- `readSecret` read `process.env["SECRET_" + ref]` and threw otherwise,
-- and nothing anywhere could write one. So connecting a brokerage's
-- WhatsApp number meant an owner reading a reference off a settings
-- screen, someone setting an environment variable, and a redeploy —
-- per brokerage, per channel. A mailbox token had nowhere to go at all,
-- which is why `EmailAccount` has never had a row and `email.sync` has
-- swept an empty list every half hour since it was written.
--
-- What is stored is ciphertext. `lib/secrets.ts` has always said tokens
-- never go into Postgres because a database dump is the likeliest thing
-- to leak; that rule is intact, because a dump without SECRETS_KEY is a
-- column of noise.

CREATE TABLE "Secret" (
  "id"         TEXT NOT NULL,
  "orgId"      TEXT NOT NULL,
  "ref"        TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "iv"         TEXT NOT NULL,
  "tag"        TEXT NOT NULL,
  "keyVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  "rotatedAt"  TIMESTAMP(3),
  CONSTRAINT "Secret_pkey" PRIMARY KEY ("id")
);

-- The reader is handed a ref and nothing else, so it has to be unique
-- across every tenant rather than within one.
CREATE UNIQUE INDEX "Secret_ref_key" ON "Secret"("ref");
CREATE INDEX "Secret_orgId_idx" ON "Secret"("orgId");

-- Row-level security, the same as every other tenant-owned table. The
-- init migration applies the policy by looping over tables that have an
-- "orgId" column, and that loop has already run, so this one is applied
-- here explicitly.
ALTER TABLE "Secret" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Secret" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Secret";
CREATE POLICY tenant_isolation ON "Secret"
  USING ("orgId" = current_setting('app.current_org', true))
  WITH CHECK ("orgId" = current_setting('app.current_org', true));
