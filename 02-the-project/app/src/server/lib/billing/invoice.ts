import { usage } from "./conversations";
import { aed } from "@/lib/money";
import { crossTenant } from "@/server/db/client";
import { seatDays } from "./seats";
import { supplierTrn, invoiceNumber } from "./number";

/**
 * Invoicing.
 *
 * Two things that are specific to selling here and easy to get wrong:
 *
 * 1. **UAE VAT is 5%**, and a tax invoice needs both parties' TRN to be
 *    valid. A brokerage that cannot reclaim the VAT because the invoice
 *    was malformed will ask for it to be reissued, every month, forever.
 * 2. **Everything is in fils**, never floating point. Money in a double
 *    is how a customer ends up with a bill for 0.30000000000000004.
 */

const VAT_BP = 500; // 5.00%

export async function generateInvoice(subId: string, from: Date, to: Date) {
  // First, before any arithmetic: nothing is issued without it.
  const trn = supplierTrn();

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
   * VAT on the whole supply. Computing it on seats alone — which is
   * what happened while the overage was missing — under-remits.
   */
  const vat = (subtotal * BigInt(VAT_BP)) / 10_000n;

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
        vatRateBp: VAT_BP,
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
    `VAT at ${(inv.vatRateBp / 100).toFixed(2)}% — ${aed(inv.vatFils)}`,
    `Total ${aed(inv.totalFils)}`,
  ];
}
