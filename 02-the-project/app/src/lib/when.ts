/**
 * When something happened, at the precision a person needs.
 *
 * ## Why this is a module and not two `Intl.DateTimeFormat` calls
 *
 * Both inbox screens rendered hour and minute and nothing else. A
 * conversation last touched thirty-four days ago showed **"18:15"**,
 * indistinguishable from one that arrived during lunch — on the two
 * screens an agent triages from. The thread view was the more
 * misleading of the pair: it printed six messages at 17:58 through
 * 18:18 directly above a banner reading "Quiet for more than 24
 * hours", so the screen contradicted itself in a single viewport.
 *
 * The fixture made it visible rather than causing it. Eleven
 * conversations spread across nine weeks all ended at the same clock
 * time, because a demo clock keeps the time of day and moves the date —
 * which is exactly the case a time-only format cannot express.
 *
 * One implementation, because two would drift: this codebase has the
 * scar from five money formatters, and a date is the same kind of thing.
 *
 * Everything is in `Asia/Dubai`. The product is used in one country and
 * a viewing at 16:00 means 16:00 there, whatever the server thinks.
 */
const TZ = "Asia/Dubai";

const HHMM = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit", minute: "2-digit", timeZone: TZ,
});
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: TZ });
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: TZ });
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ,
});

/**
 * The calendar date in Dubai, as a sortable key.
 *
 * Calendar days, not 24-hour blocks: a message at 23:50 last night is
 * "yesterday" at 00:10 this morning, not "today". `en-CA` because it
 * formats as YYYY-MM-DD, which compares and subtracts correctly.
 */
const dayKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

/** Whole calendar days between two instants, in Dubai. */
function daysBetween(a: Date, b: Date): number {
  return Math.round((Date.parse(dayKey(a)) - Date.parse(dayKey(b))) / 86_400_000);
}

/**
 * For a list: today is a clock, this week is a day, older is a date.
 *
 * The convention every messaging app uses, and for the same reason —
 * the further back something is, the less its minute matters and the
 * more its date does.
 */
export function when(d: Date, now: Date = new Date()): string {
  if (dayKey(d) === dayKey(now)) return HHMM.format(d);
  const days = daysBetween(now, d);
  if (days >= 1 && days < 7) return WEEKDAY.format(d);
  return DATE.format(d);
}

/**
 * For a message in a thread, where the time always matters and the date
 * only matters once it is not today.
 */
export function whenExact(d: Date, now: Date = new Date()): string {
  return dayKey(d) === dayKey(now) ? HHMM.format(d) : DATE_TIME.format(d);
}
