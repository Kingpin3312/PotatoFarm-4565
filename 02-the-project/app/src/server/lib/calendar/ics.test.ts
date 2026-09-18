import { describe, expect, it } from "vitest";
import { buildIcs, type CalendarViewing } from "./ics";

/**
 * The calendar feed.
 *
 * Every failure mode here is **silent**. Apple Calendar and Google both
 * respond to a malformed feed by showing an empty calendar — no error,
 * no warning, nothing in any log we own. An agent subscribes, sees
 * nothing, assumes there is nothing, and misses a viewing.
 *
 * So the four things that actually break feeds are asserted directly
 * rather than trusted: line endings, octet folding, TEXT escaping, and a
 * UID stable across refreshes.
 */

const NOW = new Date("2026-08-10T09:00:00.000Z");

const base: CalendarViewing = {
  id: "vw_1",
  scheduledAt: new Date("2026-08-11T06:00:00.000Z"),   // 10:00 Dubai
  durationMins: 30,
  address: "Marina Gate 2",
  building: "Tower B",
  accessNote: null,
  status: "SCHEDULED",
  updatedAt: new Date("2026-08-10T08:00:00.000Z"),
  leadName: "Rajesh Menon",
  leadPhone: "+971 50 448 2211",
  listingReference: "PF-2042",
};
const ics = (over: Partial<CalendarViewing> = {}, name = "Viewings") =>
  buildIcs([{ ...base, ...over }], { name, now: NOW });

