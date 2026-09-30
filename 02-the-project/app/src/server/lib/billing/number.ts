/**
 * The rules an invoice's identity and tax must satisfy, kept apart from
 * `invoice.ts` so they can be tested without a database.
 */

/**
 * PotatoFarm's own VAT registration, or null while there is none.
 *
 * PotatoFarm is not VAT-registered, and in the UAE only a registered
 * business may charge VAT — collecting it without a registration is an
 * offence, not a rounding question. So the registration decides the
 * rate rather than the other way round: no `SUPPLIER_TRN`, no VAT, and
 * the invoice is a plain invoice that says so. Setting the TRN on the
 * day the FTA certificate arrives is what switches 5% on.
 *
 * This used to refuse every invoice without a TRN, on the assumption
 * that the company was registered and the number merely unconfigured.
 * Unregistered, that refusal stopped billing entirely.
 *
 * A value that is set but malformed still throws: a typo would be
 * printed on every tax invoice, and silently treating it as "not
 * registered" would stop charging VAT the business owes.
 */
export function supplierTrn(): string | null {
  const trn = process.env.SUPPLIER_TRN?.replace(/\s/g, "");
  if (!trn) return null;
  // A UAE TRN is fifteen digits.
  if (!/^\d{15}$/.test(trn)) throw new Error("SUPPLIER_TRN must be the fifteen-digit UAE Tax Registration Number, or unset while PotatoFarm is not VAT-registered.");
  return trn;
}

/** UAE standard rate, in basis points: 5.00%. */
export const UAE_VAT_BP = 500;

/** The rate this invoice may charge — 5% registered, nothing otherwise. */
export function vatRateBp(trn: string | null): number {
  return trn ? UAE_VAT_BP : 0;
}

/** The supplier's series: PF-000001, PF-000002, … never reset. */
export function invoiceNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Not an invoice sequence number: ${n}`);
  return `PF-${String(n).padStart(6, "0")}`;
}

/**
 * Who the invoice is from: the legal name on the trade licence and the
 * registered address. Environment, like the TRN, because they belong to
 * the company running this deployment rather than to any brokerage.
 *
 * The name falls back to the brand, which is what a customer recognises;
 * the address falls back to nothing, never to a guess. Once registered
 * for VAT, both are required on a tax invoice, and the boot log says so.
 */
export function supplierDetails(): { name: string; address: string | null } {
  return {
    name: process.env.SUPPLIER_NAME?.trim() || "PotatoFarm.io",
    address: process.env.SUPPLIER_ADDRESS?.trim() || null,
  };
}
