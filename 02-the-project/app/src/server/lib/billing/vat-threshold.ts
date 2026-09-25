import { crossTenant } from "@/server/db/client";
import { seatDays } from "./seats";
import { supplierTrn } from "./number";
import { sendMail } from "@/server/lib/mail";
import { aed } from "@/lib/money";

/**
 * When VAT registration stops being optional.
 *
 * PotatoFarm is not VAT-registered, so it charges none. That is only
 * lawful while turnover stays under the line, and the line is not
 * something anybody watches by hand:
 *
 *   - **Mandatory** once taxable supplies over the previous twelve
 *     months exceed **AED 375,000**, or are expected to exceed it in the
 *     next thirty days alone. The application is due within thirty days
 *     of crossing, and the FTA's penalty for registering late runs from
 *     that date — as does the VAT that should have been charged, which
 *     the business then pays out of its own pocket because the invoices
 *     already went out without it.
 *   - **Voluntary** from AED 187,500. Worth considering well before it is
 *     compulsory: every customer is a VAT-registered brokerage that can
 *     reclaim what it is charged, so registering costs them nothing and
 *     lets PotatoFarm reclaim the VAT on its own costs.
 *
 * Every invoice is to a UAE brokerage for a standard-rated supply, so the
 * invoice subtotals are the taxable supplies. Voided and draft invoices
 * are not supplies.
 */

/** In fils. */
export const MANDATORY_FILS = 37_500_000n;   // AED 375,000
export const VOLUNTARY_FILS = 18_750_000n;   // AED 187,500
/** Far enough ahead to register without a rush: 80% of the line. */
export const APPROACHING_FILS = (MANDATORY_FILS * 80n) / 100n;

export type Band = "REGISTERED" | "BELOW" | "VOLUNTARY" | "APPROACHING" | "MUST_REGISTER";
export const RANK: Record<Band, number> = {
  REGISTERED: 0, BELOW: 0, VOLUNTARY: 1, APPROACHING: 2, MUST_REGISTER: 3,
};

/**
 * Where turnover stands against the line. Pure, so the rule is tested
 * without a database.
 *
 * "Exceeds" is the regulation's word, so exactly AED 375,000 is not over.
 * The thirty-day test is on its own: a month's billing above the line is
 * mandatory registration even with no history at all.
 */
export function band(registered: boolean, trailingFils: bigint, next30Fils: bigint): Band {
  if (registered) return "REGISTERED";
  if (trailingFils > MANDATORY_FILS || next30Fils > MANDATORY_FILS) return "MUST_REGISTER";
  if (trailingFils >= APPROACHING_FILS) return "APPROACHING";
  if (trailingFils >= VOLUNTARY_FILS) return "VOLUNTARY";
  return "BELOW";
}

const SUPPLIED = ["OPEN", "PAID", "FAILED"] as const;

/**
 * The two figures the rule is applied to.
 *
 * Trailing: every invoice issued in the last 365 days, before VAT.
 *
 * Next thirty days: what the paying subscriptions would bill for a month
 * at today's headcount, plus the conversation overage from the last
 * month's invoices. An estimate, and deliberately not a low one — this
 * is the test that catches a sudden large customer, and underestimating
 * it is the expensive direction. Trials are left out: they may not
 * convert, and when they do they appear here the next day.
 */
export async function vatPosition(now = new Date()) {
  const db = crossTenant("sweep");
  const registered = (() => {
    try { return supplierTrn() !== null; } catch { return true; }
  })();

  const yearAgo = new Date(now.getTime() - 365 * 86_400_000);
  const monthAgo = new Date(now.getTime() - 31 * 86_400_000);

  const [trailing, lastMonthOverage, paying] = await Promise.all([
    db.invoice.aggregate({
      where: { status: { in: [...SUPPLIED] }, issuedAt: { gt: yearAgo, lte: now } },
      _sum: { subtotalFils: true },
    }),
    db.invoice.aggregate({
      where: { status: { in: [...SUPPLIED] }, issuedAt: { gt: monthAgo, lte: now } },
      _sum: { overageFils: true },
    }),
    db.subscription.findMany({
      where: { status: { in: ["ACTIVE", "PAST_DUE", "RESTRICTED"] } },
      select: { id: true, seatPriceFils: true, currentFrom: true },
    }),
  ]);

  let runRate = 0n;
  for (const s of paying) {
    const { seatsAtEnd } = await seatDays(s.id, s.currentFrom, now);
    runRate += BigInt(Math.max(0, seatsAtEnd)) * s.seatPriceFils;
  }

  const trailingFils = trailing._sum.subtotalFils ?? 0n;
  const next30Fils = runRate + (lastMonthOverage._sum.overageFils ?? 0n);
  return {
    registered,
    trailingFils,
    next30Fils,
    band: band(registered, trailingFils, next30Fils),
  };
}

