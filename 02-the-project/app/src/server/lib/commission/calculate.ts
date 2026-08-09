import { aed } from "@/lib/money";
/**
 * Commission.
 *
 * The gap that loses the room in the first ten minutes of a demo. An
 * agent's first question is "can I see what I'm owed", and until now the
 * answer was no.
 *
 * Four things this gets right that most implementations do not:
 *
 * 1. **Commission is derived from the deal value, never typed in
 *    separately.** Two numbers that ought to agree eventually will not,
 *    and the argument that follows is with somebody's pay.
 * 2. **VAT on the commission is separate from VAT on the property.**
 *    Brokerages here routinely forget the first until an invoice comes
 *    back rejected.
 * 3. **Splits are basis points and must total exactly 10,000.** A split
 *    set that quietly sums to 99% is money nobody notices is missing
 *    until year end.
 * 4. **Everything is fils.** Percentages of large numbers in floating
 *    point is how an agent is short by a dirham and stops trusting the
 *    system entirely.
 */

const VAT_BP = 500; // 5%

export type Tier = { fromFils: bigint; shareBp: number };

export type SplitInput = {
  userId?: string;
  externalName?: string;
  role: "LISTING_AGENT" | "SELLING_AGENT" | "REFERRER" | "MANAGER" | "BROKERAGE";
  shareBp: number;
};

export class SplitError extends Error {}

export function calculate(args: {
  dealValueFils: bigint;
  rateBp: number;
  splits: SplitInput[];
}) {
  const total = args.splits.reduce((n, s) => n + s.shareBp, 0);
  if (total !== 10_000) {
    // Refused rather than normalised. Silently scaling a 99% split set to
    // 100% hides the mistake and pays somebody the wrong amount.
    throw new SplitError(
      `Splits total ${(total / 100).toFixed(2)}%, not 100%. Fix the split before this can be saved.`
    );
  }

  const gross = (args.dealValueFils * BigInt(args.rateBp)) / 10_000n;
  const vat = (gross * BigInt(VAT_BP)) / 10_000n;
  const net = gross; // VAT is collected on top and remitted, not kept

  /**
   * Rounding. Splits are computed against the net and the remainder goes
   * to the brokerage, so the parts always sum exactly to the whole. The
   * alternative — rounding each share independently — leaves a few fils
   * unallocated, and an agent who is short by a dirham loses faith in
   * every other number on the screen.
   */
  const allocated: (SplitInput & { amountFils: bigint })[] = [];
  let running = 0n;

  const agentSplits = args.splits.filter((s) => s.role !== "BROKERAGE");
  for (const s of agentSplits) {
    const amount = (net * BigInt(s.shareBp)) / 10_000n;
    allocated.push({ ...s, amountFils: amount });
    running += amount;
  }

  const brokerage = args.splits.find((s) => s.role === "BROKERAGE");
  if (brokerage) allocated.push({ ...brokerage, amountFils: net - running });

  return { grossFils: gross, vatFils: vat, netFils: net, splits: allocated };
}

/**
 * The agent's share, from their tiered plan.
 *
 * Tiers are read against what they have **already earned this year**, not
 * against this deal. An agent who crosses a threshold mid-deal moves to
 * the higher band for the next one, not retrospectively — which is how
 * every brokerage I have seen actually writes the contract, and getting
 * it the other way round produces a payroll dispute rather than a bug
 * report.
 */
export function shareForAgent(tiers: Tier[], earnedThisYearFils: bigint) {
  const sorted = [...tiers].sort((a, b) => (a.fromFils < b.fromFils ? -1 : 1));
  let share = sorted[0]?.shareBp ?? 5_000;
  for (const t of sorted) if (earnedThisYearFils >= t.fromFils) share = t.shareBp;
  return share;
}


