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
      /**
       * Not somebody who has been deleted.
       *
       * This filtered `optedOutOfOutreach` and not `deletedAt`, so a
       * lead the brokerage had removed still received an outbound
       * WhatsApp message about their visa. Consent was thought about
       * carefully here and erasure was not, which is the more expensive
       * half to miss: an opt-out is a preference, a deletion is usually
       * a request to be forgotten.
       */
      deletedAt: null,
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
      name: true, phone: true, assignedToId: true,
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
      due.push({
        leadId: lead.id, visaExpiresAt: lead.visaExpiresAt!, useTemplate: verdict.useTemplate,
        who: lead.name?.split(" ")[0] || lead.phone, agentId: lead.assignedToId,
      });
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

/**
 * `now` is a parameter so a check can pin it. `dueForVisaNudge` applies
 * the outreach rules, which include Dubai sending hours, so a check run
 * at 11pm would otherwise find nobody due and prove nothing.
 */
export async function sweep(now = new Date()) {
  const { crossTenant } = await import("@/server/db/client");
  let raised = 0, unassigned = 0;
  // A closed brokerage does not message anybody. Without this the sweep
  // went on sending on behalf of an account that no longer exists.
  const orgs = await crossTenant("sweep").organisation.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  for (const org of orgs) {
    const due = await dueForVisaNudge(org.id, now);
    const before = raised;
    for (const item of due) {
      if (!item.agentId) { unassigned += 1; continue; }

      /**
       * To the agent, with the draft, and stamped only alongside it.
       *
       * This stamped `visaNudgedAt` and counted the lead as `sent` beneath
       * a comment saying it was "handed to the existing send path… same
       * queue". There was no queue and no send. `visaNudgedAt` then kept
       * the lead out of this sweep for ninety days, so the one moment the
       * feature exists for was recorded as used and never happened.
       *
       * No sender, because `intelligence/autonomy.ts` stops every message
       * to a client at CONFIRM — a person presses send. The agent gets
       * the draft below, which says nothing about the visa on purpose;
       * the title does, because the agent needs to know why now.
       */
      const when = item.visaExpiresAt.toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dubai",
      });
      await crossTenant("sweep").$transaction([
        crossTenant("sweep").followUp.create({
          data: {
            orgId: org.id, agentId: item.agentId, leadId: item.leadId,
            title: `Check in with ${item.who} — their visa renews on ${when}`,
            body:
              "A renewal is when a tenant decides whether to buy. Don't mention the " +
              "visa or the date — that reads as a file on them. A draft:\n\n" +
              draftNudge(),
            dueAt: new Date(),
          },
        }),
        crossTenant("sweep").lead.update({
          where: { id: item.leadId },
          data: { visaNudgedAt: new Date() },
        }),
      ]);
      raised += 1;
    }
    if (raised > before) {
      log.info("visa renewals raised with agents", { orgId: org.id }, { count: raised - before });
    }
  }
  return { raised, unassigned };
}
