import { describe, it, expect } from "vitest";
import { dueForRetry, backoffMinutes, MAX_ATTEMPTS, needsWithdrawal } from "./publish";

/**
 * The retry policy for sending a listing to a portal.
 *
 * Worth testing away from the database because the mistakes here are
 * quiet and expensive in both directions. Too eager and we hammer a
 * portal with a payload it has already refused, which is how a partner
 * agreement ends. Too reluctant and a brokerage's listing sits invisible
 * while a competitor's identical unit takes the enquiries.
 *
 * The distinction the whole policy rests on: a **rejection** is a portal
 * deciding, and retrying it changes nothing. A **transport failure** is
 * nobody deciding anything, and retrying is the only thing that helps.
 */

const at = (mins: number) => new Date(Date.UTC(2026, 0, 1, 0, mins));
const NOW = at(1000);

describe("dueForRetry", () => {
  it("sends anything still PENDING", () => {
    expect(dueForRetry({ state: "PENDING", attempts: 0, lastTriedAt: null }, NOW)).toBe(true);
  });

  it("never re-sends something the portal rejected", () => {
    // The portal looked at it and said no. A person has to change the
    // listing; sending the same payload again is useless and rude.
    expect(dueForRetry({ state: "REJECTED", attempts: 1, lastTriedAt: at(0) }, NOW)).toBe(false);
  });

  it("never re-sends something already live", () => {
    expect(dueForRetry({ state: "PUBLISHED", attempts: 1, lastTriedAt: at(0) }, NOW)).toBe(false);
  });

  it("never re-sends something deliberately withdrawn", () => {
    expect(dueForRetry({ state: "WITHDRAWN", attempts: 1, lastTriedAt: at(0) }, NOW)).toBe(false);
  });

  /**
   * The case that only bites weeks later.
   *
   * A NOT_CONNECTED row is waiting on a portal integration being
   * registered. If it were treated like FAILED it would spend an
   * attempt every sweep and stop for ever after six — so on the day the
   * agreement is signed and the adapter ships, every listing queued
   * before that day would sit past its ceiling and never be sent. The
   * brokerage would see nothing appear and no error anywhere, which is
   * this codebase's signature failure.
   */
  it("keeps sending an unconnected listing back, past the attempt ceiling", () => {
    expect(dueForRetry({ state: "NOT_CONNECTED", attempts: 0, lastTriedAt: null }, NOW)).toBe(true);
    // Well beyond MAX_ATTEMPTS, and still due — the condition that
    // clears this is a deployment, not the passage of time.
    expect(
      dueForRetry({ state: "NOT_CONNECTED", attempts: MAX_ATTEMPTS + 40, lastTriedAt: at(0) }, NOW),
    ).toBe(true);
    // And with no backoff: a registry lookup costs nothing, so there is
    // no reason to make a connected portal wait ten minutes.
    expect(
      dueForRetry({ state: "NOT_CONNECTED", attempts: 3, lastTriedAt: at(999) }, NOW),
    ).toBe(true);
  });

  it("retries a transport failure once the backoff has elapsed", () => {
    // attempts: 1 → 10 minutes. NOW is at(1000), so at(995) is five
    // minutes ago and at(990) is exactly ten.
    expect(dueForRetry({ state: "FAILED", attempts: 1, lastTriedAt: at(995) }, NOW)).toBe(false);
    expect(dueForRetry({ state: "FAILED", attempts: 1, lastTriedAt: at(990) }, NOW)).toBe(true);
  });

  it("waits longer after each successive failure", () => {
    // attempts: 3 → 120 minutes, so 30 minutes ago is far too soon.
    expect(dueForRetry({ state: "FAILED", attempts: 3, lastTriedAt: at(970) }, NOW)).toBe(false);
    expect(dueForRetry({ state: "FAILED", attempts: 3, lastTriedAt: at(880) }, NOW)).toBe(true);
  });

  it("gives up at the attempt ceiling rather than retrying for ever", () => {
    // A row that retries for ever is a row nobody ever looks at.
    expect(dueForRetry(
      { state: "FAILED", attempts: MAX_ATTEMPTS, lastTriedAt: at(0) }, NOW,
    )).toBe(false);
  });

  it("tries a failed row that has somehow never been tried", () => {
    expect(dueForRetry({ state: "FAILED", attempts: 0, lastTriedAt: null }, NOW)).toBe(true);
  });
});

describe("backoffMinutes", () => {
  it("does not delay the first attempt", () => {
    expect(backoffMinutes(0)).toBe(0);
  });

  it("increases with each attempt", () => {
    const steps = [0, 1, 2, 3, 4, 5].map(backoffMinutes);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
    }
  });

  it("is capped, so a portal outage does not push retries into next year", () => {
    expect(backoffMinutes(99)).toBe(backoffMinutes(5));
    expect(backoffMinutes(99)).toBeLessThanOrEqual(720);
  });
});

/**
 * Taking an advertisement down.
 *
 * Read from the listing's own status rather than a flag beside the
 * publication, so a brokerage marking a unit SOLD means it everywhere.
 * The failure this prevents is specific: a sold villa still live on
 * Bayut, which is the buyer ringing about a unit that went last month
 * and the owner asking why it is still being marketed.
 */
describe("needsWithdrawal", () => {
  it("pulls a live advertisement once the property is sold", () => {
    expect(needsWithdrawal({ state: "PUBLISHED" }, "SOLD")).toBe(true);
  });

  it("pulls it when a rental is let", () => {
    expect(needsWithdrawal({ state: "PUBLISHED" }, "LET")).toBe(true);
  });

  it("pulls it when the instruction is withdrawn", () => {
    expect(needsWithdrawal({ state: "PUBLISHED" }, "WITHDRAWN")).toBe(true);
  });

  it("leaves an available property advertised", () => {
    expect(needsWithdrawal({ state: "PUBLISHED" }, "AVAILABLE")).toBe(false);
  });

  it("leaves a property under offer advertised", () => {
    // Under offer is not sold. Deals collapse, and pulling the advert
    // the moment an offer is accepted costs the fallback buyer.
    expect(needsWithdrawal({ state: "PUBLISHED" }, "UNDER_OFFER")).toBe(false);
  });

  it("does nothing to a publication that was never live", () => {
    for (const state of ["PENDING", "FAILED", "REJECTED", "WITHDRAWN"]) {
      expect(needsWithdrawal({ state }, "SOLD")).toBe(false);
    }
  });
});
