-- Two-step sign-in (the audit's C8). Additive: four nullable columns on
-- User, one on Session. Nothing existing changes meaning.

-- The authenticator key, sealed with SECRETS_KEY (JSON of the vault's
-- Sealed shape), never stored in the clear.
ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT;
-- Null until the person proves their app works with a first code.
ALTER TABLE "User" ADD COLUMN "totpEnabledAt" TIMESTAMP(3);
-- The last 30-second step accepted, so one code cannot be used twice.
ALTER TABLE "User" ADD COLUMN "totpLastStep" INTEGER;
-- SHA-256 of the unused one-time recovery codes.
ALTER TABLE "User" ADD COLUMN "totpRecovery" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- When this sign-in passed the second step. Per session, so a stolen
-- magic link opens nothing on a new device without the code.
ALTER TABLE "Session" ADD COLUMN "secondFactorAt" TIMESTAMP(3);
