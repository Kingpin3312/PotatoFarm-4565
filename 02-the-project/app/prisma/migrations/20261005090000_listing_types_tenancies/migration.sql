-- Off-plan, property types, rental terms, and leases (the audit's B5).
--
-- Additive only: three enums, nullable or defaulted columns, one new
-- table. Every existing listing becomes READY, which is what every one
-- of them was implicitly; nothing else changes value.

CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'VILLA', 'TOWNHOUSE', 'PENTHOUSE', 'DUPLEX', 'PLOT', 'OFFICE', 'RETAIL', 'WAREHOUSE', 'OTHER');
CREATE TYPE "Completion" AS ENUM ('READY', 'OFF_PLAN');
CREATE TYPE "Furnishing" AS ENUM ('UNFURNISHED', 'SEMI_FURNISHED', 'FURNISHED');

ALTER TABLE "Listing"
  ADD COLUMN "propertyType" "PropertyType",
  ADD COLUMN "completion" "Completion" NOT NULL DEFAULT 'READY',
  ADD COLUMN "handoverAt" TIMESTAMP(3),
  ADD COLUMN "developer" TEXT,
  ADD COLUMN "project" TEXT,
  ADD COLUMN "paymentPlan" TEXT,
  ADD COLUMN "unitNumber" TEXT,
  ADD COLUMN "furnishing" "Furnishing",
  ADD COLUMN "rentCheques" INTEGER,
  ADD COLUMN "depositFils" BIGINT,
  ADD COLUMN "serviceChargeFils" BIGINT;

ALTER TABLE "Requirement"
  ADD COLUMN "propertyTypes" "PropertyType"[] DEFAULT ARRAY[]::"PropertyType"[],
  ADD COLUMN "completion" "Completion";

CREATE TABLE "Tenancy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "leadId" TEXT,
    "tenantName" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "rentFils" BIGINT NOT NULL,
    "cheques" INTEGER,
    "depositFils" BIGINT,
    "ejariNumber" TEXT,
    "agentId" TEXT,
    "renewalTaskAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tenancy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Tenancy_orgId_endsAt_idx" ON "Tenancy"("orgId", "endsAt");
CREATE INDEX "Tenancy_orgId_listingId_idx" ON "Tenancy"("orgId", "listingId");
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security: a table added after init is not covered by the
-- init loop. See 20260905124141_deal_payments.
ALTER TABLE "Tenancy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenancy" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Tenancy";
CREATE POLICY tenant_isolation ON "Tenancy"
  USING ("orgId" = current_setting('app.current_org', true))
  WITH CHECK ("orgId" = current_setting('app.current_org', true));
