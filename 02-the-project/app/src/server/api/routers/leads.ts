import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import { leadScope } from "@/server/auth/rbac";
import { audit } from "@/server/lib/audit";
import { Prisma } from "@prisma/client";
import { BANDS, band } from "@/server/lib/intelligence/score";

const phone = z.string().regex(/^\+[1-9]\d{7,14}$/, "Include the country code.");

/**
 * What the leads screen is looking at.
 *
 * Shared because two procedures answer questions about the same set —
 * `list` returns a page of it and `distribution` counts all of it — and
 * a second copy of these clauses is how a summary comes to describe a
 * different population from the rows underneath it. The strip would
 * have said "3 Hot" over a filtered list containing none.
 */
const filters = {
  status: z
    .enum(["NEW", "QUALIFYING", "QUALIFIED", "VIEWING_BOOKED",
           "NEGOTIATING", "WON", "LOST", "UNRESPONSIVE"])
    .optional(),
  search: z.string().trim().max(80).optional(),
  /**
   * The four tabs the leads screen actually offers, which are not
   * statuses and could not be expressed as one.
   *
   *   unassigned — nobody owns it. The list a manager opens first.
   *   hot        — the buyer has replied and nobody has answered.
   *   cold       — no inbound for a fortnight and still open.
   *
   * The screen has had these buttons all along and passed
   * `{ filter }` to a procedure that only understood `status`.
   */
  filter: z.enum(["all", "unassigned", "hot", "cold"]).default("all"),
};

type Filters = z.infer<z.ZodObject<typeof filters>>;

/**
 * Typed as `Prisma.LeadWhereInput` rather than left to inference.
 *
 * The first version returned a bare object literal and needed `as never`
 * on both `status` clauses to compile — the cast that silences a real
 * question instead of answering it. Naming the return type makes the
 * compiler check the clauses against the schema, so a mistyped status
 * is an error here rather than a query that quietly matches nothing.
 */
function leadWhere(
  input: Filters,
  scope: ReturnType<typeof leadScope>,
): Prisma.LeadWhereInput {
  return {
    deletedAt: null,
    ...scope,
    ...(input.search && {
      OR: [
        { name: { contains: input.search, mode: "insensitive" as const } },
        { phone: { contains: input.search } },
      ],
    }),
    ...(input.status ? { status: input.status } : {}),

    // Nobody owns it.
    ...(input.filter === "unassigned" ? { assignedToId: null } : {}),

    /**
     * Hot: they have replied and we have not answered.
     *
     * Unread is the signal, not recency — a lead who messaged an
     * hour ago and got a reply is not hot, and one who messaged
     * yesterday and is still waiting is.
     */
    ...(input.filter === "hot"
      ? {
          status: { notIn: ["WON", "LOST", "UNRESPONSIVE"] },
          conversation: { is: { unreadCount: { gt: 0 } } },
        }
      : {}),

    /**
     * Cold: still open, nothing inbound for a fortnight.
     *
     * A lead with no conversation at all counts — an enquiry that
     * never got a reply out of anybody is the coldest thing here.
     */
    ...(input.filter === "cold"
      ? {
          status: { notIn: ["WON", "LOST"] },
          OR: [
            { conversation: { is: { lastInboundAt: { lt: new Date(Date.now() - 14 * 86_400_000) } } } },
            { conversation: { is: null } },
          ],
        }
      : {}),
  };
}

