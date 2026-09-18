import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messagingWindow } from "./whatsapp";

/**
 * The 24-hour window.
 *
 * The single most consequential pure function in the product, because
 * **its failure is silent**. Outside the window Meta accepts a free-form
 * message and never delivers it. Nothing errors, nothing bounces; a
 * brokerage keeps working a pipeline that has gone quiet and concludes
 * the leads were bad.
 *
 * `messagingWindow()` is the single source of truth — the inbox badge
 * and the send path both read it — so a mistake here is wrong in the UI
 * and wrong on the wire at the same time, in agreement, which is the
 * hardest kind to notice.
 *
 * Time is frozen for every case. A test that reads the real clock passes
 * at 14:00 and fails at midnight, and the response to that is to delete
 * the test.
 */
const NOW = new Date("2026-08-10T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("never messaged us", () => {
  /**
   * Closed, not open. A lead who has never sent an inbound message has
   * no window at all, and the dangerous default is the permissive one.
   */
  it("is closed when there is no inbound message", () => {
    expect(messagingWindow(null)).toEqual({ open: false, closesAt: null, hoursLeft: null });
  });
});

describe("inside the window", () => {
  it("is open just after they messaged", () => {
    const w = messagingWindow(hoursAgo(0));
    expect(w.open).toBe(true);
    expect(w.hoursLeft).toBe(24);
  });

  it("counts down in whole hours an agent can act on", () => {
    expect(messagingWindow(hoursAgo(1)).hoursLeft).toBe(23);
    expect(messagingWindow(hoursAgo(12)).hoursLeft).toBe(12);
    expect(messagingWindow(hoursAgo(23)).hoursLeft).toBe(1);
    expect(messagingWindow(hoursAgo(23.5)).hoursLeft).toBe(0);
  });

  /**
   * Floor, not round. With 30 minutes left, "1 hour left" invites an
   * agent to go and do something else first. "0" is the honest number
   * and the window is still open, which the boolean says.
   */
  it("floors the remaining hours rather than rounding up", () => {
    const w = messagingWindow(new Date(NOW.getTime() - 23.5 * 3_600_000));
    expect(w.open).toBe(true);
    expect(w.hoursLeft).toBe(0);
  });

  it("reports when it closes, not just that it is open", () => {
    const last = hoursAgo(5);
    expect(messagingWindow(last).closesAt?.getTime())
      .toBe(last.getTime() + 24 * 3_600_000);
  });
});

describe("the boundary", () => {
  /**
   * Exactly 24 hours is **closed**. The comparison is `msLeft > 0`, and
   * that direction is deliberate: at the boundary Meta's answer is the
   * one that matters, and being a second early costs a template message
   * while being a second late costs a delivery nobody knows was lost.
   */
  it("is closed at exactly twenty-four hours", () => {
    const w = messagingWindow(hoursAgo(24));
    expect(w.open).toBe(false);
    expect(w.hoursLeft).toBe(0);
  });

  it("is open one second before", () => {
    expect(messagingWindow(new Date(NOW.getTime() - 24 * 3_600_000 + 1000)).open).toBe(true);
  });

  it("is closed one second after", () => {
    expect(messagingWindow(new Date(NOW.getTime() - 24 * 3_600_000 - 1000)).open).toBe(false);
  });
});

describe("long past the window", () => {
  it("reports zero rather than a negative count", () => {
    const w = messagingWindow(hoursAgo(200));
    expect(w.open).toBe(false);
    expect(w.hoursLeft).toBe(0);
  });

  /**
   * `closesAt` stays populated on a closed window on purpose — the UI
   * says when it lapsed, which is what an agent needs to judge whether
   * to send a template or to let it lie.
   */
  it("still says when it closed", () => {
    expect(messagingWindow(hoursAgo(200)).closesAt).toBeInstanceOf(Date);
  });
});

describe("a future timestamp does not open a wider window", () => {
  /**
   * Clock skew between Meta's servers and ours is real. An inbound
   * stamped slightly in the future must not be readable as more than 24
   * hours of runway.
   */
  it("caps the runway at twenty-four hours", () => {
    const skewed = new Date(NOW.getTime() + 60_000);
    const w = messagingWindow(skewed);
    expect(w.open).toBe(true);
    expect(w.hoursLeft).toBeLessThanOrEqual(24);
  });
});
