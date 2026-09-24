/**
 * The two rules a tax invoice's identity must satisfy, kept apart from
 * `invoice.ts` so they can be tested without a database.
 */

/**
 * PotatoFarm's own VAT registration, which every invoice must carry.
 *
 * Only a registered business may charge VAT, and a tax invoice without
 * the supplier's TRN is not one — the brokerage cannot reclaim the VAT on
 * it. Every invoice charged 5% and none carried a number. So an invoice
 * is refused rather than issued without it, the same way sign-up refuses
 * without a seat price: an invoice that has to be withdrawn is worse
 * than one that is a day late, and the job reports the failure.
 */
export function supplierTrn(): string {
  const trn = process.env.SUPPLIER_TRN?.replace(/\s/g, "");
  if (!trn) throw new Error("SUPPLIER_TRN is not set — no tax invoice can be issued without the supplier's VAT registration.");
  // A UAE TRN is fifteen digits. A typo here is printed on every invoice.
  if (!/^\d{15}$/.test(trn)) throw new Error("SUPPLIER_TRN must be the fifteen-digit UAE Tax Registration Number.");
  return trn;
}

/** The supplier's series: PF-000001, PF-000002, … never reset. */
export function invoiceNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Not an invoice sequence number: ${n}`);
  return `PF-${String(n).padStart(6, "0")}`;
}
