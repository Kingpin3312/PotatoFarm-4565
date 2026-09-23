import { describe, it, expect } from "vitest";
import { LONG_HORIZON_BUYER, scheduleNext, taskForStep, type Step } from "./run";

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
