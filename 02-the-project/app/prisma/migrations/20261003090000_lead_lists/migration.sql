-- The leads list: tags, archive, saved views. Additive only — two
-- nullable/defaulted columns and a new table; no existing row changes.
--
-- Written by hand and applied with `migrate deploy`, not generated: the
-- generator proposes dropping the raw-SQL trigram indexes every time.

ALTER TABLE "Lead" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Lead" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Lead_tags_idx" ON "Lead" USING GIN ("tags");

CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "screen" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedView_orgId_screen_userId_idx" ON "SavedView"("orgId", "screen", "userId");

-- Row-level security: a table added after init is not covered by the
-- init loop. See 20260905124141_deal_payments for the full account.
ALTER TABLE "SavedView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedView" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SavedView";
CREATE POLICY tenant_isolation ON "SavedView"
  USING ("orgId" = current_setting('app.current_org', true))
  WITH CHECK ("orgId" = current_setting('app.current_org', true));

