import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { forOrg } from "@/server/db/client";
import { can, type Permission } from "@/server/auth/rbac";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Field errors go back individually so the client can put each
        // message under the field it belongs to.
        zod: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

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
