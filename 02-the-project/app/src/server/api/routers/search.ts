import { z } from "zod";
import { router, requirePermission } from "../trpc";
import { can } from "@/server/auth/rbac";
import { parse, isEmpty } from "@/server/lib/search/parse";
import { search } from "@/server/lib/search/run";

/**
 * One box, the whole brokerage.
 *
 * The only search in this product before now was `contains` on a name
 * and a phone number, on two screens, each searching its own table. Ask
 * it "who was that Emirati investor looking in Downtown around four
 * million" and it returns nothing, so nobody asks it anything.
 *
 * `lead:read:own` is the floor, and the same scope rule as everywhere
 * else applies inside: an agent gets the brokerage's answer with a
 * colleague's client unnamed. A search box that quietly lists every
 * client in the firm is a poaching tool with a text field.
 */
export const searchRouter = router({
  ask: requirePermission("lead:read:own")
    .input(z.object({
      q: z.string().trim().min(1).max(200),
      limit: z.number().int().min(1).max(50).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const parsed = parse(input.q);

      /**
       * Nothing searchable is not an error and not an empty result.
       *
       * "who did I meet" parses to no terms and no filters. Running that
       * would return the whole book ranked by nothing, which reads as a
       * bug. Saying so is the honest answer, and it tells the agent what
       * to add.
       */
      if (isEmpty(parsed)) {
        return {
          reading: parsed.reading,
          hits: [], counts: { people: 0, owners: 0, properties: 0 },
          empty: true,
          nothingToSearch: true as const,
        };
      }

      const results = await search({
        orgId: ctx.orgId,
        q: parsed,
        limit: input.limit,
        scope: { canSeeAll: can(ctx.role, "lead:read:all"), viewerId: ctx.userId },
      });

      return { ...results, reading: parsed.reading, nothingToSearch: false as const };
    }),
});
