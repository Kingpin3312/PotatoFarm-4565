import type { DealStage, Financing } from "@prisma/client";

/**
 * The transaction after the handshake.
 *
 * Our pipeline used to end at "Won", which in this market is roughly the
 * halfway point. Deals die between agreement and transfer, and the reason
 * is almost always the same: a step with a two-week lead time started one
 * week before it was needed.
 *
 * The Form F carries a **contractual completion date**. Missing it is not
 * an inconvenience — it can mean forfeiting the deposit. So this is not a
 * checklist. It is backwards planning from a date somebody has signed.
 */

export type StageSpec = {
  stage: DealStage;
  title: string;
  /** Who has to act. Most delays are somebody else's, and saying so helps. */
  owner: "BUYER" | "SELLER" | "BROKER" | "BANK" | "DEVELOPER" | "DLD";
  /** Working days this typically takes once started. */
  typicalDays: number;
  /** Documents that must exist before it can be marked done. */
  requires: string[];
  /** Only on this financing path. */
  onlyIf?: (d: { financing: Financing; sellerHasMortgage: boolean }) => boolean;
  /** What actually goes wrong here, in the words an agent would use. */
  watchFor?: string;
};

export const STAGES: StageSpec[] = [
  {
    stage: "MOU_SIGNED",
    title: "Form F signed",
    owner: "BROKER",
    typicalDays: 2,
    requires: ["Form F", "Buyer ID", "Seller ID", "Title deed copy"],
    watchFor: "The completion date on the Form F is the date everything else works back from. Get it right before anyone signs.",
  },
  {
    stage: "DEPOSIT_PAID",
    title: "Deposit paid",
    owner: "BUYER",
    typicalDays: 2,
    requires: ["Deposit cheque or transfer receipt"],
    watchFor: "Usually 10%. Held by the broker or a trustee, never by the seller.",
  },
  {
    stage: "MORTGAGE_APPLIED",
    title: "Mortgage applied for",
    owner: "BUYER",
    typicalDays: 3,
    requires: ["Pre-approval letter"],
    onlyIf: (d) => d.financing === "MORTGAGE",
    watchFor: "Pre-approval is not approval. Buyers routinely believe it is.",
  },
  {
    stage: "VALUATION_DONE",
    title: "Bank valuation",
    owner: "BANK",
    typicalDays: 7,
    requires: ["Valuation report"],
    onlyIf: (d) => d.financing === "MORTGAGE",
    watchFor: "A valuation below the agreed price is the single most common reason a mortgage deal renegotiates or collapses.",
  },
  {
    stage: "FINAL_OFFER",
    title: "Final offer letter",
    owner: "BANK",
    typicalDays: 7,
    requires: ["Final offer letter"],
    onlyIf: (d) => d.financing === "MORTGAGE",
  },
  {
    stage: "LIABILITY_LETTER",
    title: "Seller's liability letter",
    owner: "BANK",
    typicalDays: 10,
    requires: ["Liability letter"],
    onlyIf: (d) => d.sellerHasMortgage,
    watchFor: "The most commonly forgotten dependency in the whole process. If the seller has a mortgage, this adds two to three weeks and nobody remembers until week four.",
  },
  {
    stage: "NOC_APPLIED",
    title: "NOC applied for",
    owner: "SELLER",
    typicalDays: 2,
    requires: ["NOC application", "Service charge clearance"],
    watchFor: "Outstanding service charges stop the NOC. Check them the day the Form F is signed, not the week of transfer.",
  },
  {
    stage: "NOC_RECEIVED",
    title: "NOC received",
    owner: "DEVELOPER",
    typicalDays: 10,
    requires: ["NOC"],
    watchFor: "Developer turnaround varies enormously. Some are five days, some are three weeks, and nobody tells you which until you ask.",
  },
  {
    stage: "TRANSFER_BOOKED",
    title: "Transfer appointment booked",
    owner: "BROKER",
    typicalDays: 3,
    requires: ["Trustee appointment confirmation"],
  },
  {
    stage: "COMPLETED",
    title: "Transferred",
    owner: "DLD",
    typicalDays: 1,
    requires: ["Title deed", "Manager's cheques"],
  },
];

/** The steps that actually apply to one deal. */
export function stagesFor(deal: { financing: Financing; sellerHasMortgage: boolean }) {
  return STAGES.filter((s) => !s.onlyIf || s.onlyIf(deal));
}

/**
 * How long this shape of deal takes, in working days.
 *
 * Worth knowing before the Form F is signed: agreeing a 30-day completion
 * on a mortgage purchase where the seller also has a mortgage is agreeing
 * to something that typically takes longer than 30 days.
 */
export function typicalDuration(deal: { financing: Financing; sellerHasMortgage: boolean }) {
  return stagesFor(deal).reduce((n, s) => n + s.typicalDays, 0);
}
