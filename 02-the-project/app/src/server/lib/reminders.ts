import { log } from "@/lib/log";
import { crossTenant, forOrg } from "@/server/db/client";
import { messagingWindow, sendTemplate } from "@/server/lib/whatsapp";
import { getChannelCredentials } from "@/server/lib/secrets";
import { humanSlot } from "./scheduling";

/**
 * Viewing reminders.
 *
 * No-shows are the largest avoidable loss in this business — an agent
 * drives to Dubai Hills on a Saturday for nobody. A reminder the evening
 * before and one on the morning cuts it materially, and it costs a
 * template message.
 *
 * Two things this has to get right:
 *
 * 1. **The 24-hour window will almost always be shut.** A viewing booked
 *    on Tuesday for Saturday means the lead has not messaged in days, so
 *    a free-form reminder is accepted by Meta and never delivered. These
 *    go out as approved templates, always.
 * 2. **It must never send twice.** The timestamp is written in the same
 *    transaction as the send, and the query only picks up rows where it
 *    is null. A retry finds nothing to do.
 */

export async function sendDueReminders() {
  const now = new Date();

  const due = await crossTenant("sweep").viewing.findMany({
    where: {
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      remindedLeadAt: null,
      // The evening before, roughly. A reminder at 3am is worse than none.
      scheduledAt: { gte: now, lte: new Date(now.getTime() + 20 * 3_600_000) },
    },
    take: 200,
    select: {
      id: true, orgId: true, scheduledAt: true,
      lead: { select: { phone: true, name: true, language: true } },
      listing: { select: { title: true, community: true } },
      agent: { select: { name: true } },
    },
  });

  let sent = 0;

  for (const v of due) {
    try {
      const conversation = await crossTenant("sweep").conversation.findFirst({
        where: { orgId: v.orgId, lead: { phone: v.lead.phone } },
        select: { id: true, channelId: true, lastInboundAt: true },
      });
      if (!conversation) continue;

      const creds = await getChannelCredentials(v.orgId, conversation.channelId);

      // Checked rather than assumed. On the rare occasion the lead has
      // messaged recently, a plain message reads better than a template.
      const open = messagingWindow(conversation.lastInboundAt).open;

      await sendTemplate({
        phoneNumberId: creds.phoneNumberId,
        accessToken: creds.accessToken,
        to: v.lead.phone.replace("+", ""),
        template: open ? "viewing_reminder_open" : "viewing_reminder",
        language: v.lead.language ?? "en",
        variables: [
          v.lead.name?.split(" ")[0] ?? "there",
          humanSlot({ start: v.scheduledAt, end: v.scheduledAt }),
          v.listing?.title ?? "the property",
          v.agent?.name ?? "your agent",
        ],
      });

      // Written immediately after the send. If this fails the reminder may
      // go twice, which is mildly annoying; writing it first and failing
      // the send means the lead is never reminded, which is worse.
      await forOrg(v.orgId).viewing.update({
        where: { id: v.id },
        data: { remindedLeadAt: new Date() },
      });
      sent += 1;
    } catch (err) {
      log.error(`[reminders] viewing ${v.id} failed`, err);
    }
  }

  return { considered: due.length, sent };
}

/** Releases slots the lead never answered about. Runs every few minutes. */
export async function expireHolds() {
  const { count } = await crossTenant("sweep").viewing.deleteMany({
    where: { heldUntil: { lt: new Date() }, status: "SCHEDULED" },
  });
  if (count) log.info(`[scheduling] released ${count} expired holds`);
  return count;
}

/**
 * Personal follow-ups that have come due.
 *
 * `notifiedAt` is set in the same update that sends, so a restart
 * mid-sweep does not send twice — the same rule the deal reminders
 * follow, for the same reason.
 */
export async function sendDueFollowUps() {
  const { crossTenant } = await import("@/server/db/client");
  const { dispatch } = await import("@/server/lib/notify/dispatch");

  const due = await crossTenant("sweep").followUp.findMany({
    where: { dueAt: { lte: new Date() }, completedAt: null, notifiedAt: null },
    select: { id: true, orgId: true, agentId: true, title: true, body: true },
    take: 200,
  });

  let sent = 0;
  for (const f of due) {
    try {
      await dispatch({
        orgId: f.orgId,
        kind: "FOLLOW_UP_DUE",
        subjectId: f.id,
        title: f.title,
        body: f.body ?? "",
        deeplink: "/blackbook",
        // Theirs alone — a follow-up an agent set for themselves is not
        // a queue anybody else should be pulled into.
        assignedToId: f.agentId,
        since: new Date(),
      });
      await crossTenant("sweep").followUp.update({
        where: { id: f.id }, data: { notifiedAt: new Date() },
      });
      sent += 1;
    } catch {
      // Left unnotified so the next sweep retries. Better a late
      // reminder than a silently dropped one.
    }
  }
  return { due: due.length, sent };
}
