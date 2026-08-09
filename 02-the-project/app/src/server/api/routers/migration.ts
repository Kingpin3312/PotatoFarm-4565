import { z } from "zod";
import { router, requirePermission } from "../trpc";
import { inspectContacts, inspectDeals, summarise } from "@/server/lib/migration/quality";
import { STAGES, HONEST_SCOPE, ROLLBACK } from "@/server/lib/migration/cutover";

export const migrationRouter = router({
  /** The plan, with its exit criteria. Shown to the customer, not hidden. */
  plan: requirePermission("org:update").query(() => ({
    stages: STAGES,
    scope: HONEST_SCOPE,
    rollback: ROLLBACK,
  })),

  /**
   * Dry run over an export. Nothing is written — the whole point is that
   * they see the state of their own data before agreeing to anything.
   */
  inspect: requirePermission("org:update")
    .input(z.object({
      contacts: z.array(z.record(z.string(), z.string().nullable())).max(20_000).default([]),
      deals: z.array(z.record(z.string(), z.string().nullable())).max(5_000).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const members = await ctx.db.membership.findMany({
        select: { user: { select: { email: true } } },
      });
      const agentEmails = new Set(members.map((m) => m.user.email.toLowerCase()));

      const knownStages = new Set([
        "AGREED", "MOU_SIGNED", "DEPOSIT_PAID", "MORTGAGE_APPLIED", "VALUATION_DONE",
        "FINAL_OFFER", "LIABILITY_LETTER", "NOC_APPLIED", "NOC_RECEIVED",
        "TRANSFER_BOOKED", "COMPLETED",
      ]);

      const issues = [
        ...inspectContacts(input.contacts, { agentEmails }),
        ...inspectDeals(input.deals, knownStages),
      ];

      return {
        counted: { contacts: input.contacts.length, deals: input.deals.length },
        ...summarise(issues),
        // Stated up front, because a blocker discovered at cutover is a
        // blocker discovered too late.
        readiness:
          summarise(issues).blockers > 0
            ? "Some records cannot be imported as they stand. Work through the blockers first."
            : "Nothing blocking. The decisions still need somebody to make them.",
      };
    }),

  status: requirePermission("org:update").query(({ ctx }) =>
    ctx.db.migration.findFirst({
      where: { state: { notIn: ["COMPLETE", "ABANDONED"] } },
      include: { issues: { where: { decision: null }, take: 50 } },
      orderBy: { startedAt: "desc" },
    })
  ),
});
