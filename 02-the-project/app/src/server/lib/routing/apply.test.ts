import { describe, it, expect } from "vitest";
import { firstMatchingRule } from "./apply";

/**
 * Which rule a lead falls under.
 *
 * Pure, so it belongs here rather than in a browser check: the
 * conditions are five different shapes and the interesting cases are
 * the ones a real inbox rarely produces on demand.
 */
const rule = (over: Partial<Parameters<typeof firstMatchingRule>[0][number]> = {}) => ({
  id: "r", name: "r", priority: 1000,
  sources: [], communities: [], languages: [],
  minBudgetFils: null, maxBudgetFils: null,
  strategy: "ROUND_ROBIN" as const, userIds: [],
  ...over,
});

const lead = (over: Partial<Parameters<typeof firstMatchingRule>[1]> = {}) => ({
  source: "WHATSAPP_AD" as const, ...over,
});

describe("firstMatchingRule", () => {
  it("returns null when there are no rules", () => {
    expect(firstMatchingRule([], lead())).toBeNull();
  });

  it("a rule with no conditions always matches — that is what makes it the fallback", () => {
    expect(firstMatchingRule([rule({ name: "any" })], lead())?.name).toBe("any");
  });

  it("takes the first match in priority order, not the best one", () => {
    const rules = [
      rule({ id: "a", name: "specific", priority: 10, sources: ["BAYUT"] }),
      rule({ id: "b", name: "fallback", priority: 1000 }),
    ];
    expect(firstMatchingRule(rules, lead({ source: "BAYUT" }))?.name).toBe("specific");
    expect(firstMatchingRule(rules, lead({ source: "WHATSAPP_AD" }))?.name).toBe("fallback");
  });

  it("every condition on a rule must match, not any of them", () => {
    const r = rule({ sources: ["BAYUT"], languages: ["ar"] });
    expect(firstMatchingRule([r], lead({ source: "BAYUT", language: "ar" }))).not.toBeNull();
    // Right portal, wrong language.
    expect(firstMatchingRule([r], lead({ source: "BAYUT", language: "en" }))).toBeNull();
  });

  it("a lead with no community cannot match a community rule", () => {
    const r = rule({ communities: ["Dubai Marina"] });
    expect(firstMatchingRule([r], lead({ community: null }))).toBeNull();
    expect(firstMatchingRule([r], lead({ community: "Dubai Marina" }))).not.toBeNull();
  });

  /**
   * The one worth writing down.
   *
   * A first WhatsApp message rarely carries a figure. If an unknown
   * budget were treated as zero, every unqualified enquiry would match
   * the lowest band — so the agent who handles studios would receive
   * every new lead in the brokerage, and it would look like the rotation
   * working.
   */
  it("an unknown budget does not match a band, at either end", () => {
    const floor = rule({ minBudgetFils: 100_000_000n });
    const ceiling = rule({ maxBudgetFils: 100_000_000n });
    expect(firstMatchingRule([floor], lead({ budgetMaxFils: null }))).toBeNull();
    expect(firstMatchingRule([ceiling], lead({ budgetMaxFils: null }))).toBeNull();
  });

  it("a budget inside the band matches and outside it does not", () => {
    const band = rule({ minBudgetFils: 100_000_000n, maxBudgetFils: 500_000_000n });
    expect(firstMatchingRule([band], lead({ budgetMaxFils: 300_000_000n }))).not.toBeNull();
    expect(firstMatchingRule([band], lead({ budgetMaxFils: 90_000_000n }))).toBeNull();
    expect(firstMatchingRule([band], lead({ budgetMaxFils: 600_000_000n }))).toBeNull();
  });

  it("the band is inclusive at both edges", () => {
    const band = rule({ minBudgetFils: 100_000_000n, maxBudgetFils: 500_000_000n });
    expect(firstMatchingRule([band], lead({ budgetMaxFils: 100_000_000n }))).not.toBeNull();
    expect(firstMatchingRule([band], lead({ budgetMaxFils: 500_000_000n }))).not.toBeNull();
  });

  it("a lead with no source cannot match a source rule", () => {
    expect(firstMatchingRule([rule({ sources: ["BAYUT"] })], lead({ source: null }))).toBeNull();
  });
});
