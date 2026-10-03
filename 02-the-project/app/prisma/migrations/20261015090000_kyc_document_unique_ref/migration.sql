-- One document row per stored object.
--
-- `aml.documentFromMessage` keys the object on the message
-- (`kyc/<org>/<file>/wa-<message>`) and checks for an existing row before
-- it downloads from Meta — so two requests for the same message, from two
-- tabs or two people, could both pass the check and file the passport
-- twice. The check stays as the friendly answer; this is the guarantee.
-- No table rows share a reference today (every writer makes a fresh key).
CREATE UNIQUE INDEX "KycDocument_storageRef_key" ON "KycDocument"("storageRef");
