import { describe, expect, it } from "vitest";
import { MOVEMENT_THRESHOLD, movement, scoreLead, type ScoreInput } from "./score";

/**
 * Lead scoring.
 *
 * Rules, not a model, and the weights are the thing to fit once there
 * are enough outcomes to learn from. Until then the shape is the
 * product decision, and these pin the shape.
 *
 * Why this is worth testing at all: **every wrong answer here is
 * plausible.** A mis-scored lead still appears in the list, still has a
 * number beside it, and still gets worked — it is just worked in the
 * wrong order, and nobody can tell by looking. There is no crash to
 * find and no empty screen to notice.
 */

const NOW = new Date("2026-08-10T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

/** A deliberately unremarkable lead. Each test moves one thing. */
const base: ScoreInput = {
  createdAt: daysAgo(30),
  lastInboundAt: daysAgo(5),
  lastOutboundAt: daysAgo(5),
  inboundCount: 2,
  outboundCount: 2,
  status: "ACTIVE",
  intent: null,
  timeframe: null,
  budgetMaxFils: null,
  requirementCount: 0,
  viewingCount: 0,
  attendedCount: 0,
  offerCount: 0,
  book: null,
};
const score = (over: Partial<ScoreInput> = {}) => scoreLead({ ...base, ...over }, NOW);

describe("a new lead is not a cold lead", () => {
  /**
   * The bug this guards. Someone who has never replied was scored the
   * same whether the enquiry arrived an hour ago or a month ago, so
   * every brand new enquiry sank to the bottom of the list — which is
   * the one thing this product exists to stop.
   */
  it("scores an enquiry from today far above one from last month", () => {
    const fresh = score({ createdAt: daysAgo(0.2), lastInboundAt: null });
    const stale = score({ createdAt: daysAgo(30), lastInboundAt: null });
    expect(fresh.recency).toBeGreaterThan(stale.recency);
    expect(fresh.recency).toBe(15);
    expect(stale.recency).toBe(2);
  });

  it("says which it is, in words", () => {
    expect(score({ createdAt: daysAgo(0.2), lastInboundAt: null }).drivers)
      .toContain("brand new, no reply yet");
    expect(score({ createdAt: daysAgo(30), lastInboundAt: null }).drivers)
      .toContain("never replied");
  });
});

describe("recency decays rather than stepping", () => {
  /**
   * A decay, not buckets. Buckets drop a lead nine points overnight
   * because a clock passed midnight, and an agent who sees that once
   * stops trusting the number.
   */
  it("never moves more between two adjacent days than a bucket would", () => {
    let previous = score({ lastInboundAt: daysAgo(0) }).recency;
    for (let d = 1; d <= 30; d++) {
      const current = score({ lastInboundAt: daysAgo(d) }).recency;
      expect(previous - current).toBeLessThanOrEqual(3);
      expect(current).toBeLessThanOrEqual(previous);
      previous = current;
    }
  });

  it("is at its highest the day they message", () => {
    expect(score({ lastInboundAt: daysAgo(0) }).recency).toBe(25);
  });
});

describe("engagement counts effort, not chatter", () => {
  /**
   * Anyone can send a message. Turning up to a viewing in Dubai traffic
   * is a decision, and an offer is a bigger one.
   */
  it("weights an attended viewing above a message", () => {
    const talked = score({ inboundCount: 4 });
    const attended = score({ attendedCount: 2 });
    expect(attended.engagement).toBeGreaterThan(talked.engagement);
  });

  it("weights an offer above any other single signal", () => {
    // Per unit: offer 5, requirement 3, attended viewing 3, message 2.
    const one = (over: Partial<ScoreInput>) =>
      score({ inboundCount: 0, ...over }).engagement;
    expect(one({ offerCount: 1 })).toBeGreaterThan(one({ attendedCount: 1 }));
    expect(one({ attendedCount: 1 })).toBeGreaterThan(one({ inboundCount: 1 }));
  });

  /**
   * Pinned as it is, not as it arguably should be.
   *
   * Per unit an offer is the strongest signal in the set, but its **cap
   * is the lowest** — 5, against 8 for inbound messages — so ten
   * messages score higher on this component than one offer does. That
   * reads oddly next to "weighted towards things that cost them effort".
   *
   * It is left alone on purpose. score.ts says the weights are the thing
   * to fit once there are enough outcomes to learn from, so changing
   * them is a product decision and not a tidy-up. It matters less than
   * it looks, because an offer normally moves the lead to NEGOTIATING,
   * which pins the intent component to its maximum. This test exists so
   * that if somebody does change it, they change it deliberately.
   */
  it("currently caps offers lower than messages — a known oddity", () => {
    expect(score({ inboundCount: 10, offerCount: 0 }).engagement)
      .toBeGreaterThan(score({ inboundCount: 0, offerCount: 1 }).engagement);
  });

  it("does not let one signal run away with the whole score", () => {
    // Fifty messages is not twenty-five points of engagement.
    expect(score({ inboundCount: 50 }).engagement).toBeLessThanOrEqual(25);
  });

  it("names the strongest thing they did", () => {
    expect(score({ offerCount: 1, attendedCount: 2 }).drivers).toContain("1 offer made");
    expect(score({ attendedCount: 2 }).drivers).toContain("2 viewings attended");
    expect(score({ viewingCount: 1 }).drivers).toContain("viewing booked");
  });
});

describe("chased and silent is its own state", () => {
  /**
   * Not a penalty dressed up — it is the state an agent most needs to
   * see, because the right move is to stop rather than to send a fifth
   * message.
   */
  it("marks a lead we have chased that has gone quiet", () => {
    const chased = score({
      inboundCount: 1, outboundCount: 5,
      lastInboundAt: daysAgo(20), lastOutboundAt: daysAgo(2),
    });
    expect(chased.drivers).toContain("4 messages unanswered");
  });

  /**
   * Only when *we* spoke last. If they replied after our messages, an
   * unanswered count is an artefact of counting, not a signal.
   */
  it("does not mark it when they replied after we did", () => {
    const replied = score({
      inboundCount: 1, outboundCount: 5,
      lastInboundAt: daysAgo(1), lastOutboundAt: daysAgo(4),
    });
    expect(replied.drivers.join(" ")).not.toContain("unanswered");
  });
});

describe("intent, and the two statuses that override it", () => {
  it("reads their own words about timing", () => {
    expect(score({ timeframe: "ASAP" }).drivers).toContain("says it is urgent");
    expect(score({ timeframe: "within a few weeks" }).drivers).toContain("moving within weeks");
    expect(score({ timeframe: "sometime next year" }).drivers).toContain("no rush stated");
  });

  it("ranks urgency above a vague timeframe", () => {
    expect(score({ timeframe: "urgent" }).intent)
      .toBeGreaterThan(score({ timeframe: "next year" }).intent);
  });

  /**
   * Negotiating is the top of the scale regardless of what else is
   * missing. Somebody at this point is not a maybe.
   */
  it("pins a negotiating lead at the maximum", () => {
    const s = score({ status: "NEGOTIATING", intent: null, timeframe: null });
    expect(s.intent).toBe(25);
    expect(s.drivers[0]).toBe("negotiating");
  });

  /**
   * And unresponsive caps it, no matter how urgent they once said it
   * was. What somebody said in March does not survive silence in August.
   */
  it("caps an unresponsive lead however urgent they claimed to be", () => {
    expect(score({ status: "UNRESPONSIVE", intent: "BUY_TO_LIVE", timeframe: "ASAP" }).intent)
      .toBeLessThanOrEqual(5);
  });
});

describe("budget fit is about the book, not about wealth", () => {
  const book = { minFils: 240_000_000n, maxFils: 1_150_000_000n };   // AED 2.4m–11.5m

  it("gives full marks to a budget the book can actually serve", () => {
    expect(score({ budgetMaxFils: 500_000_000n, book }).budgetFit).toBe(25);
  });

  /**
   * The bug that named this field. Against a book of 2.4m, 3.1m and
   * 11.5m the *median* is 3.1m — so a buyer with a live 17.6m offer on a
   * property we hold scored 6 out of 25 for "budget well above your
   * usual stock". The median describes the middle of the book; the
   * question is whether the book holds anything they could buy, and
   * that is a range.
   */
  it("does not punish a buyer the top of the book can serve", () => {
    const s = score({ budgetMaxFils: 1_760_000_000n, book });   // AED 17.6m
    expect(s.budgetFit).toBeGreaterThanOrEqual(16);
    expect(s.drivers).not.toContain("budget above anything you hold");
  });

  it("does shade down someone far above everything held", () => {
    const s = score({ budgetMaxFils: 6_000_000_000n, book });    // AED 60m
    expect(s.budgetFit).toBe(8);
    expect(s.drivers).toContain("budget above anything you hold");
  });

  it("shades down someone far below the cheapest thing", () => {
    const s = score({ budgetMaxFils: 50_000_000n, book });       // AED 500k
    expect(s.budgetFit).toBe(6);
    expect(s.drivers).toContain("budget below what you list");
  });

  /**
   * Unknown is not bad. Scoring a missing budget as zero quietly buries
   * an otherwise hot lead — and the budget is the thing the agent should
   * go and ask for, which is why it becomes a driver.
   */
  it("treats a missing budget as the midpoint and says so", () => {
    const s = score({ budgetMaxFils: null, book });
    expect(s.budgetFit).toBe(12);
    expect(s.drivers).toContain("no budget on file");
  });

  it("is neutral for a brokerage with no book yet", () => {
    expect(score({ budgetMaxFils: 500_000_000n, book: null }).budgetFit).toBe(15);
  });
});

describe("the total", () => {
  it("is a whole number between 0 and 100", () => {
    for (const s of [score(), score({ status: "NEGOTIATING", offerCount: 2 }), score({ lastInboundAt: daysAgo(400) })]) {
      expect(Number.isInteger(s.total)).toBe(true);
      expect(s.total).toBeGreaterThanOrEqual(0);
      expect(s.total).toBeLessThanOrEqual(100);
    }
  });

  it("is the four components added up", () => {
    const s = score({ status: "NEGOTIATING", offerCount: 1, budgetMaxFils: null });
    expect(s.total).toBe(s.recency + s.engagement + s.intent + s.budgetFit);
  });

  /** Four is what fits on a line an agent reads at a glance. */
  it("never shows more than four drivers", () => {
    const s = score({
      status: "NEGOTIATING", timeframe: "ASAP", offerCount: 2, attendedCount: 3,
      inboundCount: 1, outboundCount: 9, lastInboundAt: daysAgo(30), lastOutboundAt: daysAgo(1),
      budgetMaxFils: null,
    });
    expect(s.drivers.length).toBeLessThanOrEqual(4);
  });
});

describe("movement is only reported when it means something", () => {
  it("says nothing without a previous score", () => {
    expect(movement(80, null)).toBeNull();
  });

  /**
   * Eight points. Below that a score wobbles on arithmetic — a day
   * passing moves recency on its own — and reporting that as movement
   * is noise an agent learns to ignore.
   */
  it("says nothing about a wobble", () => {
    expect(movement(80, 80 - (MOVEMENT_THRESHOLD - 1))).toBeNull();
    expect(movement(80, 80 + (MOVEMENT_THRESHOLD - 1))).toBeNull();
  });

  it("reports a real rise and a real fall, with the number", () => {
    expect(movement(80, 70)).toBe("warming — up 10 points this week");
    expect(movement(70, 80)).toBe("cooling — down 10 points this week");
  });
});
