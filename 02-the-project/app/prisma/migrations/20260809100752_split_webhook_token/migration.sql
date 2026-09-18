-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "webhookToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Channel_webhookToken_key" ON "Channel"("webhookToken");

