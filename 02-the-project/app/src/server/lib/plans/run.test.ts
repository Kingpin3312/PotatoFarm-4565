import { describe, it, expect } from "vitest";
import { LONG_HORIZON_BUYER, scheduleNext, taskForStep, shouldAdvance, planProblems, describeStep, type Step } from "./run";

describe("taskForStep — every due step ends with a person doing something", () => {
  const base = { planName: "Long horizon buyer", who: "Priya" };

  it("gives a TASK step its own title", () => {
    const t = taskForStep({ ...base, step: LONG_HORIZON_BUYER[3]! });
    expect(t?.title).toMatch(/^Call — they said around now/);
  });

  it("hands a MESSAGE step to the agent, naming the template Meta requires", () => {
    const t = taskForStep({ ...base, step: LONG_HORIZON_BUYER[1]! });
    // Outside the 24-hour window a free-form message is accepted by
    // Meta and never delivered, so the template has to be named.
    expect(t?.title).toBe('Send Priya the "market_note" message');
    expect(t?.body).toContain('approved "market_note" template');
  });

  it("stays silent on CHECK_MATCHES when nothing fits", () => {
    // Silence is a valid outcome. A task that says "nothing to send" is
    // the nurture sequence nobody reads, aimed at the agent instead.
    expect(taskForStep({ ...base, step: LONG_HORIZON_BUYER[0]!, match: null })).toBeNull();
  });

  it("carries the property and a ready draft when something does fit", () => {
    const t = taskForStep({
      ...base, step: LONG_HORIZON_BUYER[0]!,
      match: { title: "3-bed, Dubai Hills", draft: "Priya, something's just come up…" },
    });
    expect(t?.title).toBe("Send Priya 3-bed, Dubai Hills");
    expect(t?.body).toContain("Priya, something's just come up…");
  });

  it("never returns an empty title for a step written without one", () => {
    const bare: Step = { order: 9, afterDays: 1, action: "TASK", taskTitle: "  " };
    expect(taskForStep({ ...base, step: bare })?.title).toBe("Plan step for Priya");
  });
});

describe("scheduleNext — each step waits its own delay", () => {
  const from = new Date("2026-09-01T07:00:00Z");
  const days = (d: Date) => Math.round((d.getTime() - from.getTime()) / 86_400_000);

  it("times the following step by that step's afterDays", () => {
    // Step 1 has just been taken. Step 2 is "30 days after the previous
    // step". The job used to pass the step *before* the one being taken,
    // which found the current step again and used its 14 days instead —
    // every gap in the sequence one step out of place.
    const next = scheduleNext(LONG_HORIZON_BUYER, 1, from);
    expect(next?.step.order).toBe(2);
    expect(days(next!.dueAt)).toBe(30);
  });

  it("has nothing after the last step, so the plan completes when it is taken", () => {
    expect(scheduleNext(LONG_HORIZON_BUYER, 6, from)).toBeNull();
  });
});

describe("shouldAdvance — a reply pauses, and a resume is not undone by it", () => {
  const started = new Date("2026-09-01T07:00:00Z");
  const replied = new Date("2026-09-10T07:00:00Z");
  const now = new Date("2026-09-20T07:00:00Z");
  const base = {
    steps: LONG_HORIZON_BUYER, leadRepliedSince: replied, leadOptedOut: false, leadStatus: "CONTACTED", now,
  };
  const sub = { currentStep: 1, state: "RUNNING" as const, startedAt: started, nextDueAt: new Date("2026-09-15T07:00:00Z") };

  it("pauses on a reply after the plan started", () => {
    const r = shouldAdvance({ ...base, sub });
    expect(r.act).toBe(false);
    expect(!r.act && r.newState).toBe("PAUSED");
  });
  it("carries on after an agent resumes it, although the reply is after it started", () => {
    // Without `resumedAt` the same reply paused it again on the next
    // sweep, so "Resume" did nothing an agent could see.
    const r = shouldAdvance({ ...base, sub: { ...sub, resumedAt: new Date("2026-09-12T07:00:00Z") } });
    expect(r.act).toBe(true);
  });
  it("and pauses again on a new reply after the resume", () => {
    const r = shouldAdvance({
      ...base, leadRepliedSince: new Date("2026-09-13T07:00:00Z"),
      sub: { ...sub, resumedAt: new Date("2026-09-12T07:00:00Z") },
    });
    expect(!r.act && r.newState).toBe("PAUSED");
  });
});

describe("planProblems — a step that would do nothing is refused", () => {
  it("accepts the worked example", () => {
    expect(planProblems(LONG_HORIZON_BUYER)).toEqual([]);
  });
  it("refuses an empty plan", () => {
    expect(planProblems([])).toEqual(["A plan needs at least one step."]);
  });
  it("refuses a message with no template, a task with no words and a same-day step", () => {
    const p = planProblems([
      { order: 1, afterDays: 7, action: "MESSAGE", template: " " },
      { order: 2, afterDays: 7, action: "TASK", taskTitle: "" },
      { order: 3, afterDays: 0, action: "REVIEW" },
    ]);
    expect(p).toHaveLength(3);
    expect(p[0]).toMatch(/^Step 1: name the approved WhatsApp template/);
    expect(p[1]).toMatch(/^Step 2: say what/);
    expect(p[2]).toMatch(/^Step 3: wait between 1 and 365/);
  });
});

describe("describeStep", () => {
  it("says a property is only sent when one fits", () => {
    expect(describeStep(LONG_HORIZON_BUYER[0]!)).toMatch(/only if one does/);
  });
  it("names the template", () => {
    expect(describeStep(LONG_HORIZON_BUYER[1]!)).toBe('You\'re asked to send the "market_note" message');
  });
});
