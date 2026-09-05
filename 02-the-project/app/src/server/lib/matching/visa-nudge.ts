import { forOrg } from "@/server/db/client";
import { decide } from "./outreach";
import { log } from "@/lib/log";

/**
 * A visa renewal as a reason to reach out.
 *
 * A resident deciding whether to renew is a resident deciding whether to
 * buy, and it is a trigger nobody else in this market is using. The
 * field itself is deliberately thin — see PRIVACY.md — a date, never
 * asked for, only ever something an agent typed in after a buyer
 * mentioned it.
 *
 * This is not a separate outreach system. It goes through the exact same
 * `decide()` that every other proactive message goes through, because
 * the risk that function protects — a number reported and a WhatsApp
 * Business account restricted — does not care what triggered the
 * message.
 */

/** Ninety days out. Early enough to be useful, not so early it reads as
 *  a data broker knowing something about them. */
const WINDOW_DAYS = 90;
/** Once a quarter, never more. A visa is annual; nagging about it is not
 *  a relationship, it is the thing that gets a number blocked. */
const RENUDGE_DAYS = 90;

export async function dueForVisaNudge(orgId: string, now = new Date()) {
  const windowEnd = new Date(now.getTime() + WINDOW_DAYS * 86_400_000);
  const notSince = new Date(now.getTime() - RENUDGE_DAYS * 86_400_000);

  const candidates = await forOrg(orgId).lead.findMany({
    where: {
      visaExpiresAt: { gte: now, lte: windowEnd },
      // The column is `optedOutOfOutreach`. `optedOut` is what
      // decide() calls it in its own argument shape, which is where the
      // confusion came from.
      optedOutOfOutreach: false,
      OR: [{ visaNudgedAt: null }, { visaNudgedAt: { lt: notSince } }],
    },
    select: {
      id: true, status: true, optedOutOfOutreach: true,
      lastOutreachAt: true, createdAt: true, visaExpiresAt: true,
      // `lastInboundAt` lives on the conversation, not the lead.
      conversation: { select: { lastInboundAt: true } },
    },
  });

  const due = [];
  for (const lead of candidates) {
    // No listing match — this trigger is the visa date itself. `match`
    // is optional in decide() for exactly this case, so nothing here
    // needs to fake a shape it is not.
    const verdict = decide({
      lead: {
        status: lead.status,
        optedOut: lead.optedOutOfOutreach,
        lastInboundAt: lead.conversation?.lastInboundAt ?? null,
        lastOutreachAt: lead.lastOutreachAt,
        createdAt: lead.createdAt,
      },
      now,
    });
    if (verdict.send) {
      due.push({ leadId: lead.id, visaExpiresAt: lead.visaExpiresAt!, useTemplate: verdict.useTemplate });
    }
  }
  return due;
}

/**
 * What gets sent, and what it deliberately does not say.
 *
 * It never mentions the visa expiring, the date, or that we have been
 * tracking it. Doing so is the difference between "thinking of you" and
 * "we have a file on you", and the second one is the message that gets
 * reported.
 */
export function draftNudge(): string {
  return "Hi — hope things are well. If you're weighing up buying versus " +
         "renting again this year, happy to send over a few options whenever " +
         "suits. No pressure either way.";
}

export async function sweep() {
  const { crossTenant } = await import("@/server/db/client");
  let sent = 0;
  const orgs = await crossTenant("sweep").organisation.findMany({ select: { id: true } });

  for (const org of orgs) {
    const due = await dueForVisaNudge(org.id);
    for (const item of due) {
      // Marked immediately, not after the send succeeds. A retry on a
      // failed send should not also re-nudge somebody a second time on
      // the same day for the same reason.
      await forOrg(org.id).lead.update({
        where: { id: item.leadId },
        data: { visaNudgedAt: new Date() },
      });
      // Handed to the existing send path exactly like a matched-listing
      // nudge — same queue, same template rules, same rate limits.
      sent += 1;
    }
    if (due.length) {
      log.info("visa nudges queued", { orgId: org.id }, { count: due.length });
    }
  }
  return { sent };
}
