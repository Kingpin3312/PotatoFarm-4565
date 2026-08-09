import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import { assessRisk, assessRear, reviewIntervalMonths, TIPPING_OFF_RULES } from "@/server/lib/aml/rules";
import { interpret, AGENT_VISIBLE_STATE } from "@/server/lib/aml/screening";
import { requestMessage } from "@/server/lib/aml/collect";
import { audit } from "@/server/lib/audit";

export const amlRouter = router({
  /**
   * What an agent sees: whether the file is done and what is missing.
   * Never the reports, never the screening detail — see the tipping-off
   * rules.
   */
  fileStatus: requirePermission("kyc:read")
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const kyc = await ctx.db.kycRecord.findUnique({
        where: { leadId: input.leadId },
        select: {
          status: true, riskRating: true, reviewDueAt: true,
          documents: { select: { type: true, verifiedAt: true, expiresAt: true } },
          screenings: { select: { result: true }, orderBy: { screenedAt: "desc" }, take: 1 },
        },
      });
      if (!kyc) return { exists: false as const };

      const held = new Set(kyc.documents.map((d) => d.type));
      const outstanding = (["PASSPORT", "EMIRATES_ID"] as const).filter((t) => !held.has(t));

      // A screening under review shows as a neutral hold with no reason.
      const onHold = kyc.screenings[0]?.result === "POSSIBLE_MATCH" ||
                     kyc.screenings[0]?.result === "CONFIRMED_MATCH";

      return {
        exists: true as const,
        status: onHold ? "WITH_COMPLIANCE" : kyc.status,
        message: onHold ? AGENT_VISIBLE_STATE.message : null,
        outstanding,
        unverified: kyc.documents.filter((d) => !d.verifiedAt).length,
      };
    }),

  /** The wording the assistant sends. Exposed so it can be reviewed. */
  requestWording: requirePermission("kyc:write")
    .input(z.object({ docType: z.enum(["PASSPORT", "EMIRATES_ID", "TRADE_LICENCE"]) }))
    .query(({ ctx, input }) => ({ body: requestMessage(ctx.orgName, input.docType) })),

  assessRisk: requirePermission("kyc:approve")
    .input(z.object({
      kycId: z.string(),
      isPep: z.boolean(), isNonResident: z.boolean(), isCompany: z.boolean(),
      uboCount: z.number().int().min(0), cashInvolved: z.boolean(),
      dealValueFils: z.bigint(),
      countryRisk: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { rating, reasons } = assessRisk(input);
      const due = new Date();
      due.setUTCMonth(due.getUTCMonth() + reviewIntervalMonths(rating));

      return ctx.db.$transaction(async (tx) => {
        const kyc = await tx.kycRecord.update({
          where: { id: input.kycId },
          data: { riskRating: rating, riskReasons: reasons, isPep: input.isPep, reviewDueAt: due },
        });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: "aml.risk_assessed",
          entity: "KycRecord", entityId: kyc.id,
          after: { rating, reasons },
        });
        return { rating, reasons, reviewDueAt: due };
      });
    }),

  /** Compliance officer only. Everything the agent must not see. */
  /**
   * The compliance officer's desk: what is waiting on a decision, and what
   * is due for review.
   *
   * This returned a flat list of `ComplianceReport` rows — decisions
   * already made — while the screen asked for `pending` and `reviewsDue`,
   * which are the two things that need doing. It was answering the
   * opposite question.
   *
   * Gated on `compliance:read`, so none of this reaches an agent. Why a
   * screening was held is exactly what must never be visible on the
   * floor: tipping off is an offence in itself.
   */
  reports: requirePermission("compliance:read").query(async ({ ctx }) => {
    const now = new Date();

    const [screenings, reviews, filed] = await Promise.all([
      // Anything not clear, newest first. `AUTO_CLEAR_THRESHOLD` is null
      // on purpose — nothing clears itself, so everything here is a
      // person's decision.
      ctx.db.screening.findMany({
        where: { result: { in: ["POSSIBLE_MATCH", "CONFIRMED_MATCH"] } },
        orderBy: { screenedAt: "desc" },
        take: 100,
        select: {
          id: true, kycId: true, result: true, nameChecked: true,
          lists: true, screenedAt: true, clearedNote: true,
          kyc: { select: { id: true, legalName: true } },
        },
      }),

      // A review that is due is due; one due next week is worth seeing
      // now, so the window reaches forward 30 days.
      ctx.db.kycRecord.findMany({
        where: {
          reviewDueAt: { not: null, lte: new Date(now.getTime() + 30 * 86_400_000) },
          status: { notIn: ["REJECTED"] },
        },
        orderBy: { reviewDueAt: "asc" },
        take: 100,
        select: { id: true, legalName: true, riskRating: true, reviewDueAt: true },
      }),

      ctx.db.complianceReport.findMany({ orderBy: { decidedAt: "desc" }, take: 100 }),
    ]);

    const days = (from: Date, to: Date) =>
      Math.round((to.getTime() - from.getTime()) / 86_400_000);

    return {
      /**
       * `id` is the KYC id, not the screening id — the row links to
       * `/compliance/[kycId]`, which queries `screeningDetail({ kycId })`.
       * A screening with no KYC record cannot be opened, so it is dropped
       * rather than rendered as a dead link.
       */
      pending: screenings.flatMap((s) =>
        s.kyc
          ? [{
              id: s.kyc.id,
              name: s.kyc.legalName,
              result: s.result,
              heldFor: `${Math.max(0, days(s.screenedAt, now))}d`,
              listName: s.lists[0] ?? "sanctions list",
              matchedOn: s.nameChecked,
            }]
          : []
      ),

      reviewsDue: reviews.map((k) => {
        const left = k.reviewDueAt ? days(now, k.reviewDueAt) : 0;
        return {
          id: k.id,
          name: k.legalName,
          rating: k.riskRating,
          dueIn: left < 0 ? `${Math.abs(left)}d overdue` : left === 0 ? "today" : `${left}d`,
        };
      }),

      /** Decisions already taken. Kept — it is what this used to return. */
      filed,
    };
  }),

  screeningDetail: requirePermission("compliance:read")
    .input(z.object({ kycId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.screening.findMany({
        where: { kycId: input.kycId }, orderBy: { screenedAt: "desc" },
      });
      return rows.map((r) => ({
        ...r,
        guidance: interpret((r.matches as never) ?? []).guidance,
      }));
    }),

  /** Filing, or deciding not to. Both are decisions and both are recorded. */
  file: requirePermission("compliance:file")
    .input(z.object({
      type: z.enum(["REAR", "STR", "SAR", "CNMR", "FFR", "NO_FILING"]),
      dealId: z.string().optional(),
      kycId: z.string().optional(),
      rationale: z.string().trim().min(10).max(1000),
      cashFils: z.bigint().optional(),
      goamlRef: z.string().optional(),
      notFiledReason: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.type === "NO_FILING" && !input.notFiledReason) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          // An inspector asks why you did not report as often as why you did.
          message: "A decision not to file needs a reason recorded against it.",
        });
      }

      return ctx.db.complianceReport.create({
        data: {
          orgId: ctx.orgId, ...input,
          decidedById: ctx.userId,
          filedAt: input.type === "NO_FILING" ? null : new Date(),
        },
      });
    }),

  /** Does this transaction trigger a REAR? */
  checkRear: requirePermission("compliance:read")
    .input(z.object({
      payments: z.array(z.object({
        amountFils: z.bigint(),
        method: z.enum(["CASH", "TRANSFER", "CHEQUE", "VIRTUAL_ASSET"]),
        at: z.date(),
      })),
    }))
    .query(({ input }) => assessRear(input.payments)),

  /** Stated openly, so nobody thinks the missing detail is a bug. */
  visibilityPolicy: orgProcedure.query(() => TIPPING_OFF_RULES),
});
