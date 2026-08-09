import { crossTenant } from "@/server/db/client";
import type { NotificationKind } from "@prisma/client";
import { RULES, inQuietHours } from "./rules";

/**
 * Deciding who gets told, and when to stop asking them.
 *
 * The escalation ladder is the part worth reading. A notification that
 * goes to one person and stops is a notification that fails whenever that
 * person is driving, in a meeting, or has left the company. A notification
 * that goes to everyone immediately is a notification everyone assumes
 * somebody else is handling.
 *
 * So: the assigned agent first. If nothing has happened after the first
 * interval, their manager. After the second, everyone on duty. Each rung
 * is recorded, so the ladder does not restart on every sweep.
 */

type Target = { userId: string; escalation: number };

export async function dispatch(args: {
  orgId: string;
  kind: NotificationKind;
  subjectId: string;
  title: string;
  body: string;
  deeplink: string;
  /** Who owns the thing. Null means nobody, which is usually the problem. */
  assignedToId: string | null;
  /** When the thing became worth telling somebody about. */
  since: Date;
}) {
  const rule = RULES[args.kind];
  const waitedMins = (Date.now() - args.since.getTime()) / 60_000;
  if (waitedMins < rule.afterMinutes) return { sent: 0, reason: "too soon" };

  // Which rung we are on. Derived from elapsed time rather than from a
  // counter, so a missed sweep catches up instead of stalling.
  let rung = 0;
  for (const [i, mins] of rule.escalateAfterMinutes.entries()) {
    if (waitedMins >= mins) rung = i + 1;
  }

  const targets = await audience(args.orgId, args.assignedToId, rung);
  if (!targets.length) return { sent: 0, reason: "nobody to tell" };

  const org = await crossTenant("sweep").organisation.findUnique({
    where: { id: args.orgId },
    select: { timezone: true },
  });
  const tz = org?.timezone ?? "Asia/Dubai";

  let sent = 0;

  for (const t of targets) {
    const prefs = await crossTenant("sweep").notificationPrefs.findUnique({
      where: { orgId_userId: { orgId: args.orgId, userId: t.userId } },
    });

    // Default is on, because an agent who has never opened settings still
    // needs to hear about a lead waiting mid-conversation.
    const p = prefs ?? {
      push: true, email: false, quietFromMin: null, quietToMin: null,
      daysOff: [], urgentOverridesQuiet: false,
    };
    if (!p.push && !p.email) continue;

    const quiet = inQuietHours(new Date(), p, tz);
    if (quiet && !(rule.urgency === "urgent" && p.urgentOverridesQuiet)) {
      // Held rather than dropped. It goes out with the morning digest, so
      // nothing is lost — it just does not wake anybody.
      await record(args, t, "held for quiet hours");
      continue;
    }

    /**
     * Deduplication. The unique key is (org, user, kind, subject), so five
     * enquiries from one lead in ten minutes produce one notification, and
     * a sweep that runs twice produces one as well.
     */
    const existing = await crossTenant("sweep").notification.findUnique({
      where: {
        orgId_userId_kind_subjectId: {
          orgId: args.orgId, userId: t.userId, kind: args.kind, subjectId: args.subjectId,
        },
      },
      select: { escalation: true, actedAt: true },
    });

    if (existing?.actedAt) continue;                 // already dealt with
    if (existing && existing.escalation >= rung) continue;  // already told at this rung

    await push(t.userId, args);
    await record(args, { ...t, escalation: rung }, null);
    sent += 1;
  }

  return { sent, rung };
}

/** Who is on the ladder at this rung. */
async function audience(orgId: string, assignedToId: string | null, rung: number): Promise<Target[]> {
  if (rung === 0 && assignedToId) return [{ userId: assignedToId, escalation: 0 }];

  const roles = rung === 0 || rung === 1
    ? (["OWNER", "ADMIN", "MANAGER"] as const)
    : (["OWNER", "ADMIN", "MANAGER", "AGENT"] as const);

  const members = await crossTenant("sweep").membership.findMany({
    where: { orgId, role: { in: [...roles] } },
    select: { userId: true },
  });

  return members
    .filter((m) => m.userId !== assignedToId || rung > 0)
    .map((m) => ({ userId: m.userId, escalation: rung }));
}

async function record(
  args: { orgId: string; kind: NotificationKind; subjectId: string; title: string; body: string; deeplink: string },
  t: Target,
  suppressed: string | null
) {
  await crossTenant("sweep").notification.upsert({
    where: {
      orgId_userId_kind_subjectId: {
        orgId: args.orgId, userId: t.userId, kind: args.kind, subjectId: args.subjectId,
      },
    },
    create: {
      orgId: args.orgId, userId: t.userId, kind: args.kind, subjectId: args.subjectId,
      title: args.title, body: args.body, deeplink: args.deeplink,
      escalation: t.escalation, suppressed,
    },
    update: { escalation: t.escalation, sentAt: new Date(), suppressed },
  });
}

/** Marks it dealt with, so the ladder stops. Called when someone replies. */
export async function acted(orgId: string, kind: NotificationKind, subjectId: string) {
  await crossTenant("sweep").notification.updateMany({
    where: { orgId, kind, subjectId, actedAt: null },
    data: { actedAt: new Date() },
  });
}

async function push(userId: string, args: { title: string; body: string; deeplink: string }) {
  const { sendPush } = await import("./push");
  await sendPush(userId, { ...args, urgent: true });
}
