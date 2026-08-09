/**
 * UAE AML rules for real estate brokers.
 *
 * Not a feature. Every brokerage concluding a purchase or sale is a
 * **DNFBP** under UAE law, which brings obligations that carry
 * administrative penalties: goAML registration, customer due diligence,
 * sanctions screening before onboarding, Real Estate Activity Reports,
 * five-year records and a named compliance officer.
 *
 * Two things in this file are legal thresholds rather than product
 * decisions, and must not be changed to suit a customer:
 *
 *   - the REAR cash trigger
 *   - the retention period
 *
 * Everything here should be reviewed by a UAE compliance adviser before
 * launch. It is written from the Ministry of Economy guidance and the
 * FIU's published requirements, and it is a starting point rather than
 * legal advice.
 */

/**
 * REAR trigger.
 *
 * AED 55,000 or more in physical cash, **single or linked**. Linked is
 * the part that gets missed: three payments of twenty thousand across a
 * week are linked, and they trigger it.
 *
 * Virtual asset settlement triggers it regardless of amount.
 */
export const REAR_CASH_THRESHOLD_FILS = 5_500_000n; // AED 55,000
export const REAR_LINKED_WINDOW_DAYS = 90;

/** Five years, from the FIU requirement. Applies even if the deal collapses. */
export const AML_RETENTION_YEARS = 5;

export type Payment = { amountFils: bigint; method: "CASH" | "TRANSFER" | "CHEQUE" | "VIRTUAL_ASSET"; at: Date };

export type RearAssessment = {
  required: boolean;
  reason?: string;
  cashTotalFils: bigint;
  linkedPayments: number;
};

export function assessRear(payments: Payment[], now = new Date()): RearAssessment {
  const virtual = payments.filter((p) => p.method === "VIRTUAL_ASSET");
  if (virtual.length) {
    return {
      required: true,
      reason: "Virtual asset settlement. Triggers a REAR whatever the amount.",
      cashTotalFils: virtual.reduce((n, p) => n + p.amountFils, 0n),
      linkedPayments: virtual.length,
    };
  }

  const window = new Date(now.getTime() - REAR_LINKED_WINDOW_DAYS * 86_400_000);
  const cash = payments.filter((p) => p.method === "CASH" && p.at >= window);
  const total = cash.reduce((n, p) => n + p.amountFils, 0n);

  if (total >= REAR_CASH_THRESHOLD_FILS) {
    const single = cash.some((p) => p.amountFils >= REAR_CASH_THRESHOLD_FILS);
    return {
      required: true,
      reason: single
        ? "A single cash payment at or above AED 55,000."
        : `${cash.length} linked cash payments totalling AED ${(Number(total) / 100).toLocaleString("en-GB")} within ${REAR_LINKED_WINDOW_DAYS} days.`,
      cashTotalFils: total,
      linkedPayments: cash.length,
    };
  }

  return { required: false, cashTotalFils: total, linkedPayments: cash.length };
}

/**
 * Risk rating.
 *
 * A risk-based approach is what the regulation asks for, so this produces
 * reasons rather than only a score — an inspector asks *why* a client was
 * rated low, and "the system said so" is not an answer.
 */
export type RiskInput = {
  isPep: boolean;
  isNonResident: boolean;
  isCompany: boolean;
  uboCount: number;
  cashInvolved: boolean;
  dealValueFils: bigint;
  countryRisk?: "LOW" | "MEDIUM" | "HIGH";
};

export function assessRisk(i: RiskInput): { rating: "LOW" | "MEDIUM" | "HIGH"; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // A PEP is enhanced due diligence by definition, not a scoring input.
  if (i.isPep) { reasons.push("Politically exposed person — enhanced due diligence required."); score += 4; }
  if (i.isNonResident) { reasons.push("Non-resident buyer."); score += 1; }
  if (i.countryRisk === "HIGH") { reasons.push("High-risk jurisdiction."); score += 3; }
  if (i.isCompany && i.uboCount === 0) {
    reasons.push("Corporate buyer with no beneficial owner identified — this must be resolved before proceeding.");
    score += 4;
  }
  if (i.isCompany && i.uboCount > 3) { reasons.push("Complex ownership structure."); score += 2; }
  if (i.cashInvolved) { reasons.push("Cash involved in settlement."); score += 2; }
  if (i.dealValueFils > 1_000_000_000n) { reasons.push("High-value transaction (over AED 10m)."); score += 1; }

  const rating = score >= 4 ? "HIGH" : score >= 2 ? "MEDIUM" : "LOW";
  if (!reasons.length) reasons.push("No elevated risk factors identified.");
  return { rating, reasons };
}

/** How often the file must be re-reviewed. Risk-based, as required. */
export function reviewIntervalMonths(rating: "LOW" | "MEDIUM" | "HIGH") {
  return rating === "HIGH" ? 6 : rating === "MEDIUM" ? 12 : 24;
}

/**
 * Tipping off.
 *
 * Telling a client that a report has been filed — or is being considered —
 * is an offence in its own right, separate from anything the client may
 * have done. So the assistant is silenced on the conversation, and the
 * agent is not told why.
 *
 * This is the one place in the product where information is deliberately
 * withheld from the person doing the work, and it is worth being explicit
 * about the reason rather than making it look like a bug.
 */
export const TIPPING_OFF_RULES = {
  reportsVisibleTo: ["COMPLIANCE_OFFICER"] as const,
  assistantMustPause: true,
  agentSeesReason: false,
  agentSeesGenericHold: "This file is with compliance. Carry on as normal and do not mention it to the client.",
};
