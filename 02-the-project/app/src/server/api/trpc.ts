import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { forOrg } from "@/server/db/client";
import { can, type Permission } from "@/server/auth/rbac";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    /**
     * A validation failure's message is the serialised issue list —
     * `[{"validation":"regex",…}]` — and every form shows `error.message`,
     * so a person typing a number with spaces was shown JSON. The first
     * issue's own sentence goes in the message instead; the full detail
     * stays in `data.zod` for forms that place messages per field.
     */
    const zod = error.cause instanceof ZodError ? error.cause : null;
    const first = zod?.issues[0];
    return {
      ...shape,
      message: first ? readable(first) : shape.message,
      data: {
        ...shape.data,
        // Field errors go back individually so the client can put each
        // message under the field it belongs to.
        zod: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/** "Email: Invalid email" reads as a form label, not a stack trace. */
function readable(issue: import("zod").ZodIssue): string {
  const field = issue.path.filter((p) => typeof p === "string").at(-1);
  const name = typeof field === "string"
    ? field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())
    : null;
  if (issue.code === "too_big" && "maximum" in issue) {
    return `${name ?? "That"} is too long — ${String(issue.maximum)} characters at most.`;
  }
  if (issue.code === "too_small" && "minimum" in issue && issue.minimum === 1) {
    return `${name ?? "That"} is required.`;
  }
  return name && !issue.message.toLowerCase().includes(name.toLowerCase())
    ? `${name}: ${issue.message}`
    : issue.message;
}

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Everything authenticated goes through here, and it is the only place a
 * database handle is created. A procedure cannot reach an unscoped client
 * by accident, because it is never handed one.
 */
export const orgProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (!ctx.membership) throw new TRPCError({ code: "FORBIDDEN", message: "No access to this brokerage." });

  return next({
    ctx: {
      ...ctx,
      db: forOrg(ctx.membership.orgId),
      orgId: ctx.membership.orgId,
      orgName: ctx.membership.orgName,
      userId: ctx.session.user.id,
      role: ctx.membership.role,
    },
  });
});

/** Declarative permission gate. `.use(require("lead:assign"))` */
export const requirePermission = (permission: Permission) =>
  orgProcedure.use(({ ctx, next }) => {
    if (!can(ctx.role, permission)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        // Name the permission. "Forbidden" with no detail turns into a
        // support ticket every time.
        message: `Your role does not allow ${permission}.`,
      });
    }
    return next({ ctx });
  });
