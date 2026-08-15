-- The document register can hold a date without holding a scan.
--
-- `documents.expiry` runs daily over this table and has never found a
-- row, because nothing in the codebase could create one. The register
-- exists to answer "when does this lapse" — a RERA broker card, a
-- Trakheesi permit, the brokerage licence — and requiring an uploaded
-- file to record that made the whole alarm wait on object storage being
-- configured and somebody finding a scanner.
--
-- Both columns are made nullable rather than defaulted: a null file name
-- means "nothing uploaded yet", which the screen says out loud, while an
-- empty string would look like a file that failed.

ALTER TABLE "Document" ALTER COLUMN "storageRef" DROP NOT NULL;
ALTER TABLE "Document" ALTER COLUMN "fileName" DROP NOT NULL;

-- The number quoted at renewal. Without a field for it, it goes in the
-- file name.
ALTER TABLE "Document" ADD COLUMN "reference" TEXT;
