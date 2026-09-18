-- CreateEnum
CREATE TYPE "AutonomyMode" AS ENUM ('COPILOT', 'ASSISTED', 'AUTOPILOT');

-- AlterTable
ALTER TABLE "AssistantSettings" ADD COLUMN     "autonomy" "AutonomyMode" NOT NULL DEFAULT 'COPILOT';

