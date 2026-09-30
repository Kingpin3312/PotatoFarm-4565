-- A subscription's invoices no longer disappear with it.
--
-- UAE VAT law requires tax records to be kept for five years, and every
-- invoice is a number in PotatoFarm's one series: deleting one leaves a
-- gap an auditor reads as a supply left off the return. The foreign key
-- cascaded, so removing a subscription row — by hand, or by a clean-up
-- written later — took its invoices with it silently. Now it is refused.
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_subId_fkey";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subId_fkey"
  FOREIGN KEY ("subId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
