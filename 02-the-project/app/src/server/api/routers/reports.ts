import { leaderboard, managerWindow } from "@/server/lib/reporting/leaderboard";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { router, orgProcedure } from "../trpc";
import { can } from "@/server/auth/rbac";
import { crossTenant } from "@/server/db/client";

/**
 * Reporting.
 *
 * Written for the pilot rather than for a dashboard. Every query here
 * exists to answer one of two questions: **is it faster than what they
 * were doing before**, and **is it turning enquiries into viewings**.
 * Anything that does not serve one of those is a vanity metric and is not
 * here.
 *
 * The important design decision: everything takes a date range, so the
 * same query produces the baseline and the result. A metric you can only
 * compute after switching the product on cannot prove the product worked.
 */

const range = z.object({
  from: z.date(),
  to: z.date(),
  channelId: z.string().optional(),
});

export const reportsRouter = router({
  /**
   * The board, as the person asking is allowed to see it.
   *
   * An agent gets the current window. A manager gets everything up to
   * the head start — 24 hours behind by default, so an agent sees their
   * own bad day before anybody else does and gets to raise it
   * themselves.
   */
  leaderboard: orgProcedure
    .input(z.object({ from: z.date(), to: z.date() }))
    .query(async ({ ctx, input }) => {
      // The context carries the role; `can()` is how a permission is
      // checked. There is no `ctx.permissions`.
      const canSeeEveryone = can(ctx.role, "lead:read:all");
      const board = await leaderboard({
        orgId: ctx.orgId, userId: ctx.userId, from: input.from, to: input.to,
      });
      return {
        ...board,
        to: canSeeEveryone ? managerWindow(input.to, board.headStartHours) : input.to,
        // Said plainly rather than hidden, because a manager who
        // discovers the delay by accident assumes it is a bug.
        note: canSeeEveryone
          ? `Team figures run ${board.headStartHours}h behind. Agents see their own first, on purpose.`
          : null,
      };
    }),

  /**
   * Time to first response. The entire product promise, and the only
   * number in here that would settle an argument on its own.
   *
   * Median and p90 rather than mean — one enquiry answered three days
   * late drags a mean somewhere useless, and the mean is what makes
   * every CRM's reporting untrustworthy.
   */
  responseTime: orgProcedure.input(range).query(async ({ ctx, input }) => {
    const rows = await crossTenant("sweep").$queryRaw<{
      bucket: string; median_s: number; p90_s: number; within_5m: bigint; total: bigint;
    }[]>`
      WITH first_reply AS (
        SELECT
          e.id,
          e."createdAt" AS enquired_at,
          (SELECT MIN(m."sentAt")
             FROM "Message" m
             JOIN "Conversation" c ON c.id = m."conversationId"
            WHERE c."leadId" = e."leadId"
              AND m.direction = 'OUTBOUND'
              AND m."sentAt" >= e."createdAt") AS replied_at,
          (SELECT m.author
             FROM "Message" m
             JOIN "Conversation" c ON c.id = m."conversationId"
            WHERE c."leadId" = e."leadId"
              AND m.direction = 'OUTBOUND'
              AND m."sentAt" >= e."createdAt"
            ORDER BY m."sentAt" LIMIT 1) AS first_author
        FROM "Enquiry" e
        WHERE e."orgId" = ${ctx.orgId}
          AND e."createdAt" BETWEEN ${input.from} AND ${input.to}
          ${input.channelId ? Prisma.sql`AND e."channelId" = ${input.channelId}` : Prisma.empty}
      )
      SELECT
        COALESCE(first_author::text, 'never answered') AS bucket,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (replied_at - enquired_at))) AS median_s,
        PERCENTILE_CONT(0.9) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (replied_at - enquired_at))) AS p90_s,
        COUNT(*) FILTER (WHERE replied_at - enquired_at < INTERVAL '5 minutes') AS within_5m,
        COUNT(*) AS total
      FROM first_reply
      GROUP BY 1
    `;
    return rows;
  }),

  /**
   * Response time by hour of day.
   *
   * This is the chart that sells the product, and it is the one a
   * brokerage has never seen. Their daytime numbers are usually fine.
   * It is the 8pm to 8am block where the enquiries pile up unanswered,
   * and nobody has ever put it in front of them.
   */
  responseByHour: orgProcedure.input(range).query(async ({ ctx, input }) => {
    return crossTenant("sweep").$queryRaw<{ hour: number; enquiries: bigint; median_s: number | null }[]>`
      SELECT
        EXTRACT(HOUR FROM e."createdAt" AT TIME ZONE 'Asia/Dubai')::int AS hour,
        COUNT(*) AS enquiries,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (
          (SELECT MIN(m."sentAt") FROM "Message" m
             JOIN "Conversation" c ON c.id = m."conversationId"
            WHERE c."leadId" = e."leadId" AND m.direction = 'OUTBOUND'
              AND m."sentAt" >= e."createdAt") - e."createdAt"))) AS median_s
      FROM "Enquiry" e
      WHERE e."orgId" = ${ctx.orgId}
        AND e."createdAt" BETWEEN ${input.from} AND ${input.to}
      GROUP BY 1 ORDER BY 1
    `;
  }),

  /** Enquiries in, viewings out. The only conversion that pays anyone. */
  funnel: orgProcedure.input(range).query(async ({ ctx, input }) => {
    const [enquiries, qualified, viewings, attended] = await Promise.all([
      ctx.db.enquiry.count({ where: { createdAt: { gte: input.from, lte: input.to } } }),
      ctx.db.lead.count({
        where: {
          createdAt: { gte: input.from, lte: input.to },
          // Qualified means we know what they can spend and what they want.
          // Not a stage anybody dragged them into.
          budgetMaxFils: { not: null },
          intent: { not: null },
        },
      }),
      ctx.db.viewing.count({ where: { createdAt: { gte: input.from, lte: input.to } } }),
      ctx.db.viewing.count({
        where: { createdAt: { gte: input.from, lte: input.to }, status: "COMPLETED" },
      }),
    ]);

    return {
      enquiries, qualified, viewings, attended,
      qualificationRate: enquiries ? qualified / enquiries : 0,
      viewingRate: enquiries ? viewings / enquiries : 0,
      attendanceRate: viewings ? attended / viewings : 0,
    };
  }),

  /**
   * Per channel. What a brokerage is paying each portal for, in terms
   * they can act on: not "leads delivered" but "leads we could reach, who
   * turned out to want something we sell".
   */
  byChannel: orgProcedure.input(range).query(async ({ ctx, input }) => {
    return crossTenant("sweep").$queryRaw<{
      channel: string; enquiries: bigint; reachable: bigint; qualified: bigint; viewings: bigint;
    }[]>`
      SELECT
        ch.label AS channel,
        COUNT(DISTINCT e.id) AS enquiries,
        COUNT(DISTINCT e.id) FILTER (WHERE l.phone NOT LIKE 'pending:%') AS reachable,
        COUNT(DISTINCT l.id) FILTER (WHERE l."budgetMaxFils" IS NOT NULL AND l.intent IS NOT NULL) AS qualified,
        COUNT(DISTINCT v.id) AS viewings
      FROM "Enquiry" e
      JOIN "Channel" ch ON ch.id = e."channelId"
      JOIN "Lead" l ON l.id = e."leadId"
      LEFT JOIN "Viewing" v ON v."leadId" = l.id AND v."createdAt" >= e."createdAt"
      WHERE e."orgId" = ${ctx.orgId}
        AND e."createdAt" BETWEEN ${input.from} AND ${input.to}
      GROUP BY 1 ORDER BY 2 DESC
    `;
  }),

  /**
   * Baseline capture.
   *
   * Run this **before** the assistant is switched on, and store the
   * result. Everything above can be recomputed later; this exists so
   * nobody has to trust that it was.
   *
   * A pilot without a baseline captured beforehand cannot be failed, and
   * a pilot that cannot be failed is not a pilot.
   */
  captureBaseline: orgProcedure
    .input(z.object({ label: z.string().max(60), from: z.date(), to: z.date() }))
    .mutation(async ({ ctx, input }) => {
      const [rt, funnel] = await Promise.all([
        crossTenant("sweep").$queryRaw<{ median_s: number; within_5m: bigint; total: bigint }[]>`
          SELECT
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (
              (SELECT MIN(m."sentAt") FROM "Message" m
                 JOIN "Conversation" c ON c.id = m."conversationId"
                WHERE c."leadId" = e."leadId" AND m.direction = 'OUTBOUND'
                  AND m."sentAt" >= e."createdAt") - e."createdAt"))) AS median_s,
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM "Message" m
                JOIN "Conversation" c ON c.id = m."conversationId"
               WHERE c."leadId" = e."leadId" AND m.direction = 'OUTBOUND'
                 AND m."sentAt" BETWEEN e."createdAt" AND e."createdAt" + INTERVAL '5 minutes'
            )) AS within_5m,
            COUNT(*) AS total
          FROM "Enquiry" e
          WHERE e."orgId" = ${ctx.orgId} AND e."createdAt" BETWEEN ${input.from} AND ${input.to}
        `,
        ctx.db.enquiry.count({ where: { createdAt: { gte: input.from, lte: input.to } } }),
      ]);

      // Written to the audit log rather than a mutable settings row, so
      // the baseline cannot be quietly adjusted after the result is in.
      await crossTenant("sweep").$transaction(async (tx) => {
        await tx.auditLog.create({
          data: {
            orgId: ctx.orgId,
            actorId: ctx.userId,
            action: "pilot.baseline",
            entity: "Organisation",
            entityId: ctx.orgId,
            after: {
              label: input.label,
              from: input.from.toISOString(),
              to: input.to.toISOString(),
              medianResponseSeconds: rt[0]?.median_s ?? null,
              answeredWithin5m: Number(rt[0]?.within_5m ?? 0),
              enquiries: funnel,
            },
          },
        });
      });

      return { captured: true, ...rt[0] };
    }),
});
