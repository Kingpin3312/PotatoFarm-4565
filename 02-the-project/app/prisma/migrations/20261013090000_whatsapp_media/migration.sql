-- What a buyer sent that was not text: Meta's id for the photo or PDF, and
-- its type as Meta reported it. Only the reference is kept; the file stays
-- with Meta until somebody files it (into a due diligence file), so a
-- passport is never copied anywhere just because it was sent. Nullable,
-- and null on every existing row.
ALTER TABLE "Message" ADD COLUMN "mediaId" TEXT;
ALTER TABLE "Message" ADD COLUMN "mediaType" TEXT;
