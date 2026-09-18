import type { Prisma } from "@prisma/client";

/**
 * When the brokerage is open, and why there has to be a default.
 *
 * **Nothing ever wrote a `WorkingHours` row.** `availableSlots()` reads
 * them and skips any day it has no row for:
 *
 *     const wh = byDay.get(dow);
 *     if (!wh || wh.closed) continue;
 *
 * With no rows every day is skipped, so the function returns an empty
 * array for every brokerage, always — and the booking screen told the
 * agent *"Nothing free in the next week. Widen the range or move
 * something."* A diary that was never configured, reported as a diary
 * that is full.
 *
 * That is the product's headline promise — answers the enquiry,
 * qualifies the lead, **books the viewing** — and the last step could
 * not offer a single time.
 *
 * ## The week these numbers describe
 *
 * Not an office week, and that is the point `scheduling.ts` already
 * makes: agents in this market do most of their viewings at the
 * weekend. Every day is open by default, because an agent losing
 * Saturday to a default written for a bank is worse than an agent
 * having to close a day they do not work.
 *
 * Friday starts in the afternoon, after Jumu'ah. Nobody is being shown
 * a flat at midday on a Friday in Dubai, and a slot offered then is one
 * the lead ignores and the agent has to apologise for.
 *
 * These are a starting point that can be wrong without being harmful.
 * The screen exists so a brokerage that works Sunday to Thursday can say
 * so in thirty seconds.
 */
export const DEFAULT_HOURS: readonly Omit<
  Prisma.WorkingHoursCreateManyInput,
  "orgId"
>[] = [
  // 0 = Sunday, matching Postgres DOW — the model says so and the
  // scheduler indexes by it. Getting this off by one moves the whole
  // week and nothing complains.
  { dayOfWeek: 0, startMin: 9 * 60, endMin: 19 * 60 },   // Sunday
  { dayOfWeek: 1, startMin: 9 * 60, endMin: 19 * 60 },   // Monday
  { dayOfWeek: 2, startMin: 9 * 60, endMin: 19 * 60 },   // Tuesday
  { dayOfWeek: 3, startMin: 9 * 60, endMin: 19 * 60 },   // Wednesday
  { dayOfWeek: 4, startMin: 9 * 60, endMin: 19 * 60 },   // Thursday
  // Friday: after prayers.
  { dayOfWeek: 5, startMin: 14 * 60 + 30, endMin: 19 * 60 },
  // Saturday: the busiest viewing day of the week here, and the one a
  // Monday-to-Friday default would have closed.
  { dayOfWeek: 6, startMin: 10 * 60, endMin: 18 * 60 },
];

export const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

/**
 * Create them for one organisation.
 *
 * `skipDuplicates` against `@@unique([orgId, dayOfWeek])`, so a backfill
 * can be run twice and a brokerage that has already set Friday keeps
 * what they set.
 *
 * Takes a transaction client so it can join the signup transaction: a
 * brokerage that exists with no hours is the state this file is here to
 * make impossible.
 */
export async function seedHours(
  tx: Prisma.TransactionClient,
  orgId: string,
): Promise<number> {
  const { count } = await tx.workingHours.createMany({
    data: DEFAULT_HOURS.map((h) => ({ ...h, orgId })),
    skipDuplicates: true,
  });
  return count;
}

/** Minutes from midnight as "09:00". */
export function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * "09:00" back to minutes, or null.
 *
 * Null rather than a throw or a zero: a malformed time on a settings
 * form is an ordinary typo, and `0` would silently mean midnight — which
 * is a working day starting at midnight rather than an error anybody
 * can see.
 */
export function fromHhmm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
