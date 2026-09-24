-- Who looks after a listing.
--
-- Neither a listing nor its owner recorded an agent, so the owner's
-- weekly report had to guess who should send it, and removing an agent
-- had no way to hand their listings on. Nullable: a listing can exist
-- before anybody is given it, and ON DELETE SET NULL because a user
-- being deleted must not delete a property.
ALTER TABLE "Listing" ADD COLUMN "agentId" TEXT;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Listing_orgId_agentId_idx" ON "Listing"("orgId", "agentId");
