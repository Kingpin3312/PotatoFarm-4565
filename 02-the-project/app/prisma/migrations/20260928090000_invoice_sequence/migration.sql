-- One invoice series for the supplier, not one per customer.
--
-- UAE VAT (Executive Regulation, Art. 59(1)(d)) asks for "a sequential
-- Tax Invoice number or a unique number which enables identification of
-- the Tax Invoice and the order of the Tax Invoice in any sequence". The
-- sequence belongs to whoever issues the invoice — PotatoFarm, one TRN —
-- and a gap in it is what an auditor reads as a supply left off the
-- return. Per-brokerage series gave the supplier dozens of parallel
-- sequences, prefixed with six characters of an internal id that two
-- brokerages can share.
--
-- A counter row rather than a Postgres SEQUENCE: nextval() is not
-- returned when a transaction rolls back, so a failed invoice would
-- leave a hole. The row is incremented inside the invoice's own
-- transaction and locked until it commits, so a failure gives the
-- number back and two invoices at once cannot share one.
CREATE TABLE "InvoiceSequence" (
    "id" TEXT NOT NULL,
    "next" INTEGER NOT NULL,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

INSERT INTO "InvoiceSequence" ("id", "next") VALUES ('supplier', 1);

-- Both parties' TRNs as they stood when the invoice was issued. A tax
-- invoice is not allowed to change afterwards, and either number can.
ALTER TABLE "Invoice" ADD COLUMN "supplierTrn" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "customerTrn" TEXT;
