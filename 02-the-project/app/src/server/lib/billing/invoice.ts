import { usage } from "./conversations";
import { aed } from "@/lib/money";
import { crossTenant } from "@/server/db/client";
import { seatDays } from "./seats";

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
  const perSeatDay = Number(sub.seatPriceFils) / fullPeriodDays;
  const subtotal = BigInt(Math.round(perSeatDay * used));
  const vat = (subtotal * BigInt(VAT_BP)) / 10_000n;

  const number = await nextInvoiceNumber(sub.orgId);

  return crossTenant("sweep").invoice.create({
    data: {
      orgId: sub.orgId,
      subId: sub.id,
      number,
      periodFrom: from,
      periodTo: to,
      seatDays: used,
      seatDaysFull: fullPeriodDays,
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
}

/**
 * Sequential per brokerage, gapless.
 *
 * A tax authority expects invoice numbers not to skip. Using a random id
 * or a global counter means every customer's sequence has holes in it,
 * which is a conversation nobody wants to have during an audit.
 */
async function nextInvoiceNumber(orgId: string) {
  const last = await crossTenant("sweep").invoice.findFirst({
    where: { orgId },
    orderBy: { issuedAt: "desc" },
    select: { number: true },
  });
  const n = last ? Number(last.number.split("-").at(-1)) + 1 : 1;
  return `INV-${orgId.slice(-6).toUpperCase()}-${String(n).padStart(5, "0")}`;
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
