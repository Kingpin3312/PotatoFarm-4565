-- Both parties on the invoice as they were on the day it was issued, and
-- the brokerage's billing address to put there. Additive and nullable:
-- invoices issued before this keep their numbers and amounts untouched.
ALTER TABLE "Subscription" ADD COLUMN "billingAddress" TEXT;

ALTER TABLE "Invoice" ADD COLUMN "supplierName" TEXT,
                      ADD COLUMN "supplierAddress" TEXT,
                      ADD COLUMN "customerName" TEXT,
                      ADD COLUMN "customerAddress" TEXT;