export const leadsRouter = router({
  /**
   * Cursor pagination, not offset. Offset drifts as new leads arrive —
   * which in this product is constantly — so page two silently repeats
   * rows from page one.
   */
  list: orgProcedure
    .input(
      z.object({
        ...filters,
        cursor: z.string().nullish(),
        limit: z.number().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.lead.findMany({
        where: leadWhere(input, leadScope(ctx.role, ctx.userId)),
        // One extra row tells us whether there is a next page without a
        // second count query.
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          // `stageRef` is the relation; `stage` is nothing. The board
          // needs the name, not just the id.
          id: true, name: true, phone: true, status: true,
          stageRef: { select: { id: true, name: true } },
          budgetMinFils: true, budgetMaxFils: true, intent: true, source: true,
          createdAt: true,
          /**
           * The nightly score.
           *
           * Written every night since the sweep was built and read by
           * nothing. The reasons behind it are fetched below.
           */
          score: true,
          assignedTo: { select: { id: true, name: true } },
          // `id` included: the list links each row straight into the
          // inbox thread, and without it the link fell back to the lead
          // id and opened nothing.
          conversation: { select: { id: true, unreadCount: true, lastInboundAt: true, humanHandover: true } },
        },
      });

      const nextCursor = rows.length > input.limit ? rows.pop()!.id : null;

      /**
       * Why each score is what it is.
       *
       * One query for the page rather than one per row, and a separate
       * one rather than a nested select because `LeadScoreEvent` has a
       * `leadId` column and no Prisma relation to `Lead` — it hangs off
       * `Organisation` only. Adding the relation is the tidier schema
       * and it is a migration to render a caption, so it is not done
       * here.
       *
       * Ordered oldest-first so the `Map` write for each lead ends on
       * its newest event. Getting that backwards shows an agent last
       * week's reasons under this week's number, which is exactly the
       * kind of quiet wrongness this codebase keeps finding.
       */
      const drivers = new Map<string, string[]>();
      if (rows.length > 0) {
        const events = await ctx.db.leadScoreEvent.findMany({
          where: { leadId: { in: rows.map((r) => r.id) } },
          orderBy: { computedAt: "asc" },
          select: { leadId: true, drivers: true },
        });
        for (const e of events) drivers.set(e.leadId, e.drivers);
      }

      /**
       * The band is resolved here, not in the screen.
       *
       * `band()` lives in `intelligence/score.ts` beside the thresholds
       * it reads, and that module is server-side. Sending the resolved
       * word rather than importing the function into a client component
       * keeps one owner for where "Hot" starts — a second copy of the
       * cutoffs in a `.tsx` is how the leads list and the board come to
       * disagree about the same lead.
       */
      return {
        rows: rows.map((r) => {
          const b = band(r.score);
          return {
            ...r,
            /**
             * Reasons only where there is a conclusion to explain.
             *
             * A lead whose score has been cleared, or who has an event
             * from before it was, otherwise renders "cooling — down 10
             * points this week" with no band and no number beside it —
             * an explanation of something not on the screen. The
             * drivers describe the score; without one they are debris.
             */
            drivers: b ? drivers.get(r.id) ?? [] : [],
            band: b,
          };
        }),
        nextCursor,
      };
    }),

  /**
   * The shape of the book, not a page of it.
   *
   * The screen already puts a band on every row, which answers "how
   * good is this lead". It could not answer "how good is my book" —
   * the question an owner opens this screen with — because a count per
   * band is not something you get by reading twenty-five rows and
   * remembering.
   *
   * **This is a separate query on purpose, and the reason is a bug the
   * screen already had.** `list` takes twenty-five rows, so the `<h1>`
   * reading `rows.length` was never the number of leads — at a
   * twenty-sixth it would have said 25 and stayed there, a wrong total
   * in the largest type on the page. Banding whatever the page happened
   * to contain would have inherited exactly that, and looked right
   * while doing it.
   *
   * ## Why grouped on score rather than counted per band
   *
   * Five `count()` calls would put the cutoffs in this file, beside the
   * copy of them in `score.ts`, and the two would part company the
   * first time a threshold moved. Grouping on the score column returns
   * at most 101 rows — one per possible value — and `band()` sorts them
   * here, so `score.ts` stays the only place that knows where Hot
   * begins.
   */
  distribution: orgProcedure
    .input(z.object(filters))
    .query(async ({ ctx, input }) => {
      const groups = await ctx.db.lead.groupBy({
        by: ["score"],
        where: leadWhere(input, leadScope(ctx.role, ctx.userId)),
        _count: { _all: true },
      });

      const counts = new Map<string, number>();
      let total = 0;
      /**
       * Unscored is a band of its own, and it is not Cold.
       *
       * `band(null)` returns null deliberately — a lead created since
       * last night's sweep has no score, and calling that Cold would
       * file every new enquiry under "stop chasing" on the day it
       * arrived. It is counted and named here for the same reason: a
       * book that is mostly unscored is a fact about the sweep rather
       * than about the leads, and folding it away makes the other four
       * bands look like the whole picture.
       */
      for (const g of groups) {
        const n = g._count._all;
        total += n;
        const b = band(g.score);
        const key = b?.band ?? "UNSCORED";
        counts.set(key, (counts.get(key) ?? 0) + n);
      }

      return {
        total,
        bands: [
          ...BANDS.map((b) => ({
            band: b.band as string, label: b.label, blurb: b.blurb,
            count: counts.get(b.band) ?? 0,
          })),
          {
            band: "UNSCORED", label: "Not scored yet",
            blurb: "Arrived since the last nightly run. They get a score tonight.",
            count: counts.get("UNSCORED") ?? 0,
          },
        ],
      };
    }),

  assign: requirePermission("lead:assign")
    .input(z.object({ leadId: z.string(), agentId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const before = await tx.lead.findUnique({ where: { id: input.leadId } });
        if (!before) throw new TRPCError({ code: "NOT_FOUND" });

        // The agent must be in this brokerage. Without this check an id
        // from another org would assign a lead to a stranger — RLS does
        // not police Membership lookups by id alone.
        if (input.agentId) {
          const member = await tx.membership.findUnique({
            where: { orgId_userId: { orgId: ctx.orgId, userId: input.agentId } },
          });
          if (!member) throw new TRPCError({ code: "BAD_REQUEST", message: "That agent isn't in your team." });
        }

        const after = await tx.lead.update({
          where: { id: input.leadId },
          data: { assignedToId: input.agentId, assignedAt: input.agentId ? new Date() : null },
        });

        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: "lead.assign",
          entity: "Lead",
          entityId: after.id,
          before: { assignedToId: before.assignedToId },
          after: { assignedToId: after.assignedToId },
        });

        return after;
      });
    }),

  /**
   * Soft delete. "Delete my data" is answerable with a retention date;
   * a hard delete on request is answerable with an apology when the
   * brokerage asks for it back on Monday.
   */
  remove: requirePermission("lead:delete")
    .input(z.object({ leadId: z.string() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const row = await tx.lead.update({
          where: { id: input.leadId },
          data: { deletedAt: new Date() },
        });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: "lead.delete",
          entity: "Lead",
          entityId: row.id,
        });
        return { ok: true };
      })
    ),
});
