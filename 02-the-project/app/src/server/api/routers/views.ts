import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, orgProcedure } from "../trpc";
import { can } from "@/server/auth/rbac";

/**
 * Saved views: a filter somebody wants back.
 *
 * "My golden-visa buyers", "Bayut leads nobody has answered". Stored as
 * the screen's own filter object, so a view is exactly what the screen
 * would send — nothing here interprets it, and the list procedure
 * re-validates it every time it is used.
 *
 * Your own views, and the team's shared ones. Sharing is a manager's:
 * a view on the whole team's list is a decision about what the floor
 * looks at.
 */
const screen = z.enum(["leads", "listings"]);

export const viewsRouter = router({
  list: orgProcedure.input(z.object({ screen })).query(({ ctx, input }) =>
    ctx.db.savedView.findMany({
      where: { screen: input.screen, OR: [{ userId: ctx.userId }, { shared: true }] },
      orderBy: [{ shared: "asc" }, { name: "asc" }],
      select: { id: true, name: true, filters: true, shared: true, userId: true },
    }).then((rows) => rows.map((r) => ({ ...r, mine: r.userId === ctx.userId })))),

  save: orgProcedure
    .input(z.object({
      screen,
      name: z.string().trim().min(1).max(60),
      filters: z.record(z.string(), z.unknown()),
      shared: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.shared && !can(ctx.role, "lead:read:all")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only a manager can share a view with the team." });
      }
      return ctx.db.savedView.create({
        data: {
          orgId: ctx.orgId, userId: ctx.userId, screen: input.screen, name: input.name,
          filters: input.filters as Prisma.InputJsonValue, shared: input.shared,
        },
        select: { id: true },
      });
    }),

  remove: orgProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const v = await ctx.db.savedView.findFirst({ where: { id: input.id }, select: { userId: true } });
    // Yours, or a manager tidying the team's shared ones.
    if (!v || (v.userId !== ctx.userId && !can(ctx.role, "lead:read:all"))) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    await ctx.db.savedView.delete({ where: { id: input.id } });
    return { ok: true };
  }),
});
