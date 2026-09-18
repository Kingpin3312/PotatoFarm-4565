-- Payments on a transaction, so the Real Estate Activity Report can be
-- assessed at all.
--
-- ## Eight DROP INDEX statements were removed from this file
--
-- `prisma migrate dev` generated it with drops for `ClientFact_body_trgm`,
-- `Lead_email_trgm`, `Lead_name_trgm`, `Lead_notes_trgm`,
-- `Lead_org_status_stage_idx`, `Listing_reference_trgm`,
-- `Listing_title_trgm` and `Vendor_name_trgm`.
--
-- Those are the trigram indexes search depends on. They are created in
-- raw SQL because Prisma cannot express a GIN trigram index, so Prisma
-- does not know they are meant to exist and proposes dropping them on
-- every migration. This is the **third** time it has done so, which is
-- why `04-audit-scripts/migrations.py` fails the build when a migration
-- drops an index nothing re-creates. Read a generated migration before
-- applying it; this file is the reason.

-- CreateEnum
CREATE TYPE "DealPaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'CHEQUE', 'VIRTUAL_ASSET');

-- CreateTable
CREATE TABLE "DealPayment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "amountFils" BIGINT NOT NULL,
    "method" "DealPaymentMethod" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealPayment_orgId_dealId_receivedAt_idx" ON "DealPayment"("orgId", "dealId", "receivedAt");

-- AddForeignKey
ALTER TABLE "DealPayment" ADD CONSTRAINT "DealPayment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Row-level security, which Prisma does not generate and the init
-- migration cannot reach.
--
-- The init migration loops over every table carrying an `orgId` and
-- enables, forces and policies each one — but that loop ran once, at
-- init. A table added afterwards is not covered by it. Without these
-- four statements one brokerage reads another's payment records, out of
-- the table holding the most sensitive money data in the product.
--
-- FORCE matters as much as ENABLE: without it the policy does not apply
-- to the table's owner, and the migration role is the owner.
--
-- `check:tenancy` now asserts this for every table with an `orgId`
-- rather than for a list of table names, so a future model that forgets
-- these lines fails the build instead of leaking quietly.
-- ---------------------------------------------------------------------
ALTER TABLE "DealPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealPayment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DealPayment";
CREATE POLICY tenant_isolation ON "DealPayment"
  USING ("orgId" = current_setting('app.current_org', true))
  WITH CHECK ("orgId" = current_setting('app.current_org', true));
