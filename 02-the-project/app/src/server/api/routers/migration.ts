import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requirePermission } from "../trpc";
import { audit } from "@/server/lib/audit";
import { inspectContacts, inspectDeals, summarise } from "@/server/lib/migration/quality";
import { STAGES, HONEST_SCOPE, ROLLBACK } from "@/server/lib/migration/cutover";

/**
 * The deal stages we can take from an export.
 *
 * Hoisted out of `inspect` when `start` needed it too: two copies is how
 * the dry run a brokerage agreed to and the record we act on come to
 * disagree about what "unmapped" means.
 */
const KNOWN_STAGES = new Set([
  "AGREED", "MOU_SIGNED", "DEPOSIT_PAID", "MORTGAGE_APPLIED", "VALUATION_DONE",
  "FINAL_OFFER", "LIABILITY_LETTER", "NOC_APPLIED", "NOC_RECEIVED",
  "TRANSFER_BOOKED", "COMPLETED",
]);

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

      const issues = [
        ...inspectContacts(input.contacts, { agentEmails }),
        ...inspectDeals(input.deals, KNOWN_STAGES),
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

  /**
   * Begin one, from the same inspection the dry run showed.
   *
   * `status` queries a `Migration` and **nothing anywhere created one**,
   * so it returned null for every brokerage that ever existed. A
   * customer could upload their old CRM export, get a full quality
   * report on it, and then reach the end of the feature. The module
   * around it is the most commercially weighted thing in the product —
   * its README opens by saying every real customer is coming off
   * something else — and it could not be started.
   *
   * The issues are recomputed here rather than passed in from the
   * client's dry run. Trusting the browser's copy would let the report
   * somebody agreed to and the record we act on drift apart, and the
   * whole design of this module is that nothing is silently different
   * from what the brokerage was shown.
   *
   * It creates a `DRAFT`. Staging is a separate step with its own exit
   * criteria, and `stagedCounts` stays null until something has actually
   * been staged — a count written at the moment of starting would be a
   * claim about work not yet done.
   */
  start: requirePermission("org:update")
    .input(z.object({
      source: z.string().trim().min(2).max(60),
      contacts: z.array(z.record(z.string(), z.string().nullable())).max(20_000).default([]),
      deals: z.array(z.record(z.string(), z.string().nullable())).max(5_000).default([]),
      /** What the source's own reports say it holds. */
      claimedContacts: z.number().int().min(0).optional(),
      claimedDeals: z.number().int().min(0).optional(),
      sourceArchiveRef: z.string().max(300).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      /**
       * One live migration at a time.
       *
       * `status` takes `findFirst`, so two open migrations would make
       * which one a brokerage is looking at depend on insertion order —
       * and this is the screen somebody makes a cutover decision on.
       */
      const open = await ctx.db.migration.findFirst({
        where: { state: { notIn: ["COMPLETE", "ABANDONED"] } },
        select: { id: true, source: true },
      });
      if (open) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A migration from ${open.source} is already under way. Finish or abandon it first.`,
        });
      }

      const members = await ctx.db.membership.findMany({
        select: { user: { select: { email: true } } },
      });
      const agentEmails = new Set(members.map((m) => m.user.email.toLowerCase()));
      const issues = [
        ...inspectContacts(input.contacts, { agentEmails }),
        ...inspectDeals(input.deals, KNOWN_STAGES),
      ];

      const migration = await ctx.db.$transaction(async (tx) => {
        const m = await tx.migration.create({
          data: {
            orgId: ctx.orgId,
            source: input.source,
            state: "DRAFT",
            // What they say they have, recorded now so the comparison at
            // staging is against a number agreed before anybody saw ours.
            claimedCounts:
              input.claimedContacts === undefined && input.claimedDeals === undefined
                ? undefined
                : { contacts: input.claimedContacts ?? null, deals: input.claimedDeals ?? null },
            sourceArchiveRef: input.sourceArchiveRef,
            issues: {
              create: issues.map((i) => ({
                orgId: ctx.orgId,
                severity: i.severity,
                kind: i.kind,
                entity: i.entity,
                sourceRef: i.sourceRef,
                detail: i.detail,
                // The suggestion is recorded and the decision is not.
                // Nothing is silently fixed — that is the whole argument
                // in the README, and a pre-filled decision is a silent
                // fix with a name on it.
                suggestion: i.suggestion,
              })),
            },
          },
          select: { id: true },
        });

        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: "migration.start",
          entity: "Migration",
          entityId: m.id,
          after: { source: input.source, issues: issues.length },
        });
        return m;
      });

      return { id: migration.id, issues: issues.length };
    }),

  /**
   * Record what somebody decided about one issue.
   *
   * Recorded rather than applied. `decision` is a note on the record, so
   * that at reconciliation the brokerage can see what was chosen and by
   * whom — "decisions on duplicates and unknown owners recorded, not
   * assumed" is one of the three exit criteria for RECONCILED.
   */
  decide: requirePermission("org:update")
    .input(z.object({ issueId: z.string(), decision: z.string().trim().min(2).max(300) }))
    .mutation(async ({ ctx, input }) => {
      const issue = await ctx.db.migrationIssue.findFirst({
        where: { id: input.issueId },
        select: { id: true, migrationId: true },
      });
      if (!issue) throw new TRPCError({ code: "NOT_FOUND", message: "No such issue." });

      await ctx.db.migrationIssue.update({
        where: { id: issue.id },
        data: { decision: input.decision, decidedById: ctx.userId },
      });
      return { ok: true as const };
    }),

  /**
   * Move to the next stage, with its exit criteria in front of you.
   *
   * The criteria are returned by `plan` and shown on the screen; this
   * refuses the one that can be checked mechanically. A brokerage cannot
   * leave DRAFT with unresolved blockers, because a blocker is by
   * definition a record that cannot be imported as it stands, and
   * carrying it forward means discovering it at cutover.
   *
   * The others — "somebody has opened ten leads they know well" — cannot
   * be checked by a server and are deliberately not pretended at. They
   * are an acknowledgement, recorded with a name against it.
   */
  advance: requirePermission("org:update")
    .input(z.object({
      to: z.enum(["STAGED", "RECONCILED", "PARALLEL", "COMPLETE"]),
      /** The criteria the person is signing off. */
      acknowledged: z.array(z.string()).min(1),
      stagedContacts: z.number().int().min(0).optional(),
      stagedDeals: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const m = await ctx.db.migration.findFirst({
        where: { state: { notIn: ["COMPLETE", "ABANDONED"] } },
        orderBy: { startedAt: "desc" },
        select: { id: true, state: true },
      });
      if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "No migration is under way." });

      const order = ["DRAFT", "STAGED", "RECONCILED", "PARALLEL", "COMPLETE"] as const;
      const from = order.indexOf(m.state as (typeof order)[number]);
      if (order.indexOf(input.to) !== from + 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `A migration goes ${order.join(" → ")}. It is at ${m.state}.`,
        });
      }

      if (input.to === "STAGED") {
        const blockers = await ctx.db.migrationIssue.count({
          where: { migrationId: m.id, severity: "BLOCKER", decision: null },
        });
        if (blockers > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${blockers} blocker${blockers === 1 ? "" : "s"} still have no decision. ` +
              `A blocker is a record that cannot be imported as it stands — carrying it ` +
              `forward means finding it at cutover.`,
          });
        }
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.migration.update({
          where: { id: m.id },
          data: {
            state: input.to,
            ...(input.to === "STAGED" && (input.stagedContacts !== undefined || input.stagedDeals !== undefined)
              ? { stagedCounts: { contacts: input.stagedContacts ?? null, deals: input.stagedDeals ?? null } }
              : {}),
            ...(input.to === "PARALLEL" ? { cutoverAt: new Date() } : {}),
            ...(input.to === "COMPLETE" ? { completedAt: new Date() } : {}),
          },
        });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: "migration.advance",
          entity: "Migration",
          entityId: m.id,
          before: { state: m.state },
          after: { state: input.to, acknowledged: input.acknowledged },
        });
      });

      return { state: input.to };
    }),

  /**
   * Stop, with the reason on the record.
   *
   * `ROLLBACK` promises the old system stays live and nothing is deleted
   * at cutover, so abandoning is a decision rather than a recovery. What
   * it must not be is silent: a migration that stops with no reason is
   * one nobody can learn anything from.
   */
  abandon: requirePermission("org:update")
    .input(z.object({ reason: z.string().trim().min(4).max(300) }))
    .mutation(async ({ ctx, input }) => {
      const m = await ctx.db.migration.findFirst({
        where: { state: { notIn: ["COMPLETE", "ABANDONED"] } },
        orderBy: { startedAt: "desc" },
        select: { id: true, state: true },
      });
      if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "No migration is under way." });

      await ctx.db.$transaction(async (tx) => {
        await tx.migration.update({
          where: { id: m.id },
          data: { state: "ABANDONED", abandonedAt: new Date(), abandonReason: input.reason },
        });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: "migration.abandon",
          entity: "Migration", entityId: m.id,
          before: { state: m.state }, after: { reason: input.reason },
        });
      });
      return { ok: true as const };
    }),

  status: requirePermission("org:update").query(({ ctx }) =>
    ctx.db.migration.findFirst({
      where: { state: { notIn: ["COMPLETE", "ABANDONED"] } },
      include: { issues: { where: { decision: null }, take: 50 } },
      orderBy: { startedAt: "desc" },
    })
  ),
});
