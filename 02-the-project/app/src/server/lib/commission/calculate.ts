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



/**
 * Tiers, across the JSON boundary.
 *
 * `CommissionPlan.tiers` is a `Json` column and `Tier.fromFils` is a
 * `bigint`. JSON has no bigint, so the two cannot meet without a
 * conversion — and there wasn't one. `myTier` read the column and cast
 * it (`plan.tiers as unknown as Tier[]`), which types fine and produces
 * whatever the writer happened to put there.
 *
 * That cast was survivable only by luck. Relational comparison between a
 * bigint and a numeric string coerces, so `earned >= t.fromFils` happens
 * to work when the threshold was written as `"5000000"`. Write it as
 * `5_000_000` and it still works. Write `"5,000,000"` and the coercion
 * throws `SyntaxError: Cannot convert 5,000,000 to a BigInt` — inside a
 * query, on the screen an agent opens to see what they are owed.
 *
 * Both directions live here so the shape is decided once. Stored as a
 * decimal string because that is the only JSON representation of fils
 * that cannot lose precision: a dirham threshold above about nine
 * quadrillion fils is not reachable, but `Number` silently rounds long
 * before anything else complains, and this codebase has already paid for
 * one money-unit mistake.
 */
export type StoredTier = { fromFils: string; shareBp: number };

export function serialiseTiers(tiers: Tier[]): StoredTier[] {
  return tiers.map((t) => ({ fromFils: t.fromFils.toString(), shareBp: t.shareBp }));
}

/**
 * Parse, and refuse rather than guess.
 *
 * A malformed plan is not something to recover from silently — an agent
 * shown the wrong band believes it. The caller decides what to do with
 * `null`, and every caller so far treats it as "no plan", which is the
 * same thing the screen already handles.
 */
export function parseTiers(raw: unknown): Tier[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: Tier[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") return null;
    const { fromFils, shareBp } = t as Record<string, unknown>;
    if (typeof shareBp !== "number" || !Number.isInteger(shareBp)) return null;
    if (shareBp < 0 || shareBp > 10_000) return null;
    if (typeof fromFils !== "string" && typeof fromFils !== "number") return null;
    let from: bigint;
    try {
      from = BigInt(fromFils);
    } catch {
      return null;
    }
    if (from < 0n) return null;
    out.push({ fromFils: from, shareBp });
  }
  return out.sort((a, b) => (a.fromFils < b.fromFils ? -1 : a.fromFils > b.fromFils ? 1 : 0));
}
