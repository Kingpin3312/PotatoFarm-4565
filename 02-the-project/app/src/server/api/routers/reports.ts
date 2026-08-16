import { leaderboard } from "@/server/lib/reporting/leaderboard";
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

/**
 * The same range, but optional, defaulting to the last 30 days.
 *
 * The reports screen calls `responseTime()`, `responseByHour()` and
 * `byChannel()` with no arguments — it has no date picker, because the
 * question it answers is "how are we doing" rather than "what happened
 * between two dates somebody typed". Every one of those calls failed to
 * compile against a required input.
 *
 * Defaulting here rather than making the screen invent a range means the
 * three charts on one page cannot disagree about what period they show,
 * which they would the moment two of them computed `new Date()`
 * separately.
 */
const optionalRange = range.partial({ from: true, to: true }).optional().transform((v) => {
  const to = v?.to ?? new Date();
  const from = v?.from ?? new Date(to.getTime() - 30 * 86_400_000);
  return { from, to, channelId: v?.channelId };
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
      /**
       * The head start is applied inside `leaderboard` now.
       *
       * This used to call `managerWindow` here, on the `to` field of the
       * response, after the board had already been counted over the full
       * window — so a manager got today's real figures under a timestamp
       * a day old. The window is passed in and the module that owns the
       * policy decides what to count.
       */
      const board = await leaderboard({
        orgId: ctx.orgId, userId: ctx.userId,
        from: input.from, to: input.to, seesEveryone: canSeeEveryone,
      });
      return {
        ...board,
        to: board.countedTo,
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
  responseTime: orgProcedure.input(optionalRange).query(async ({ ctx, input }) => {
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

    /**
     * The baseline, read back from where `captureBaseline` put it.
     *
     * It is written to the audit log on purpose — a mutable settings row
     * could be nudged after the result is in, and the whole point of a
     * baseline is that it cannot be. Reading it back is the half that was
     * never written: this procedure returned raw buckets grouped by who
     * replied first, the screen asked for `data.baseline` and
     * `data.current`, and the comparison that the pilot is sold on did
     * not exist on either side of the wire.
     *
     * The most recent capture wins. A brokerage that re-baselines has
     * decided the earlier one was wrong, and the audit log still holds
     * both.
     */
    const captured = await crossTenant("sweep").auditLog.findFirst({
      where: { orgId: ctx.orgId, action: "pilot.baseline" },
      orderBy: { createdAt: "desc" },
      select: { after: true, createdAt: true },
    });

    const snapshot = (captured?.after ?? null) as {
      label?: string;
      medianResponseSeconds?: number | null;
      answeredWithin5m?: number;
      enquiries?: number;
    } | null;

    /**
     * Answered enquiries only, and every bucket that is not "never
     * answered" counts — assistant and agent alike. The question is how
     * fast the brokerage replied, not who happened to do it.
     */
    const answered = rows.filter((r) => r.bucket !== "never answered");
    const totalAnswered = answered.reduce((n, r) => n + Number(r.total), 0);

    /**
     * A count-weighted mean of per-bucket medians.
     *
     * Not a true median across the whole set — that would need the raw
     * rows back — and it is named honestly rather than presented as one.
     * With one or two buckets, which is the normal case, the two are the
     * same number.
     */
    const medianSeconds = totalAnswered
      ? answered.reduce((n, r) => n + (r.median_s ?? 0) * Number(r.total), 0) / totalAnswered
      : 0;

    const toMins = (seconds: number | null | undefined) =>
      seconds == null ? 0 : Math.round((seconds / 60) * 10) / 10;

    return {
      /** Kept so a caller that wants the split by who replied still has it. */
      buckets: rows,
      current: {
        medianMins: toMins(medianSeconds),
        count: totalAnswered,
        within5m: answered.reduce((n, r) => n + Number(r.within_5m), 0),
        neverAnswered: rows
          .filter((r) => r.bucket === "never answered")
          .reduce((n, r) => n + Number(r.total), 0),
      },
      baseline: snapshot
        ? {
            label: snapshot.label ?? "Baseline",
            medianMins: toMins(snapshot.medianResponseSeconds),
            count: snapshot.enquiries ?? 0,
            within5m: snapshot.answeredWithin5m ?? 0,
            capturedAt: captured!.createdAt,
          }
        : null,
    };
  }),

  /**
   * Response time by hour of day.
   *
   * This is the chart that sells the product, and it is the one a
   * brokerage has never seen. Their daytime numbers are usually fine.
   * It is the 8pm to 8am block where the enquiries pile up unanswered,
   * and nobody has ever put it in front of them.
   */
  responseByHour: orgProcedure.input(optionalRange).query(async ({ ctx, input }) => {
    const rows = await crossTenant("sweep").$queryRaw<{ hour: number; enquiries: bigint; median_s: number | null }[]>`
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

    /**
     * Named `hours`, and in minutes.
     *
     * The chart plots `h.medianMins` against `h.enquiries`. It was handed
     * a bare array of rows carrying `median_s`, so both the wrapper and
     * the unit were missing. Every hour of the day is present even where
     * nothing came in — a bar chart with gaps in it reads as missing
     * data rather than a quiet hour, and the quiet hours are the point.
     */
    const byHour = new Map(rows.map((r) => [r.hour, r]));

    return {
      hours: Array.from({ length: 24 }, (_, hour) => {
        const row = byHour.get(hour);
        return {
          hour,
          enquiries: Number(row?.enquiries ?? 0),
          medianMins: row?.median_s == null ? 0 : Math.round((row.median_s / 60) * 10) / 10,
        };
      }),
    };
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
  byChannel: orgProcedure.input(optionalRange).query(async ({ ctx, input }) => {
    const rows = await crossTenant("sweep").$queryRaw<{
      channel: string; enquiries: bigint; reachable: bigint; qualified: bigint;
      viewings: bigint; median_s: number | null;
    }[]>`
      SELECT
        ch.label AS channel,
        COUNT(DISTINCT e.id) AS enquiries,
        COUNT(DISTINCT e.id) FILTER (WHERE l.phone NOT LIKE 'pending:%') AS reachable,
        COUNT(DISTINCT l.id) FILTER (WHERE l."budgetMaxFils" IS NOT NULL AND l.intent IS NOT NULL) AS qualified,
        COUNT(DISTINCT v.id) AS viewings,
        /* Median time to first reply, per source. The table is headed
           "where they come from", and volume alone does not answer it —
           a portal sending 400 enquiries nobody answers for six hours is
           worth less than one sending 40 answered in two minutes. Same
           correlated subquery the two queries above use. */
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (
          (SELECT MIN(m."sentAt") FROM "Message" m
             JOIN "Conversation" c ON c.id = m."conversationId"
            WHERE c."leadId" = e."leadId" AND m.direction = 'OUTBOUND'
              AND m."sentAt" >= e."createdAt") - e."createdAt"))) AS median_s
      FROM "Enquiry" e
      JOIN "Channel" ch ON ch.id = e."channelId"
      JOIN "Lead" l ON l.id = e."leadId"
      LEFT JOIN "Viewing" v ON v."leadId" = l.id AND v."createdAt" >= e."createdAt"
      WHERE e."orgId" = ${ctx.orgId}
        AND e."createdAt" BETWEEN ${input.from} AND ${input.to}
      GROUP BY 1 ORDER BY 2 DESC
    `;

    /**
     * Named `channels`, and the counts as numbers.
     *
     * The screen reads `data.channels` and does arithmetic on the counts.
     * A bare array of rows carrying BigInt would have rendered "12n" and
     * thrown on any mixed-type arithmetic — BigInt does not coerce.
     */
    return {
      channels: rows.map((r) => ({
        /** `label` and `count` are what the table reads. */
        label: r.channel,
        count: Number(r.enquiries),
        medianMins: r.median_s == null ? 0 : Math.round((r.median_s / 60) * 10) / 10,
        reachable: Number(r.reachable),
        qualified: Number(r.qualified),
        viewings: Number(r.viewings),
      })),
    };
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
