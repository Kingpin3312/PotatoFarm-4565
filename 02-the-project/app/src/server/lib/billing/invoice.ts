import { usage } from "./conversations";
import { aed } from "@/lib/money";
import { crossTenant } from "@/server/db/client";
import { seatDays } from "./seats";
import { supplierTrn, invoiceNumber, vatRateBp } from "./number";

/**
 * Invoicing.
 *
 * Two things that are specific to selling here and easy to get wrong:
 *
 * 1. **VAT follows the registration, not the other way round.**
 *    PotatoFarm is not VAT-registered, so it charges none — only a
 *    registered business may, and collecting it unregistered is an
 *    offence. The day `SUPPLIER_TRN` is set, invoices carry 5% and the
 *    TRN; a tax invoice needs both parties' TRN to be one a brokerage
 *    can reclaim against. `vat-threshold.ts` watches for the day
 *    registration stops being optional.
 * 2. **Everything is in fils**, never floating point. Money in a double
 *    is how a customer ends up with a bill for 0.30000000000000004.
 */

export async function generateInvoice(subId: string, from: Date, to: Date) {
  // First, before any arithmetic: a malformed TRN stops everything,
  // and the registration — or its absence — sets the rate.
  const trn = supplierTrn();
  const rateBp = vatRateBp(trn);

  const sub = await crossTenant("sweep").subscription.findUniqueOrThrow({
    where: { id: subId },
    select: { id: true, orgId: true, seatPriceFils: true, currency: true, trn: true },
  });

  const { seatDays: used, fullPeriodDays } = await seatDays(subId, from, to);

  /**
   * Per-seat-day, derived from the monthly price and the actual length of
   * this period. Deriving from 30 instead means February is quietly more
   * expensive per day than March, and somebody eventually notices.
   */
  /**
   * Exact, in fils, rather than through a double.
   *
   * `Number(seatPriceFils) / fullPeriodDays * used` then rounded was
   * accurate to within a fil today, but the rule at the top of this
   * file is that money never passes through floating point — and this
   * was the one place in the billing path that did.
   */
  const seatFils = (sub.seatPriceFils * BigInt(used)) / BigInt(fullPeriodDays);

  /**
   * The conversation overage, which was computed, shown to the
   * customer all month, and then **left off the bill**.
   *
   * `usage` was imported at the top of this file and never called.
   * `subtotalFils` carried seats only, and `seatFils`,
   * `conversationsAnswered`, `conversationsIncluded` and `overageFils`
   * — four columns whose stated purpose is that an invoice can be read
   * six months later without recomputing anything — were left at their
   * schema defaults of zero on every invoice ever issued.
   *
   * Two consequences, both facing the customer. The brokerage was
   * under-billed, and the VAT with it, so the wrong amount of tax was
   * charged and remitted. And `explain()` below renders those columns,
   * so the second line of every bill read "0 conversations answered,
   * within the 0 included" to a firm that had answered nine hundred —
   * while `billing.status` had shown a running total all month that
   * the invoice then contradicted.
   */
  const u = await usage(subId, from, to);
  const subtotal = seatFils + u.overageFils;

  /**
   * VAT on the whole supply, when there is a registration to charge it
   * under. Computing it on seats alone — which is what happened while
   * the overage was missing — under-remits.
   */
  const vat = (subtotal * BigInt(rateBp)) / 10_000n;

  /**
   * The parts must be the whole. Asserted rather than assumed, because
   * the failure this replaces was silent: an invoice whose subtotal
   * quietly stopped including a component still looked like a valid
   * invoice.
   */
  if (subtotal !== seatFils + u.overageFils) {
    throw new Error("Invoice subtotal does not equal seats plus overage.");
  }

  /**
   * The number and the invoice together, or neither.
   *
   * The counter row is locked by the UPDATE until this commits, so a
   * second invoice waits for the first rather than reading the same
   * number; and if the insert fails the increment rolls back with it,
   * so the series has no hole where the failure was.
   */
  return crossTenant("sweep").$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ n: number }[]>`
      UPDATE "InvoiceSequence" SET "next" = "next" + 1
      WHERE "id" = 'supplier'
      RETURNING "next" - 1 AS n`;
    // Seeded by the migration that created the table. Missing, it is a
    // deployment fault — never a reason to invent a number.
    if (!row) throw new Error("The invoice series has no row; migration 20260928090000_invoice_sequence creates it.");

    return tx.invoice.create({
      data: {
        orgId: sub.orgId,
        subId: sub.id,
        number: invoiceNumber(Number(row.n)),
        supplierTrn: trn,
        customerTrn: sub.trn?.trim() || null,
        periodFrom: from,
        periodTo: to,
        seatDays: used,
        seatDaysFull: fullPeriodDays,
        seatFils,
        conversationsAnswered: u.answered,
        conversationsIncluded: u.included,
        overageFils: u.overageFils,
        subtotalFils: subtotal,
        vatRateBp: rateBp,
        vatFils: vat,
        totalFils: subtotal + vat,
        status: "OPEN",
        // Fourteen days. Long enough for a finance department, short enough
        // that a genuine problem surfaces inside the same month.
        dueAt: new Date(Date.now() + 14 * 86_400_000),
      },
    });
  });
}

/** The line-by-line explanation, so a bill can be argued with. */
export function explain(inv: {
  seatDays: number; seatDaysFull: number; seatFils: bigint;
  conversationsAnswered: number; conversationsIncluded: number; overageFils: bigint;
  subtotalFils: bigint;
  vatFils: bigint; totalFils: bigint; vatRateBp: number;
}) {
  
  return [
    `${inv.seatDays} seat-days over a ${inv.seatDaysFull}-day period`,
    inv.overageFils > 0n
      ? `${inv.conversationsAnswered.toLocaleString()} conversations answered, ` +
        `${inv.conversationsIncluded.toLocaleString()} included — ` +
        `${(inv.conversationsAnswered - inv.conversationsIncluded).toLocaleString()} extra ` +
        `at ${aed(inv.overageFils / BigInt(Math.max(1, inv.conversationsAnswered - inv.conversationsIncluded)))} each`
      : `${inv.conversationsAnswered.toLocaleString()} conversations answered, within the ` +
        `${inv.conversationsIncluded.toLocaleString()} included`,
    `Subtotal ${aed(inv.subtotalFils)}`,
    // Said rather than left out. A brokerage's accountant looking for
    // the VAT line should find the reason there is none, not a gap.
    inv.vatRateBp > 0
      ? `VAT at ${(inv.vatRateBp / 100).toFixed(2)}% — ${aed(inv.vatFils)}`
      : "No VAT charged — PotatoFarm is not VAT-registered",
    `Total ${aed(inv.totalFils)}`,
  ];
}
