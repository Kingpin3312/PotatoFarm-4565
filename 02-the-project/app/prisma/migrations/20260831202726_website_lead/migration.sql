-- NOTE: `migrate dev` again generated 8 DROP INDEX statements for the
-- raw-SQL search indexes and they have been removed by hand. See
-- 20260831195121_publication_not_connected for the full explanation.
-- `check:migrations` now fails the build if these ever survive.

-- CreateEnum
CREATE TYPE "WebsiteLeadKind" AS ENUM ('DEMO', 'SUBSCRIBE');

-- CreateTable
CREATE TABLE "WebsiteLead" (
    "id" TEXT NOT NULL,
    "kind" "WebsiteLeadKind" NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT,
    "teamSize" TEXT,
    "message" TEXT,
    "source" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "emailedAt" TIMESTAMP(3),
    "emailError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebsiteLead_createdAt_idx" ON "WebsiteLead"("createdAt");

-- CreateIndex
CREATE INDEX "WebsiteLead_emailedAt_idx" ON "WebsiteLead"("emailedAt");
