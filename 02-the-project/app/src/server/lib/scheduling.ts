import { crossTenant } from "@/server/db/client";

/**
 * Working out when an agent is actually free.
 *
 * Two assumptions most scheduling code makes, both wrong here:
 *
 * 1. **That the working week is Monday to Friday.** It is not. Agents in
 *    this market do most of their viewings at the weekend, and Friday
 *    afternoon is when the fewest people want to be shown a flat. Hours
 *    are per brokerage, stored per day of week, and there is no default
 *    that assumes an office job.
 *
 * 2. **That back-to-back slots are bookable.** An agent cannot be in
 *    Marina at ten and Dubai Hills at half past. Every slot carries a
 *    travel buffer, and a longer one when the previous viewing was
 *    somewhere else.
 */

export type Slot = { start: Date; end: Date };

const SLOT_MINUTES = 30;
const SAME_BUILDING_BUFFER = 10;
const ACROSS_TOWN_BUFFER = 45;

export async function availableSlots(args: {
  orgId: string;
  agentId: string;
  from: Date;
  days: number;
  durationMins?: number;
  /// Where the viewing is, so travel buffers can be worked out.
  community?: string | null;
}): Promise<Slot[]> {
  const duration = args.durationMins ?? SLOT_MINUTES;

  const [org, hours, booked] = await Promise.all([
    crossTenant("sweep").organisation.findUnique({ where: { id: args.orgId }, select: { timezone: true } }),
    crossTenant("sweep").workingHours.findMany({ where: { orgId: args.orgId } }),
    crossTenant("sweep").viewing.findMany({
      where: {
        orgId: args.orgId,
        agentId: args.agentId,
        status: { in: ["SCHEDULED", "CONFIRMED"] },
        scheduledAt: {
          gte: args.from,
          lte: new Date(args.from.getTime() + args.days * 86_400_000),
        },
      },
      select: {
        scheduledAt: true, durationMins: true, heldUntil: true,
        listing: { select: { community: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
  ]);

  const tz = org?.timezone ?? "Asia/Dubai";
  const byDay = new Map(hours.map((h) => [h.dayOfWeek, h]));

  // Held slots still block, until the hold lapses. A slot offered to one
  // lead must not be offered to the next one thirty seconds later.
  const blocking = booked.filter((b) => !b.heldUntil || b.heldUntil > new Date());

  const slots: Slot[] = [];

  for (let d = 0; d < args.days; d++) {
    const day = new Date(args.from.getTime() + d * 86_400_000);
    const dow = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "narrow" })
      .formatToParts(day).length && localDow(day, tz));

    const wh = byDay.get(dow);
    if (!wh || wh.closed) continue;

    for (let m = wh.startMin; m + duration <= wh.endMin; m += SLOT_MINUTES) {
      const start = atLocalMinutes(day, m, tz);
      const end = new Date(start.getTime() + duration * 60_000);

      // Never offer a slot in the past, and never one inside two hours —
      // nobody arranges to be shown a flat with ninety minutes' notice.
      if (start.getTime() < Date.now() + 2 * 3_600_000) continue;

      const clash = blocking.find((b) => {
        const bStart = b.scheduledAt.getTime();
        const bEnd = bStart + b.durationMins * 60_000;
        const buffer =
          b.listing?.community && args.community && b.listing.community === args.community
            ? SAME_BUILDING_BUFFER
            : ACROSS_TOWN_BUFFER;
        const pad = buffer * 60_000;
        return start.getTime() < bEnd + pad && end.getTime() + pad > bStart;
      });

      if (!clash) slots.push({ start, end });
    }
  }

  return slots;
}

/**
 * The three slots the assistant offers.
 *
 * Not the first three. Spread across different days and times of day,
 * because three consecutive Saturday-morning slots is one offer wearing
 * three hats, and if the lead cannot do Saturday morning the conversation
 * stalls.
 */
export function offerable(slots: Slot[], count = 3): Slot[] {
  if (slots.length <= count) return slots;

  const chosen: Slot[] = [];
  const usedDays = new Set<string>();

  for (const s of slots) {
    const day = s.start.toISOString().slice(0, 10);
    if (usedDays.has(day)) continue;
    chosen.push(s);
    usedDays.add(day);
    if (chosen.length === count) break;
  }

  // Fewer than three distinct days available — fall back to filling up.
  for (const s of slots) {
    if (chosen.length === count) break;
    if (!chosen.includes(s)) chosen.push(s);
  }

  return chosen.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/* ---------------------------------------------------------------- time */

/**
 * Local day-of-week and local wall time, without pulling in a date
 * library. The UAE does not observe daylight saving, but leads and agents
 * are not always in the UAE, so this goes through the timezone rather
 * than assuming a fixed offset.
 */
function localDow(d: Date, tz: string) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

function atLocalMinutes(day: Date, minutes: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(day);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const iso = `${get("year")}-${get("month")}-${get("day")}T00:00:00`;

  // Find the offset for that date in that zone, then apply it.
  const asUtc = new Date(`${iso}Z`);
  const offsetMin = (asUtc.getTime() - new Date(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).format(asUtc).replace(" ", "T") + "Z"
  ).getTime()) / 60_000;

  return new Date(asUtc.getTime() + (minutes + offsetMin) * 60_000);
}

/** Formatted the way a person would say it, in the lead's own timezone. */
export function humanSlot(s: Slot, tz = "Asia/Dubai") {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, weekday: "long", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(s.start).replace(",", "");
}
