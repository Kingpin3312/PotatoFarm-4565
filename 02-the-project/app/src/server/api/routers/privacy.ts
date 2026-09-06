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
          /**
           * Three actions, and the third is the one that matters.
           *
           * This listed two, and `privacy.erasure_deferred` was not
           * among them — which is the action `eraseSubject` writes when
           * a live KYC file holds the request back. So the one state
           * this screen exists to prove had been handled correctly
           * **could never appear on it**: a deferred erasure was absent
           * from the history entirely, which is indistinguishable from
           * a request nobody acted on. That is the exact reading the
           * screen was built to prevent.
           */
          action: {
            in: ["privacy.erasure", "privacy.erasure_deferred", "privacy.subject_access"],
          },
          createdAt: { gte: new Date(Date.now() - days * 86_400_000) },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, action: true, createdAt: true, after: true, entityId: true,
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
      /**
       * Read the keys the writers actually write.
       *
       * This unpacked `after.phone`, `after.leadId` and
       * `after.deferredUntil`, and **none of the three is ever
       * written**. `erase.ts` deliberately stores no phone and no name
       * — a one-way `subject` fingerprint answers "have we already done
       * this one?" without keeping the thing being erased — and
       * `subjectAccess` stores the last four digits in `entityId`. So
       * every row on this screen rendered as the fallback string, "a
       * contact", with no way to tell one request from another. It went
       * unnoticed because nothing imported the component that renders
       * them.
       *
       * The identifier is deliberately weak in all three cases. That is
       * the design and it is right: what an inspector needs from this
       * list is that a request existed, what was decided, who decided
       * it and when — not a directory of the people who asked to be
       * forgotten.
       */
      return {
        requests: rows.map((r) => {
          const after = (r.after ?? {}) as {
            subject?: string; reason?: string; releaseAt?: string;
          };
          const deferred = r.action === "privacy.erasure_deferred";
          return {
            id: r.id,
            subject:
              r.action === "privacy.subject_access"
                // The last four digits, which is all `subjectAccess` keeps.
                ? (r.entityId ? `number ending ${r.entityId}` : "a contact")
                : after.subject
                // The head of the erasure fingerprint. Not reversible,
                // and enough to tell two rows apart.
                ? `reference ${after.subject.slice(0, 8)}`
                // A deferral writes no subject at all, and it is the one
                // case where nothing has been erased yet — the record is
                // still whole, so its id is not a disclosure. Without
                // this, two people held back by the same obligation are
                // two identical rows reading "a contact".
                : r.entityId
                ? `reference ${r.entityId.slice(-8)}`
                : "a contact",
            requestedAt: r.createdAt,
            state: deferred ? ("DEFERRED" as const) : ("DONE" as const),
            dueAt: deferred ? after.releaseAt ?? null : null,
            reason: after.reason ?? null,
            kind: r.action === "privacy.subject_access"
              ? ("ACCESS" as const)
              : ("ERASURE" as const),
            by: r.actor?.name ?? null,
          };
        }),
      };
    }),
});
