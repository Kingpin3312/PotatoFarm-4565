/**
 * Midnight to midnight, where the brokerage is.
 *
 * Derived from the formatted local date rather than from an offset,
 * for the same reason as the greeting: the UAE has no daylight saving
 * but a brokerage run from London does, and +4 is wrong twice a year.
 *
 * The arithmetic reads oddly and is the standard trick — format `now`
 * in the target zone, ask what that same wall-clock reading is in UTC,
 * and the difference is the offset in force *on that date*.
 */
export function dayWindow(now: Date, timeZone: string): { start: Date; end: Date } {
  let offsetMs: number;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"),
                           get("hour") % 24, get("minute"), get("second"));
    offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  } catch {
    offsetMs = 0;
  }

  // Local midnight, expressed as the UTC instant it corresponds to.
  const local = new Date(now.getTime() + offsetMs);
  const localMidnight = Date.UTC(
    local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()
  );
  const start = new Date(localMidnight - offsetMs);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}
