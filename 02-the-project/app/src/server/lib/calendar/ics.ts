/**
 * Viewings, as a calendar an agent's phone can subscribe to.
 *
 * A viewing booked in PotatoFarm used to exist only inside PotatoFarm.
 * An agent's day lives in the calendar they already have, and a CRM that
 * cannot put a viewing there is one they will forget to open — which is
 * fatal for a product whose whole argument is that it is the thing they
 * open first.
 *
 * **RFC 5545, and it is fussier than it looks.** Apple Calendar and
 * Google both fail *silently* on a malformed feed: the subscription
 * simply shows nothing, with no error anywhere. So the four things that
 * actually break feeds are handled deliberately below and each has a
 * test — CRLF endings, octet-based line folding, TEXT escaping, and a
 * UID that is stable across refreshes.
 */

export type CalendarViewing = {
  id: string;
  scheduledAt: Date;
  durationMins: number;
  /** Denormalised on the viewing, because a listing can be edited after booking. */
  address: string | null;
  building: string | null;
  accessNote: string | null;
  status: string;
  updatedAt: Date;
  leadName: string | null;
  leadPhone: string | null;
  listingReference: string | null;
};

/** `20260810T120000Z`. Always UTC — a floating local time is how a feed lands an hour out. */
function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Escape a TEXT value.
 *
 * Backslash first, or escaping the others re-escapes the backslashes it
 * just inserted. A comma or semicolon left raw ends the property early
 * and the rest of the line becomes a parameter nobody asked for — which
 * is how "Marina Gate 2, Tower B" silently truncates to "Marina Gate 2".
 */
function esc(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/**
 * Fold to 75 **octets**, not characters.
 *
 * The spec counts bytes, and an Arabic building name or a — in an access
 * note is two or three bytes per character. Folding on character count
 * produces lines that are legal-looking and too long, and it can split a
 * multi-byte character in half, which makes the whole feed unparseable.
 * A continuation line begins with one space.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never cut inside a UTF-8 sequence: continuation bytes are 10xxxxxx.
    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    out.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74; // subsequent lines carry a leading space
  }
  return out.join("\r\n ");
}

function line(name: string, value: string): string {
  return fold(`${name}:${value}`);
}

/**
 * One event.
 *
 * `UID` is the viewing id plus a fixed domain, so a refresh **replaces**
 * the event rather than adding a second copy of it. Getting this wrong
 * gives an agent a calendar with the same viewing in it eleven times,
 * one per refresh, and no way to tell which is current.
 *
 * `SEQUENCE` rises with `updatedAt`, which is what tells a client an
 * existing event has changed rather than being a duplicate to ignore.
 */
function event(v: CalendarViewing, now: Date): string[] {
  const end = new Date(v.scheduledAt.getTime() + v.durationMins * 60_000);
  const where = [v.building, v.address].filter(Boolean).join(", ");

  const description = [
    v.leadName ? `With ${v.leadName}` : null,
    v.leadPhone,
    v.listingReference ? `Listing ${v.listingReference}` : null,
    v.accessNote,
  ].filter(Boolean).join("\n");

  const out = [
    "BEGIN:VEVENT",
    line("UID", `${v.id}@potatofarm.io`),
    line("DTSTAMP", stamp(now)),
    line("DTSTART", stamp(v.scheduledAt)),
    line("DTEND", stamp(end)),
    line("SEQUENCE", String(Math.floor(v.updatedAt.getTime() / 1000))),
    line("SUMMARY", esc(
      v.leadName ? `Viewing — ${v.leadName}` : "Viewing",
    )),
  ];

  if (where) out.push(line("LOCATION", esc(where)));
  if (description) out.push(line("DESCRIPTION", esc(description)));

  /**
   * A cancelled viewing is published as cancelled rather than dropped.
   *
   * Removing it from the feed leaves the event sitting in the agent's
   * calendar forever — a client that no longer sees an event has no way
   * to know whether it was cancelled or the feed is just incomplete, so
   * it keeps what it has. `STATUS:CANCELLED` is the only thing that
   * actually takes it off the phone.
   */
  out.push(line("STATUS", v.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED"));

  out.push("END:VEVENT");
  return out;
}

/** The whole feed. `name` appears as the calendar's title on the phone. */
export function buildIcs(
  viewings: CalendarViewing[],
  opts: { name: string; now?: Date },
): string {
  const now = opts.now ?? new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    line("PRODID", "-//PotatoFarm.io//Viewings//EN"),
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    line("X-WR-CALNAME", esc(opts.name)),
    // Apple and Google both honour this as a polling hint. Fifteen
    // minutes is frequent enough that a viewing booked in the office is
    // on the phone before the drive, and gentle enough at scale.
    "X-PUBLISHED-TTL:PT15M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    ...viewings.flatMap((v) => event(v, now)),
    "END:VCALENDAR",
  ];

  // CRLF, and a trailing one. Bare \n is the single most common reason a
  // hand-rolled feed imports as empty.
  return lines.join("\r\n") + "\r\n";
}
