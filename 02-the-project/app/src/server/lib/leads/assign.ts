import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { audit } from "@/server/lib/audit";

/**
 * Give leads to an agent, or back to the pool.
 *
 * Moved out of the old `pipeline.bulkAssign` when the leads list grew bulk
 * actions of its own, so there is one way leads change hands — with the
 * ownership history and the audit entry — however many are selected and
 * from whichever screen.
 */
export async function assignLeads(
  tx: Prisma.TransactionClient,
  args: { orgId: string; actorId: string; leadIds: string[]; agentId: string | null },
): Promise<{ count: number }> {
  const ctx = { orgId: args.orgId, userId: args.actorId };
  const input = { leadIds: args.leadIds, agentId: args.agentId };
  if (input.agentId) {
    const member = await tx.membership.findUnique({
      where: { orgId_userId: { orgId: ctx.orgId, userId: input.agentId } },
    });
    if (!member) throw new TRPCError({ code: "BAD_REQUEST", message: "That agent isn't in your team." });
  }

  /**
   * Read the current owners before overwriting them.
   *
   * `updateMany` returns a count and nothing else, so the previous
   * owner of each lead is gone the moment it runs — and the
   * previous owner is exactly what an ownership row has to record.
   * A bulk move that says two hundred leads changed hands without
   * saying whose they were is the version of this feature that
   * causes the argument rather than settling it.
   */
  const beforeRows = await tx.lead.findMany({
    where: { id: { in: input.leadIds }, deletedAt: null },
    select: { id: true, assignedToId: true },
  });

  const { count } = await tx.lead.updateMany({
    where: { id: { in: input.leadIds }, deletedAt: null },
    // `assignedAt` goes back to null with the owner. A lead in the
    // pool that still carries the date somebody was given it reads
    // as owned to every "how long has this been sitting with them"
    // question, including the stale-lead sweep.
    data: {
      assignedToId: input.agentId,
      assignedAt: input.agentId ? new Date() : null,
    },
  });

  /**
   * An ownership row per lead, even though the audit entry is one.
   *
   * The audit log is the manager's record of an action — one line,
   * readable. `LeadOwnership` is the *lead's* history, and it is
   * read per lead when somebody asks why a particular client is
   * not theirs any more. Two hundred audit lines would be
   * unreadable; two hundred ownership rows are one row each on two
   * hundred separate screens.
   */
  const moved = beforeRows.filter((l) => l.assignedToId !== input.agentId);
  if (moved.length) {
    await tx.leadOwnership.updateMany({
      where: { orgId: ctx.orgId, leadId: { in: moved.map((l) => l.id) }, endedAt: null },
      data: { endedAt: new Date() },
    });
    /**
     * Returning to the pool closes the old row and opens none.
     *
     * An ownership row records who holds a lead. Nobody holding it
     * is the absence of one, not a row with a null owner — which
     * would read as "assigned to nobody" in every query that joins
     * on `userId` and would put a phantom owner in the history.
     * The closed `endedAt` is the record that it happened, and the
     * audit entry below says who did it.
     */
    const agentId = input.agentId;
    if (agentId) {
      await tx.leadOwnership.createMany({
        data: moved.map((l) => ({
          orgId: ctx.orgId,
          leadId: l.id,
          userId: agentId,
          fromUserId: l.assignedToId,
          reason: l.assignedToId ? ("REASSIGNED" as const) : ("MANUAL" as const),
          actorId: ctx.userId,
        })),
      });
    }
  }

  // One audit entry for the action, not two hundred. A log nobody
  // can read is a log nobody reads.
  await audit(tx, ctx.orgId, {
    actorId: ctx.userId,
    action: input.agentId ? "lead.bulk_assign" : "lead.bulk_unassign",
    entity: "Lead",
    entityId: `${count} leads`,
    after: { agentId: input.agentId, count },
  });

  return { count };
}
