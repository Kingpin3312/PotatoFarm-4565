import { describe, expect, it } from "vitest";
import { RISK_LABEL, assessRisk, type RiskInput } from "./risk";

/**
 * Deal risk.
 *
 * A deal is the part of this business where being wrong costs the most,
 * and the failure is the familiar one: **nothing errors.** A transfer
 * that will not complete on time looks exactly like one that will, right
 * up until the day it does not, and by then the renegotiation that would
 * have been calm in week two is a crisis in week six.
 *
 * So the rules pinned here are the ones that decide whether an agent is
 * told at all.
 */

const NOW = new Date("2026-08-10T12:00:00.000Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

const base: RiskInput = {
  reference: "PF-2042",
  stage: "MOU_SIGNED",
  financing: "CASH",
  sellerHasMortgage: false,
  contractualCompletionAt: null,
  completed: ["AGREED", "MOU_SIGNED"],
  blocked: [],
  daysSinceContact: 0,
  counterparty: "James Whitfield",
};
const risk = (over: Partial<RiskInput> = {}) => assessRisk({ ...base, ...over }, NOW);

describe("a deal with no agreed completion date", () => {
  /**
   * Assessable on silence and blockers, which is most of the value, and
   * silent on time — because saying nothing is better than inventing a
   * deadline and then reporting against it.
   */
  it("is not judged late for a date nobody agreed", () => {
    const r = risk({ contractualCompletionAt: null });
    expect(r.level).toBe("HEALTHY");
    expect(r.reason).toContain("nothing to be late for");
  });

  it("is still judged on silence", () => {
    expect(risk({ contractualCompletionAt: null, daysSinceContact: 30 }).level).toBe("AT_RISK");
  });

  it("is still judged on a blocker", () => {
    const r = risk({
      contractualCompletionAt: null,
      blocked: [{ stage: "NOC_APPLIED", reason: "Developer wants the service charge cleared" }],
    });
    expect(r.level).toBe("AT_RISK");
  });
});

describe("a blocker somebody actually wrote down", () => {
  /**
   * `DealMilestone.blockedReason` existed since the model was written
   * and nothing read it. An agent recording a blocker that no screen and
   * no score ever looks at is worse than no field at all: they believe
   * they have reported it.
   */
  it("is at risk, and quotes the reason they gave", () => {
    const r = risk({
      blocked: [{ stage: "NOC_APPLIED", reason: "Developer wants the service charge cleared" }],
    });
    expect(r.level).toBe("AT_RISK");
    expect(r.reason).toBe("Blocked: Developer wants the service charge cleared");
  });

  it("gives the agent something to do about it, naming the deal", () => {
    const r = risk({ blocked: [{ stage: "NOC_APPLIED", reason: "Service charge" }] });
    expect(r.action?.headline).toBe("Clear the block on PF-2042");
  });
});

describe("silence", () => {
  /**
   * A week is when an agent should notice; a fortnight is a problem
   * whatever the calendar says. Deliberately not scaled to the
   * completion date — a buyer going quiet is the same signal whether
   * completion is in one week or six.
   */
  it("is healthy while they are still talking", () => {
    expect(risk({ daysSinceContact: 6 }).level).toBe("HEALTHY");
  });

  it("needs attention at a week", () => {
    const r = risk({ daysSinceContact: 7 });
    expect(r.level).toBe("WATCH");
    expect(r.reason).toContain("James Whitfield");
  });

  it("is at risk at a fortnight", () => {
    const r = risk({ daysSinceContact: 14 });
    expect(r.level).toBe("AT_RISK");
    expect(r.reason).toContain("14 days");
  });

  it("says 'the buyer' when nobody is named", () => {
    expect(risk({ daysSinceContact: 20, counterparty: null }).reason).toContain("the buyer");
  });

  /**
   * Never contacted is not the same as gone quiet. A deal agreed this
   * morning has no contact history and must not read as abandoned.
   */
  it("does not treat an unknown last contact as silence", () => {
    expect(risk({ daysSinceContact: null }).level).toBe("HEALTHY");
  });

  it("calls, rather than sending another message", () => {
    expect(risk({ daysSinceContact: 10 }).action?.kind).toBe("CALL");
  });
});

describe("money that should be in and is not", () => {
  /**
   * Past the deposit stage with no deposit recorded is where the stage
   * field and reality most often disagree, because moving a card is
   * easier than chasing a transfer.
   */
  it("catches a deal that moved past the deposit without one", () => {
    const r = risk({
      stage: "MORTGAGE_APPLIED",
      completed: ["AGREED", "MOU_SIGNED"],          // no DEPOSIT_PAID
    });
    expect(r.level).toBe("AT_RISK");
    expect(r.factors.join(" ")).toContain("deposit is not recorded as paid");
  });

  it("says nothing when the deposit is recorded", () => {
    const r = risk({
      stage: "MORTGAGE_APPLIED",
      completed: ["AGREED", "MOU_SIGNED", "DEPOSIT_PAID"],
    });
    expect(r.factors.join(" ")).not.toContain("deposit");
  });

  it("says nothing before the deal has reached that point", () => {
    expect(risk({ stage: "MOU_SIGNED", completed: ["AGREED"] }).factors.join(" "))
      .not.toContain("deposit");
  });
});

describe("the level only ever goes up", () => {
  /**
   * `raise()` never downgrades. A deal with a blocker *and* a healthy
   * timeline is at risk — the good news must not cancel the bad, which
   * is exactly what an average would do.
   */
  it("keeps the worst finding when several apply", () => {
    const r = risk({
      daysSinceContact: 8,                                    // WATCH
      blocked: [{ stage: "NOC_APPLIED", reason: "Stuck" }],   // AT_RISK
    });
    expect(r.level).toBe("AT_RISK");
    expect(r.factors.length).toBeGreaterThanOrEqual(2);
  });

  it("leads with the worst one", () => {
    const r = risk({
      daysSinceContact: 8,
      blocked: [{ stage: "NOC_APPLIED", reason: "Stuck" }],
    });
    expect(r.reason).toBe("Blocked: Stuck");
  });
});

describe("one action, or none", () => {
  /**
   * Same discipline as the lead engine: the point is to choose, not to
   * list. A recommendation attached to every deal every day is a list
   * nobody reads by Friday.
   */
  it("gives a healthy deal nothing to do", () => {
    expect(risk().action).toBeNull();
  });

  it("gives every unhealthy deal exactly one thing to do", () => {
    for (const over of [
      { daysSinceContact: 20 },
      { blocked: [{ stage: "NOC_APPLIED" as const, reason: "Stuck" }] },
      { stage: "MORTGAGE_APPLIED" as const, completed: ["AGREED" as const] },
    ]) {
      const r = risk(over);
      expect(r.level).not.toBe("HEALTHY");
      expect(r.action).not.toBeNull();
      expect(r.action?.headline).toContain("PF-2042");
    }
  });

  /**
   * A blocker outranks silence. Both are true at once often enough that
   * the order matters: ringing somebody about a deal stuck on a document
   * wastes the call.
   */
  it("prefers clearing a block over making a call", () => {
    const r = risk({
      daysSinceContact: 20,
      blocked: [{ stage: "NOC_APPLIED", reason: "Stuck" }],
    });
    expect(r.action?.kind).toBe("FOLLOW_UP");
    expect(r.action?.headline).toContain("Clear the block");
  });
});

describe("the label is a word, not a colour", () => {
  /**
   * Load-bearing since the palette lost its green and red: these three
   * strings are now the only thing distinguishing the states in the UI.
   */
  it("has a plain-English label for every level", () => {
    expect(RISK_LABEL.HEALTHY).toBe("on track");
    expect(RISK_LABEL.WATCH).toBe("needs attention");
    expect(RISK_LABEL.AT_RISK).toBe("at risk");
  });
});

describe("a real completion date brings the arithmetic in", () => {
  it("is at risk when the date cannot be met", () => {
    const r = risk({
      contractualCompletionAt: inDays(2),
      financing: "MORTGAGE",
      sellerHasMortgage: true,
      completed: ["AGREED"],
    });
    expect(r.level).toBe("AT_RISK");
    expect(r.action?.kind).toBe("NEGOTIATE");
  });

  /**
   * Not "chase harder". The arithmetic says it cannot be done, and the
   * useful move is to renegotiate the date while there is still time to
   * do it calmly.
   */
  it("tells the agent to renegotiate rather than to push", () => {
    const r = risk({
      contractualCompletionAt: inDays(2),
      financing: "MORTGAGE",
      sellerHasMortgage: true,
      completed: ["AGREED"],
    });
    expect(r.action?.headline).toContain("Agree a new completion date");
  });

  it("is comfortable with a date far enough out", () => {
    expect(risk({ contractualCompletionAt: inDays(180), financing: "CASH" }).level)
      .toBe("HEALTHY");
  });
});
