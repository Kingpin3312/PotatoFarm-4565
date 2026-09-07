-- The brokerage-level listing feed token.
--
-- Hand-written, not generated. `prisma migrate dev` builds its diff
-- against a shadow database created from schema.prisma alone, which has
-- neither the eight raw-SQL trigram indexes nor the row-level security
-- policies this database actually carries. It therefore sees permanent
-- drift, wants to reset, and goes interactive — and when it does run it
-- writes DROP INDEX for all eight (see 20260831195121, and again in
-- 20260831202726, minutes apart).
--
-- So for this schema a migration that touches only additive DDL is
-- written by hand. `check:migrations` guards the other direction.
ALTER TABLE "Organisation" ADD COLUMN "feedToken" TEXT;
ALTER TABLE "Organisation" ADD COLUMN "feedTokenAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Organisation_feedToken_key" ON "Organisation"("feedToken");
