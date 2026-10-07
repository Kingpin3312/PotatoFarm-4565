-- Agent microsites: every agent's own website, built from the CRM.
--
-- Additive only. Two new tables (the site, and what visitors did on it),
-- four brokerage settings with defaults, one nullable column on Enquiry
-- recording which microsite an enquiry came through, one nullable column
-- on Channel for the WhatsApp number buyers message, and one new lead
-- source. Nothing existing is changed or dropped.

ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'AGENT_MICROSITE';

CREATE TYPE "MicrositeEventKind" AS ENUM ('VIEW', 'PROPERTY_VIEW', 'WHATSAPP_CLICK', 'PHONE_CLICK', 'EMAIL_CLICK', 'LEAD');

CREATE TABLE "AgentMicrosite" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "live" JSONB,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "disabledById" TEXT,
    "disabledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMicrosite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentMicrosite_orgId_userId_key" ON "AgentMicrosite"("orgId", "userId");
CREATE UNIQUE INDEX "AgentMicrosite_orgId_slug_key" ON "AgentMicrosite"("orgId", "slug");

ALTER TABLE "AgentMicrosite" ADD CONSTRAINT "AgentMicrosite_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentMicrosite" ADD CONSTRAINT "AgentMicrosite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MicrositeEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "micrositeId" TEXT NOT NULL,
    "kind" "MicrositeEventKind" NOT NULL,
    "listingId" TEXT,
    "visitor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MicrositeEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MicrositeEvent_micrositeId_createdAt_idx" ON "MicrositeEvent"("micrositeId", "createdAt");
CREATE INDEX "MicrositeEvent_orgId_createdAt_idx" ON "MicrositeEvent"("orgId", "createdAt");

ALTER TABLE "MicrositeEvent" ADD CONSTRAINT "MicrositeEvent_micrositeId_fkey" FOREIGN KEY ("micrositeId") REFERENCES "AgentMicrosite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MicrositeEvent" ADD CONSTRAINT "MicrositeEvent_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Organisation" ADD COLUMN "micrositesEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organisation" ADD COLUMN "micrositeApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organisation" ADD COLUMN "micrositeOwnWhatsapp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organisation" ADD COLUMN "micrositeAccents" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- The number buyers message on a WhatsApp channel. `identifier` holds
-- Meta's phone number ID (what the webhook routes by), and the public
-- pages had been putting that ID into their wa.me links.
ALTER TABLE "Channel" ADD COLUMN "displayNumber" TEXT;

ALTER TABLE "Enquiry" ADD COLUMN "micrositeId" TEXT;
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_micrositeId_fkey" FOREIGN KEY ("micrositeId") REFERENCES "AgentMicrosite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Enquiry_micrositeId_idx" ON "Enquiry"("micrositeId");

ALTER TABLE "AgentMicrosite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentMicrosite" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AgentMicrosite";
CREATE POLICY tenant_isolation ON "AgentMicrosite"
  USING ("orgId" = current_setting('app.current_org', true))
  WITH CHECK ("orgId" = current_setting('app.current_org', true));

ALTER TABLE "MicrositeEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MicrositeEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MicrositeEvent";
CREATE POLICY tenant_isolation ON "MicrositeEvent"
  USING ("orgId" = current_setting('app.current_org', true))
  WITH CHECK ("orgId" = current_setting('app.current_org', true));
