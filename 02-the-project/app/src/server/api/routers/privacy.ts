import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requirePermission } from "../trpc";
import { exportSubject } from "@/server/lib/privacy/export";
import { eraseSubject } from "@/server/lib/privacy/erase";
import { crossTenant } from "@/server/db/client";

const phone = z.string().regex(/^\+[1-9]\d{7,14}$/, "Include the country code.");

export const privacyRouter = router({
  /** What is held about one person. Read-only, and safe to run. */
  subjectAccess: requirePermission("export:all")
    .input(z.object({ phone }))
    .query(async ({ ctx, input }) => {
      const data = await exportSubject(ctx.orgId, input.phone);
      if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Nothing held for that number." });

      // A subject access request is itself worth logging — it is somebody
      // reading a person's entire file, and that should never be invisible.
      await crossTenant("sweep").auditLog.create({
        data: {
          orgId: ctx.orgId, actorId: ctx.userId,
          action: "privacy.subject_access", entity: "Lead", entityId: input.phone.slice(-4),
          ip: ctx.ip, userAgent: ctx.userAgent,
        },
      });

      return data;
    }),

  /**
   * Erasure. Irreversible, so it takes a typed confirmation of the number
   * rather than a checkbox — the same pattern as deleting a repository.
   * Friction is right here in a way it is not on a kill switch: nobody
   * needs to erase somebody in a hurry.
   */
  erase: requirePermission("export:all")
    .input(z.object({
      phone,
      confirmPhone: phone,
      reason: z.string().trim().min(3).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.phone !== input.confirmPhone) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The two numbers don't match." });
      }

      const result = await eraseSubject({
        orgId: ctx.orgId,
        phone: input.phone,
        requestedBy: ctx.userId,
        reason: input.reason,
      });

      if (!result.found) {
        // Not an error. "We hold nothing about that person" is a complete
        // and correct answer to an erasure request.
        return { ...result, message: "Nothing was held for that number." };
      }

      return {
        ...result,
        message:
          `Erased. ${result.messagesScrubbed} messages and ${result.auditRowsScrubbed} audit ` +
          `entries were scrubbed. The record of what happened remains; nothing identifying them does.`,
      };
    }),

  /** Proof, for whoever asks. */
  erasureHistory: requirePermission("audit:read")
    // Optional: the screen shows "past requests" and asks for no window.
    .input(z.object({ days: z.number().min(1).max(730).default(365) }).optional())
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 365;
      const rows = await ctx.db.auditLog.findMany({
        where: {
          action: { in: ["privacy.erasure", "privacy.subject_access"] },
          createdAt: { gte: new Date(Date.now() - days * 86_400_000) },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, action: true, createdAt: true, after: true,
          actor: { select: { name: true } },
        },
      });

      /**
       * Shaped as requests, which is what the screen renders.
       *
       * It returned raw audit rows and the screen read `subject`,
       * `requestedAt`, `state` and `dueAt` off them — none of which are
       * audit columns. The values are all inside the `after` payload that
       * `erase()` writes, so this unpacks it rather than making the
       * screen guess at a JSON blob.
       *
       * The deferral is the part that matters: an erasure held back
       * against a live KYC file is not a refusal and must not read as
       * one. Five-year AML retention outranks the request, and the due
       * date is when it will actually run.
       */
      return {
        requests: rows.map((r) => {
          const after = (r.after ?? {}) as {
            phone?: string; leadId?: string;
            deferredUntil?: string; deferredReason?: string;
          };
          return {
            id: r.id,
            subject: after.phone ?? after.leadId ?? "a contact",
            requestedAt: r.createdAt,
            state: after.deferredUntil ? ("DEFERRED" as const) : ("DONE" as const),
            dueAt: after.deferredUntil ?? null,
            reason: after.deferredReason ?? null,
            kind: r.action === "privacy.erasure" ? ("ERASURE" as const) : ("ACCESS" as const),
            by: r.actor?.name ?? null,
          };
        }),
      };
    }),
});
