import { crossTenant } from "@/server/db/client";
import { log } from "@/lib/log";

/**
 * Leases coming to an end, on the agent's list in time to act.
 *
 * UAE law (Dubai Law 26 of 2007, art. 14) gives either party ninety
 * days' written notice to change the terms at renewal. A lease that
 * reaches its end unnoticed renews on the old rent, or empties — both a
 * cost the brokerage did not choose. So the task arrives before the
 * ninety-day line with ten days to spare, once per lease, and names the
 * date that matters.
 *
 * Like every other proactive job here, it puts a task on a person's list
 * and contacts nobody (`intelligence/autonomy.ts`).
 */
export const NOTICE_DAYS = 90;
const LEAD_DAYS = NOTICE_DAYS + 10;

export async function sweepRenewals(now = new Date()) {
  const db = crossTenant("sweep");
  const horizon = new Date(now.getTime() + LEAD_DAYS * 86_400_000);
  const due = await db.tenancy.findMany({
    where: { endedAt: null, renewalTaskAt: null, endsAt: { gt: now, lte: horizon } },
    select: {
      id: true, orgId: true, endsAt: true, agentId: true, leadId: true, tenantName: true,
      listing: { select: { reference: true, title: true, agentId: true, vendorId: true, deletedAt: true } },
    },
  });

  let tasked = 0, unowned = 0;
  for (const t of due) {
    if (t.listing.deletedAt) continue;
    const agentId = t.agentId ?? t.listing.agentId;
    // Nobody to tell is reported rather than skipped silently: a lease
    // with no agent is the one most likely to be forgotten.
    if (!agentId) { unowned += 1; continue; }
    const noticeBy = new Date(t.endsAt.getTime() - NOTICE_DAYS * 86_400_000);
    const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dubai" });
    await db.$transaction([
      db.followUp.create({
        data: {
          orgId: t.orgId, agentId, leadId: t.leadId, vendorId: t.listing.vendorId,
          title: `Lease on ${t.listing.reference} ends ${day(t.endsAt)} — agree the renewal`,
          body: `Any change to the rent needs written notice by ${day(noticeBy)} (90 days before the end). ` +
                `Ask the landlord what they want, then ${t.tenantName ?? "the tenant"}.`,
          dueAt: noticeBy < now ? now : new Date(Math.min(noticeBy.getTime(), now.getTime() + 3 * 86_400_000)),
        },
      }),
      db.tenancy.update({ where: { id: t.id }, data: { renewalTaskAt: now } }),
    ]);
    tasked += 1;
  }
  if (unowned) log.warn("tenancies with no agent to remind", {}, { unowned });
  return { due: due.length, tasked, unowned };
}