/** What the job remembers between runs, in its own result. */
export type AlertState = { alerted: Band; alertedAt: string | null };

/**
 * Whether to email today, and what to remember. Pure.
 *
 * Once per rise, not every day: a daily "you are at 81%" is how an
 * important email becomes one nobody opens. The exception is the band
 * with a legal deadline — mandatory registration is repeated weekly
 * until the TRN is set, because the thirty days are running.
 *
 * A fall is remembered too, so turnover that dips and comes back is
 * announced again rather than assumed to be known.
 */
export function nextAlert(current: Band, prev: AlertState, now: Date): { send: boolean; state: AlertState } {
  const week = 7 * 86_400_000;
  const rose = RANK[current] > RANK[prev.alerted];
  const repeat = current === "MUST_REGISTER"
    && (!prev.alertedAt || now.getTime() - new Date(prev.alertedAt).getTime() >= week);
  if (rose || repeat) return { send: true, state: { alerted: current, alertedAt: now.toISOString() } };
  if (RANK[current] < RANK[prev.alerted]) return { send: false, state: { alerted: current, alertedAt: prev.alertedAt } };
  return { send: false, state: prev };
}

const SUBJECT: Record<Band, string> = {
  REGISTERED: "",
  BELOW: "",
  VOLUNTARY: "PotatoFarm can now register for VAT voluntarily",
  APPROACHING: "PotatoFarm is nearing the compulsory VAT registration threshold",
  MUST_REGISTER: "Action needed: PotatoFarm must register for VAT within 30 days",
};

function body(p: Awaited<ReturnType<typeof vatPosition>>): string {
  const figures =
    `<p>Invoiced in the last twelve months, before VAT: <b>${aed(p.trailingFils)}</b><br>` +
    `Expected in the next thirty days at today's headcount: <b>${aed(p.next30Fils)}</b></p>`;
  const what: Record<Band, string> = {
    REGISTERED: "", BELOW: "",
    VOLUNTARY:
      "<p>Turnover has passed AED 187,500, so PotatoFarm may register for VAT voluntarily. " +
      "Every customer is a VAT-registered brokerage that can reclaim what it is charged, so " +
      "registering costs them nothing and lets PotatoFarm reclaim VAT on its own costs. " +
      "Worth a conversation with your accountant.</p>",
    APPROACHING:
      "<p>Turnover has passed AED 300,000. Registration becomes compulsory once it exceeds " +
      "AED 375,000 over twelve months. Start the application with your accountant now — it " +
      "takes time, and registering late carries a penalty and the VAT that was not charged.</p>",
    MUST_REGISTER:
      "<p><b>Registration is now compulsory.</b> Taxable supplies have exceeded AED 375,000 " +
      "over twelve months, or are expected to in the next thirty days. The application to " +
      "the Federal Tax Authority is due within thirty days. Speak to your accountant today.</p>",
  };
  return what[p.band] + figures +
    "<p>When the TRN arrives, set <code>SUPPLIER_TRN</code> to it and every invoice from then on " +
    "carries 5% VAT. This email repeats weekly while registration is overdue.</p>";
}

/**
 * The daily job. Reads what it last announced from its own previous
 * result, so it needs no table of its own.
 *
 * An email that fails to send is not remembered as sent: tomorrow's run
 * tries again. That is the difference between a warning and a record
 * of having meant to warn.
 */
export async function watchVatThreshold(prev: AlertState | null, now = new Date()) {
  const p = await vatPosition(now);
  const decision = nextAlert(p.band, prev ?? { alerted: "BELOW", alertedAt: null }, now);
  let emailed = false;
  if (decision.send) {
    emailed = (await sendMail({
      to: process.env.SALES_INBOX ?? "hello@potatofarm.io",
      subject: SUBJECT[p.band],
      html: body(p),
    })) !== false;
  }
  const state = decision.send && !emailed ? (prev ?? { alerted: "BELOW" as Band, alertedAt: null }) : decision.state;
  return {
    band: p.band,
    // Whole dirhams, as numbers: a job result is JSON, and BigInt is not.
    trailingAed: Number(p.trailingFils / 100n),
    next30Aed: Number(p.next30Fils / 100n),
    emailed,
    ...state,
  };
}
