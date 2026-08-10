import { describe, expect, it } from "vitest";
import { sendableAt } from "./buyers";

/**
 * When a buyer may be messaged.
 *
 * This exists because of a bug found by looking at the screen at the
 * wrong time of day. At 23:38 Dubai the "who wants this property" panel
 * said **nobody could be contacted** — every match greyed out, no
 * explanation an agent could act on. The rule was right (do not message
 * a stranger at midnight) and the presentation was wrong: it answered
 * "can I send this now" when the useful question is "when can I send
 * this".
 *
 * So contactability is judged at the *next permitted send time*, and the
 * panel says "in the morning" instead of "no".
 *
 * Dubai does not observe daylight saving, which is why UTC+4 arithmetic
 * is safe to assert against here. The implementation still steps hour by
 * hour rather than computing the offset, because the same function has
 * a `timeZone` argument and somebody will one day pass a zone that does.
 */

/** Dubai is UTC+4 year-round. 09:00 local is 05:00Z. */
const dubai = (hhmm: string) => new Date(`2026-08-10T${hhmm}:00.000Z`);

describe("inside working hours it is sendable now", () => {
  it.each([
    ["05:00Z", "09:00 Dubai, the first permitted hour"],
    ["09:00Z", "13:00 Dubai, the middle of the day"],
    ["15:59Z", "19:59 Dubai, the last permitted minute"],
  ])("%s — %s", (z) => {
    const now = dubai(z.replace("Z", ""));
    const r = sendableAt(now);
    expect(r.outsideHours).toBe(false);
    expect(r.at.getTime()).toBe(now.getTime());
  });
});

describe("outside working hours it defers to the morning", () => {
  it.each([
    ["16:00Z", "20:00 Dubai — 8pm is already too late"],
    ["19:38Z", "23:38 Dubai — the case that found this bug"],
    ["21:00Z", "01:00 Dubai, the middle of the night"],
    ["04:59Z", "08:59 Dubai, one minute before the window opens"],
  ])("%s — %s", (z) => {
    const r = sendableAt(dubai(z.replace("Z", "")));
    expect(r.outsideHours).toBe(true);
  });

  /**
   * Ten in the morning, not nine. The window opens at nine; the deferred
   * send waits an hour past it so a batch does not land the moment an
   * agent's day starts.
   */
  it("lands at 10:00 Dubai", () => {
    const r = sendableAt(dubai("19:38"));                 // 23:38 Dubai
    expect(r.at.getUTCHours()).toBe(6);                   // 10:00 Dubai
  });

  it("is always in the future, never in the past", () => {
    for (const z of ["16:00", "19:38", "21:00", "23:59", "00:30", "04:59"]) {
      const now = dubai(z);
      expect(sendableAt(now).at.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  /**
   * Late evening must roll to *tomorrow* morning, not back to this
   * morning. Getting this backwards would schedule a send in the past,
   * which a queue either fires immediately — at midnight, to a stranger
   * — or drops.
   */
  it("rolls past midnight to the next day", () => {
    const late = dubai("19:38");                          // 23:38 on the 10th
    expect(sendableAt(late).at.getUTCDate()).toBe(11);
  });

  it("does not roll a day when it is already past midnight", () => {
    const small = dubai("21:00");                         // 01:00 on the 11th
    const r = sendableAt(small);
    expect(r.at.getUTCDate()).toBe(11);                   // later the same Dubai day
    expect(r.at.getUTCHours()).toBe(6);
  });
});

describe("the boundaries are exact", () => {
  it("opens at 09:00 and not 08:59", () => {
    expect(sendableAt(dubai("04:59")).outsideHours).toBe(true);
    expect(sendableAt(dubai("05:00")).outsideHours).toBe(false);
  });

  it("closes at 20:00 and not 20:01", () => {
    expect(sendableAt(dubai("15:59")).outsideHours).toBe(false);
    expect(sendableAt(dubai("16:00")).outsideHours).toBe(true);
  });
});

describe("another timezone", () => {
  /**
   * The argument exists, so it has to work. A brokerage in London gets
   * London hours, not Dubai's shifted by four.
   */
  it("uses the zone it was given", () => {
    // 09:00 UTC is 10:00 London (BST) — inside hours there, 13:00 in
    // Dubai which is also inside, so pick a time where they disagree.
    // 04:00Z is 05:00 London (too early) and 08:00 Dubai (also early).
    // 17:00Z is 18:00 London (fine) and 21:00 Dubai (too late).
    const t = new Date("2026-08-10T17:00:00.000Z");
    expect(sendableAt(t, "Europe/London").outsideHours).toBe(false);
    expect(sendableAt(t, "Asia/Dubai").outsideHours).toBe(true);
  });
});
