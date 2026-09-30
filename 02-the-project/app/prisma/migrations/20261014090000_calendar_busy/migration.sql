-- When an agent's own calendar says they are busy, so a viewing is never
-- offered on top of a dentist's appointment. Read through the mailbox
-- connection the agent already made (Settings → Email), with a free/busy
-- scope only: a start and an end, never a title, attendees or a place.
-- Replaced wholesale on every sync, and gone with the connection.
--
-- Additive: a new table, and two nullable columns on EmailAccount saying
-- when busy times were last read and why they could not be.

CREATE TABLE "CalendarBusy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarBusy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalendarBusy_orgId_agentId_startsAt_idx" ON "CalendarBusy"("orgId", "agentId", "startsAt");
CREATE INDEX "CalendarBusy_accountId_idx" ON "CalendarBusy"("accountId");

ALTER TABLE "CalendarBusy" ADD CONSTRAINT "CalendarBusy_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarBusy" ADD CONSTRAINT "CalendarBusy_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailAccount" ADD COLUMN "busySyncedAt" TIMESTAMP(3);
ALTER TABLE "EmailAccount" ADD COLUMN "calendarError" TEXT;

-- Row-level security: a table added after init is not covered by the
-- init loop. See 20260905124141_deal_payments.
ALTER TABLE "CalendarBusy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarBusy" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CalendarBusy";
CREATE POLICY tenant_isolation ON "CalendarBusy"
  USING ("orgId" = current_setting('app.current_org', true))
  WITH CHECK ("orgId" = current_setting('app.current_org', true));
