import { describe, expect, it } from "vitest";
import { openAt, type HoursRow } from "./open";

// Sunday to Thursday 09:00–19:00, Friday 14:30–19:00, Saturday closed.
const week: HoursRow[] = [
  ...[0, 1, 2, 3, 4].map((d) => ({ dayOfWeek: d, startMin: 540, endMin: 1140, closed: false })),
  { dayOfWeek: 5, startMin: 870, endMin: 1140, closed: false },
  { dayOfWeek: 6, startMin: 600, endMin: 1080, closed: true },
];
// Dubai is UTC+4 all year. 2026-09-28 is a Monday.
const dubai = (iso: string) => new Date(`${iso}+04:00`);

describe("openAt", () => {
  it("is open inside the day's hours, by the brokerage's clock", () => {
    expect(openAt(week, dubai("2026-09-28T09:00:00"), "Asia/Dubai")).toBe(true);
    expect(openAt(week, dubai("2026-09-28T18:59:00"), "Asia/Dubai")).toBe(true);
  });
  it("is closed at the end minute and before the start", () => {
    expect(openAt(week, dubai("2026-09-28T19:00:00"), "Asia/Dubai")).toBe(false);
    expect(openAt(week, dubai("2026-09-28T08:59:00"), "Asia/Dubai")).toBe(false);
  });
  it("is closed after midnight, not open by the UTC date", () => {
    // 01:00 Tuesday in Dubai is still Monday 21:00 in UTC.
    expect(openAt(week, dubai("2026-09-29T01:00:00"), "Asia/Dubai")).toBe(false);
  });
  it("keeps Friday morning closed and opens after prayers", () => {
    expect(openAt(week, dubai("2026-10-02T11:00:00"), "Asia/Dubai")).toBe(false);
    expect(openAt(week, dubai("2026-10-02T15:00:00"), "Asia/Dubai")).toBe(true);
  });
  it("treats a day marked closed as closed all day", () => {
    expect(openAt(week, dubai("2026-10-03T12:00:00"), "Asia/Dubai")).toBe(false);
  });
  it("treats a day with no row as closed", () => {
    expect(openAt(week.filter((r) => r.dayOfWeek !== 1), dubai("2026-09-28T12:00:00"), "Asia/Dubai")).toBe(false);
  });
  it("says it does not know when there are no hours at all", () => {
    expect(openAt([], dubai("2026-09-28T12:00:00"), "Asia/Dubai")).toBeNull();
  });
});
