import { log } from "@/lib/log";
// The one money formatter. The budget column is fils; rendering it with
// Number().toLocaleString() showed a AED 2.5m lead as "AED 250,000,000".
import { aedShort } from "@/lib/money";
import { crossTenant } from "@/server/db/client";
import { dispatch } from "./dispatch";

/**
 * The sweep. Runs every couple of minutes.
 *
 * Written as a scan rather than as triggers fired at the moment something
 * happens, on purpose: the interesting condition is almost always
 * *absence* — a handover nobody answered, a qualified lead nobody claimed,
 * a viewing nobody wrote up. You cannot fire an event when nothing
 * happens.
 */
export async function sweep() {
  const results = await Promise.allSettled([
    handoversWaiting(),
    qualifiedUnclaimed(),
    viewingsSoon(),
    outcomesMissing(),
    ownersWaiting(),
  ]);

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      log.error(`[notify] sweep ${["handovers", "unclaimed", "viewings", "outcomes", "owners"][i]} failed`, r.reason);
    }
  });
}

/** The one genuinely urgent case: somebody is mid-conversation, waiting. */
async function handoversWaiting() {
  const rows = await crossTenant("sweep").conversation.findMany({
    where: {
      humanHandover: true,
      handoverAt: { not: null, lte: new Date(Date.now() - 3 * 60_000) },
      // No outbound message since the handover means nobody has replied.
      messages: { none: { direction: "OUTBOUND", author: "AGENT" } },
      // A handover is the assistant stepping back from a buyer. It never
      // speaks to an owner, so an owner's thread has nothing to hand over.
      leadId: { not: null },
    },
    take: 200,
    select: {
      id: true, orgId: true, handoverAt: true, handoverReason: true,
      lead: { select: { id: true, name: true, phone: true, assignedToId: true } },
    },
  });

  for (const c of rows) {
    if (!c.lead) continue;
    await dispatch({
      orgId: c.orgId,
      kind: "HANDOVER_WAITING",
      subjectId: c.id,
      title: `${c.lead.name ?? c.lead.phone} is waiting for a person`,
      body: c.handoverReason ?? "The assistant stepped back.",
      deeplink: `/inbox/${c.id}`,
      assignedToId: c.lead.assignedToId,
      since: c.handoverAt!,
    });
  }
}

/**
 * An owner wrote, and the last word in the thread is still theirs.
 *
 * One notification per unanswered message rather than per thread: the
 * dedup key is the subject, and keyed on the conversation it would have
 * told the agent about an owner's first message and never again.
 *
 * Addressed to whoever looks after one of the owner's properties. With
 * nobody given one, `audience` falls through to the managers, which is
 * the right place for an owner nobody is looking after.
 */
async function ownersWaiting() {
  const rows = await crossTenant("sweep").conversation.findMany({
    where: {
      vendorId: { not: null },
      // A week back is plenty: anything older has been escalated already
      // or is not going to be answered by a push.
      lastInboundAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
    },
    take: 200,
    select: {
      id: true, orgId: true,
      vendor: {
        select: {
          name: true,
          listings: {
            where: { deletedAt: null, agentId: { not: null } },
            orderBy: { updatedAt: "desc" }, take: 1, select: { agentId: true },
          },
        },
      },
      messages: {
        take: 1, orderBy: { sentAt: "desc" },
        select: { id: true, direction: true, body: true, sentAt: true },
      },
    },
  });

  for (const c of rows) {
    const last = c.messages[0];
    if (!c.vendor || !last || last.direction !== "INBOUND") continue;
    await dispatch({
      orgId: c.orgId,
      kind: "OWNER_WAITING",
      subjectId: last.id,
      title: `${c.vendor.name} (owner) is waiting for a reply`,
      // The first line only. A push on a lock screen is read by whoever
      // is standing next to the phone.
      body: last.body.split("\n")[0]!.slice(0, 80),
      deeplink: `/inbox/${c.id}`,
      assignedToId: c.vendor.listings[0]?.agentId ?? null,
      since: last.sentAt,
    });
  }
}

/** Qualified, and nobody owns it. The hard part is already done. */
async function qualifiedUnclaimed() {
  const rows = await crossTenant("sweep").lead.findMany({
    where: {
      deletedAt: null,
      assignedToId: null,
      budgetMaxFils: { not: null },
      intent: { not: null },
      updatedAt: { lte: new Date(Date.now() - 15 * 60_000) },
    },
    take: 200,
    select: { id: true, orgId: true, name: true, phone: true, budgetMaxFils: true, updatedAt: true },
  });

  for (const l of rows) {
    await dispatch({
      orgId: l.orgId,
      kind: "QUALIFIED_UNCLAIMED",
      subjectId: l.id,
      title: `Qualified lead, nobody assigned`,
      // The budget is in the title bar of the notification because it is
      // what decides whether somebody pulls over to look at it.
      body: `${l.name ?? l.phone} · up to ${aedShort(l.budgetMaxFils)}`,
      deeplink: `/pipeline?lead=${l.id}`,
      assignedToId: null,
      since: l.updatedAt,
    });
  }
}

async function viewingsSoon() {
  const now = Date.now();
  const rows = await crossTenant("sweep").viewing.findMany({
    where: {
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      remindedAgentAt: null,
      scheduledAt: { gte: new Date(now), lte: new Date(now + 75 * 60_000) },
    },
    take: 100,
    select: {
      id: true, orgId: true, agentId: true, scheduledAt: true,
      lead: { select: { name: true, phone: true } },
      listing: { select: { title: true, community: true } },
    },
  });

  for (const v of rows) {
    if (!v.agentId) continue;
    await dispatch({
      orgId: v.orgId,
      kind: "VIEWING_SOON",
      subjectId: v.id,
      title: `Viewing in an hour`,
      body: `${v.lead.name ?? v.lead.phone} · ${v.listing?.title ?? "property"}`,
      // Today's diary. `/viewings/<id>` has never been a page.
      deeplink: `/viewings#viewing-${v.id}`,
      assignedToId: v.agentId,
      since: new Date(now),
    });
    await crossTenant("sweep").viewing.update({ where: { id: v.id }, data: { remindedAgentAt: new Date() } });
  }
}

/** Chased once, then it goes in the digest. Nagging trains people to ignore. */
async function outcomesMissing() {
  const rows = await crossTenant("sweep").viewing.findMany({
    where: {
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      scheduledAt: { lte: new Date(Date.now() - 3 * 3_600_000) },
    },
    take: 100,
    select: { id: true, orgId: true, agentId: true, scheduledAt: true,
              lead: { select: { name: true, phone: true } } },
  });

  for (const v of rows) {
    if (!v.agentId) continue;
    await dispatch({
      orgId: v.orgId,
      kind: "OUTCOME_MISSING",
      subjectId: v.id,
      title: "How did the viewing go?",
      body: `${v.lead.name ?? v.lead.phone} · two taps`,
      // The day it happened, on the card that asks. The diary shows one
      // day, by UTC date, and this is often yesterday.
      deeplink: `/viewings?date=${v.scheduledAt.toISOString().slice(0, 10)}#viewing-${v.id}`,
      assignedToId: v.agentId,
      since: v.scheduledAt,
    });
  }
}