describe("the envelope", () => {
  it("is a calendar a client will open", () => {
    const s = ics();
    expect(s.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(s.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(s).toContain("VERSION:2.0");
    expect(s).toContain("METHOD:PUBLISH");
  });

  /**
   * CRLF, everywhere. A bare `\n` is the single commonest reason a
   * hand-rolled feed imports as an empty calendar.
   */
  it("uses CRLF on every line and never a bare newline", () => {
    const s = ics();
    expect(s.split("\r\n").length).toBeGreaterThan(10);
    expect(/[^\r]\n/.test(s)).toBe(false);
  });

  it("names the calendar so it is not 'Untitled' on the phone", () => {
    expect(ics({}, "Omar — viewings")).toContain("X-WR-CALNAME:Omar — viewings");
  });

  it("asks to be refreshed often enough to be useful", () => {
    expect(ics()).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT15M");
  });
});

describe("times", () => {
  it("writes UTC with a Z, not a floating local time", () => {
    const s = ics();
    expect(s).toContain("DTSTART:20260811T060000Z");
  });

  it("ends the event after its duration", () => {
    expect(ics({ durationMins: 45 })).toContain("DTEND:20260811T064500Z");
  });

  it("handles a viewing that runs past midnight UTC", () => {
    const s = ics({ scheduledAt: new Date("2026-08-11T23:45:00.000Z"), durationMins: 30 });
    expect(s).toContain("DTSTART:20260811T234500Z");
    expect(s).toContain("DTEND:20260812T001500Z");
  });
});

describe("the UID is what stops duplicates", () => {
  /**
   * A refresh must **replace** the event. Get this wrong and an agent
   * ends up with the same viewing eleven times, one per refresh, with no
   * way to tell which is current.
   */
  it("is stable for the same viewing across two builds", () => {
    const a = buildIcs([base], { name: "v", now: new Date("2026-08-10T09:00:00Z") });
    const b = buildIcs([base], { name: "v", now: new Date("2026-08-10T10:00:00Z") });
    const uid = (s: string) => s.match(/UID:(.+)/)![1];
    expect(uid(a)).toBe(uid(b));
    expect(uid(a)).toContain("vw_1@");
  });

  it("differs between two viewings", () => {
    const s = buildIcs([base, { ...base, id: "vw_2" }], { name: "v", now: NOW });
    const uids = [...s.matchAll(/UID:(.+)/g)].map((m) => m[1]);
    expect(new Set(uids).size).toBe(2);
  });

  /**
   * SEQUENCE is how a client knows an existing event *changed* rather
   * than being a duplicate to ignore. Without it, a rescheduled viewing
   * stays at the old time on the phone.
   */
  it("rises when the viewing is edited", () => {
    const before = ics({ updatedAt: new Date("2026-08-10T08:00:00Z") });
    const after = ics({ updatedAt: new Date("2026-08-10T08:30:00Z") });
    const seq = (s: string) => Number(s.match(/SEQUENCE:(\d+)/)![1]);
    expect(seq(after)).toBeGreaterThan(seq(before));
  });
});

describe("escaping, which is where addresses get truncated", () => {
  /**
   * A raw comma ends the property early and everything after it becomes
   * a parameter. "Marina Gate 2, Tower B" silently becomes "Marina Gate 2".
   */
  it("escapes commas in a location", () => {
    const s = ics({ building: "Tower B", address: "Marina Gate 2" });
    expect(s).toContain("LOCATION:Tower B\\, Marina Gate 2");
  });

  it("escapes semicolons", () => {
    expect(ics({ address: "Gate 3; south entrance" })).toContain("Gate 3\\; south entrance");
  });

  /**
   * Backslash first. Escaping it after the others re-escapes the
   * backslashes those just inserted.
   */
  /**
   * Unfolded before asserting, and that is not test plumbing.
   *
   * These two live in DESCRIPTION, which is long enough to be folded, so
   * the escaped text arrives split across a `\r\n ` boundary. Asserting
   * on the raw string fails on correct output — which is exactly how
   * somebody "fixes" working escaping into broken escaping.
   */
  const unfolded = (over: Partial<CalendarViewing>) => ics(over).replace(/\r\n /g, "");

  it("escapes a backslash once, not twice", () => {
    const s = unfolded({ accessNote: "Parking A\\B" });
    expect(s).toContain("Parking A\\\\B");
    expect(s).not.toContain("\\\\\\\\");
  });

  it("turns a newline in a note into an escaped one, not a broken line", () => {
    const s = unfolded({ accessNote: "Ask for Ahmed\nSecurity desk has the key" });
    expect(s).toContain("Ask for Ahmed\\nSecurity desk has the key");
    // and the note must not have introduced a real line break
    expect(ics({ accessNote: "Ask for Ahmed\nSecurity desk has the key" }))
      .not.toContain("\r\nSecurity desk");
  });
});

describe("folding is counted in octets", () => {
  /**
   * The spec counts bytes. An Arabic building name is two bytes a
   * character, so folding on character count produces lines that look
   * legal and are too long — and can split a character in half, which
   * makes the whole feed unparseable.
   */
  it("never emits a line over 75 octets", () => {
    const s = buildIcs([{
      ...base,
      accessNote: "Tower 2 not Tower 1, the security desk on the ground floor has the key, ask for Ahmed between nine and six",
      address: "شارع الشيخ زايد، برج مارينا جيت الثاني، دبي، الإمارات العربية المتحدة",
    }], { name: "v", now: NOW });
    for (const l of s.split("\r\n")) {
      expect(Buffer.from(l, "utf8").length).toBeLessThanOrEqual(75);
    }
  });

  it("keeps the text intact when it unfolds", () => {
    const note = "Tower 2 not Tower 1 — the security desk on the ground floor holds the key";
    const s = ics({ accessNote: note });
    const unfolded = s.replace(/\r\n /g, "");
    expect(unfolded).toContain(note.replace(/,/g, "\\,"));
  });

  it("does not split a multi-byte character", () => {
    const s = buildIcs([{ ...base, address: "برج".repeat(40) }], { name: "v", now: NOW });
    // A broken sequence surfaces as U+FFFD when the bytes are re-read.
    expect(s).not.toContain("�");
  });
});

describe("a cancelled viewing", () => {
  /**
   * Published as cancelled rather than dropped. A client that stops
   * seeing an event cannot tell whether it was cancelled or the feed is
   * incomplete, so it keeps what it has — and the dead viewing sits on
   * the agent's phone forever.
   */
  it("is marked cancelled so it leaves the phone", () => {
    expect(ics({ status: "CANCELLED" })).toContain("STATUS:CANCELLED");
  });

  it("and a live one is confirmed", () => {
    expect(ics()).toContain("STATUS:CONFIRMED");
  });
});

describe("what the agent reads on the lock screen", () => {
  it("names who they are meeting", () => {
    expect(ics()).toContain("SUMMARY:Viewing — Rajesh Menon");
  });

  it("still works when the lead has no name on file", () => {
    const s = ics({ leadName: null, leadPhone: null });
    expect(s).toContain("SUMMARY:Viewing");
    expect(s).toContain("BEGIN:VEVENT");
  });

  it("carries the phone number and the reference", () => {
    const s = ics().replace(/\r\n /g, "");
    expect(s).toContain("+971 50 448 2211");
    expect(s).toContain("Listing PF-2042");
  });

  it("survives a viewing with no address at all", () => {
    const s = ics({ address: null, building: null });
    expect(s).not.toContain("LOCATION:");
    expect(s).toContain("END:VEVENT");
  });
});

describe("an empty diary", () => {
  it("is a valid empty calendar, not an error", () => {
    const s = buildIcs([], { name: "Viewings", now: NOW });
    expect(s).toContain("BEGIN:VCALENDAR");
    expect(s).toContain("END:VCALENDAR");
    expect(s).not.toContain("BEGIN:VEVENT");
  });
});
