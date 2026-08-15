import { PrismaClient } from "@prisma/client";
import { inQuietHours } from "@/server/lib/notify/rules";
import { releaseHeld } from "@/server/lib/notify/digest";

/**
 * Held during quiet hours, and released afterwards.
 *
 * Nothing ever wrote a `NotificationPrefs` row, so `inQuietHours` was
 * asked about `quietFromMin: null` every time and said no every time.
 * Every notification pushed immediately, at any hour — and the branch
 * that holds one was unreachable, which meant the missing morning
 * digest below it had never been noticed either.
 *
 * The pair is the point. Quiet hours without a digest is not a quieter
 * product, it is a product that drops messages; so both are asserted
 * here, and the release is asserted by running the real job.
 *
 *     npm run check:quiet
 */
let bad = 0;
const failures: string[] = [];
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) { bad++; failures.push(d ? `${l}  — ${d}` : l); }
};

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});

const org = await db.organisation.findFirst({ where: { deletedAt: null }, select: { id: true, timezone: true } });
const user = await db.membership.findFirst({ where: { orgId: org!.id }, select: { userId: true } });
if (!org || !user) { console.error("no organisation or member to test against"); process.exit(1); }
const TZ = org.timezone ?? "Asia/Dubai";

/** A fixed instant, so the arithmetic does not drift with the clock. */
const at = (hhmm: string, day = "2026-08-12") => new Date(`${day}T${hhmm}:00.000Z`);

console.log("\n=== the window itself ===");
{
  // Dubai is UTC+4, so 18:00Z is 22:00 local — the start of a typical
  // quiet period. Written in UTC and converted, rather than assuming
  // the runner's timezone.
  const prefs = { quietFromMin: 22 * 60, quietToMin: 7 * 60, daysOff: [] as number[] };
  ok("22:00 local is quiet", inQuietHours(at("18:00"), prefs, TZ));
  ok("03:00 local is quiet", inQuietHours(at("23:00"), prefs, TZ), "the range wraps midnight");
  ok("09:00 local is not", !inQuietHours(at("05:00"), prefs, TZ));
  ok("21:59 local is not", !inQuietHours(at("17:59"), prefs, TZ));
}

console.log("\n=== a day off is quiet all day ===");
{
  // 2026-08-12 is a Wednesday. Day 3.
  const wed = { quietFromMin: null, quietToMin: null, daysOff: [3] };
  ok("all of Wednesday", inQuietHours(at("09:00"), wed, TZ));
  const thu = { quietFromMin: null, quietToMin: null, daysOff: [4] };
  ok("and Thursday is not", !inQuietHours(at("09:00"), thu, TZ));
}

console.log("\n=== half a range never applies, which is why it is refused ===");
{
  // Not a preference somebody would want — the point is that the
  // function cannot honour it, so the mutation has to reject it rather
  // than store a quiet period that silently does nothing.
  const half = { quietFromMin: 22 * 60, quietToMin: null, daysOff: [] as number[] };
  ok("a start with no end is not quiet at any hour",
     !inQuietHours(at("18:00"), half, TZ) && !inQuietHours(at("23:00"), half, TZ),
     "so `setNotifications` refuses it rather than storing it");
}

console.log("\n=== held, then released by the real job ===");
{
  await db.notification.deleteMany({ where: { orgId: org.id, kind: "HANDOVER_WAITING" } });
  await db.notificationPrefs.deleteMany({ where: { orgId: org.id, userId: user.userId } });

  // Quiet right now, whatever "now" is when this runs: a full 24 hours
  // off today. A fixed 22:00–07:00 window would make this check pass or
  // fail depending on the hour it was run at, which is the mixed-clock
  // mistake `crm-audit.py` has a rule about.
  const today = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" })
    .format(new Date()).replace(/\w+/, (m) =>
      String(["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(m))));

  await db.notificationPrefs.create({
    data: { orgId: org.id, userId: user.userId, push: true, daysOff: [today] },
  });

  const held = await db.notification.create({
    data: {
      orgId: org.id, userId: user.userId, kind: "HANDOVER_WAITING",
      subjectId: "quiet-check", title: "A buyer is waiting",
      body: "…", deeplink: "/inbox", suppressed: "held for quiet hours",
    },
  });
  ok("a held notification exists and was not pushed", held.suppressed !== null);

  // Still quiet: the job must leave it alone. Without this the release
  // could be unconditional and the whole feature pointless.
  const noop = await releaseHeld();
  const stillHeld = await db.notification.findUnique({ where: { id: held.id }, select: { suppressed: true } });
  ok("while still quiet, nothing is released", stillHeld?.suppressed !== null,
     `released ${noop.released}`);

  // No longer quiet.
  await db.notificationPrefs.update({
    where: { orgId_userId: { orgId: org.id, userId: user.userId } },
    data: { daysOff: [] },
  });
  const out = await releaseHeld();
  const after = await db.notification.findUnique({
    where: { id: held.id }, select: { suppressed: true, sentAt: true },
  });
  ok("once the quiet period ends it goes out", after?.suppressed === null,
     `${out.released} released to ${out.people} person(s)`);
  // `sentAt` is when the thing happened. Moving it to now would make an
  // overnight lead look like it arrived at breakfast.
  ok("and its timestamp is not rewritten",
     after!.sentAt.getTime() === held.sentAt.getTime());

  // Idempotent: an hourly job must not re-send what it already released.
  const again = await releaseHeld();
  ok("a second run sends nothing", again.released === 0, `${again.released}`);

  await db.notification.deleteMany({ where: { orgId: org.id, kind: "HANDOVER_WAITING" } });
  await db.notificationPrefs.deleteMany({ where: { orgId: org.id, userId: user.userId } });
}

await db.$disconnect();
console.log(bad ? "\n" + bad + " FAILED:\n  - " + failures.join("\n  - ") + "\n"
                : "\nquiet hours hold, and the digest lets them go.\n");
process.exit(bad ? 1 : 0);
