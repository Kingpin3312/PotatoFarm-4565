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
  reports: requirePermission("compliance:read").query(({ ctx }) =>
    ctx.db.complianceReport.findMany({
      orderBy: { decidedAt: "desc" }, take: 100,
    })
  ),

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
