import { z } from "zod";
import { router, requirePermission } from "../trpc";
import { searchLocations } from "@/server/lib/locations";

/**
 * The location tree, read-only.
 *
 * `listing:read` rather than write: anyone who can see listings can look
 * up a place. Nothing here writes — the tree is shared across every
 * brokerage and changes only through the seed and the Property Finder
 * import, which the application's own database role cannot do.
 */
export const locationsRouter = router({
  search: requirePermission("listing:read")
    .input(z.object({ q: z.string().trim().max(80), limit: z.number().int().min(1).max(25).default(12) }))
    .query(async ({ input }) => ({ results: await searchLocations(input.q, input.limit) })),
});
