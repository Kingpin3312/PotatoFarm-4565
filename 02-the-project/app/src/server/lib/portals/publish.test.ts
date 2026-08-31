import { describe, it, expect } from "vitest";
import { dueForRetry, backoffMinutes, MAX_ATTEMPTS } from "./publish";

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
