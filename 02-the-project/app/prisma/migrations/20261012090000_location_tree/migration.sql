-- The location tree Property Finder files listings under, and each
-- listing's place in it. Additive: nothing existing changes.

CREATE TYPE "LocationLevel" AS ENUM ('CITY', 'COMMUNITY', 'SUB_COMMUNITY', 'BUILDING');

CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "level" "LocationLevel" NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "pfLocationId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Location_pfLocationId_key" ON "Location"("pfLocationId");
CREATE UNIQUE INDEX "Location_parentId_name_key" ON "Location"("parentId", "name");
CREATE INDEX "Location_level_idx" ON "Location"("level");
-- A city has no parent, and NULLs never collide in a unique index, so
-- two "Dubai" roots would otherwise be allowed.
CREATE UNIQUE INDEX "Location_root_name_key" ON "Location"("name") WHERE "parentId" IS NULL;
-- Search matches any part of the path; the trigram operator class is
-- already installed for search (20260810090000_search_indexes).
CREATE INDEX "Location_path_trgm_idx" ON "Location" USING GIN ("path" gin_trgm_ops);

ALTER TABLE "Location" ADD CONSTRAINT "Location_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Listing" ADD COLUMN "locationId" TEXT;
CREATE INDEX "Listing_locationId_idx" ON "Listing"("locationId");
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Shared reference data: the application reads it; only the seed and
-- the Property Finder import (run as the owner) change it.
REVOKE INSERT, UPDATE, DELETE ON "Location" FROM potato_app;
