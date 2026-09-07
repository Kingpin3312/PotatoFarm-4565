-- DropIndex
DROP INDEX "lead_deleted_idx";

-- DropIndex
DROP INDEX "listing_deleted_idx";

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "name" DROP NOT NULL;
