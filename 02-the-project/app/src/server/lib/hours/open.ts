import { crossTenant } from "@/server/db/client";

export type HoursRow = { dayOfWeek: number; startMin: number; endMin: number; closed: boolean };

/**
 * Whether the brokerage is open at this moment, by its own clock.
 *
 * `null` when it has no hours at all: "nobody has said" is not "closed",
 * the same distinction `availableSlots` draws. The caller decides what
 * an unknown means for it.
 */
export function openAt(rows: HoursRow[], at: Date, timeZone: string): boolean | null {
  if (rows.length === 0) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // 0 = Sunday, matching WorkingHours.dayOfWeek and Postgres DOW.
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  // "24" is how some engines spell midnight with hour12 off.
  const minutes = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  const day = rows.find((r) => r.dayOfWeek === dow);
  if (!day || day.closed) return false;
  return minutes >= day.startMin && minutes < day.endMin;
}

/**
 * The same, read from the database.
 *
 * Unknown reads as open. The only caller today is automatic replies
 * outside working hours, and there the careful answer to "is anybody
 * in?" when nobody has said is yes: the assistant drafts and a person
 * sends, rather than messaging a buyer by itself on a guess.
 */
export async function isOpen(orgId: string, at = new Date()): Promise<boolean> {
  const db = crossTenant("sweep");
  const [rows, org] = await Promise.all([
    db.workingHours.findMany({
      where: { orgId }, select: { dayOfWeek: true, startMin: true, endMin: true, closed: true },
    }),
    db.organisation.findUnique({ where: { id: orgId }, select: { timezone: true } }),
  ]);
  return openAt(rows, at, org?.timezone ?? "Asia/Dubai") ?? true;
}
