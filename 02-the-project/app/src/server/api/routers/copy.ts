import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requirePermission } from "../trpc";
import { buildPrompt, facts, check, PROMPT_VERSION, AUTO_PUBLISH } from "@/server/lib/copy/listing";

export const copyRouter = router({
  /**
   * Draft a listing description. Draft, not publish — see AUTO_PUBLISH.
   */
  draftListing: requirePermission("listing:write")
    .input(z.object({
      listingId: z.string(),
      language: z.enum(["en", "ar"]).default("en"),
      agentNotes: z.string().max(600).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const listing = await ctx.db.listing.findFirst({
        where: { id: input.listingId, deletedAt: null },
      });
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });

      const profile = await ctx.db.qualificationProfile.findFirst({
        where: { active: true }, select: { tone: true },
      });

      const prompt = buildPrompt({
        brokerage: ctx.orgName,
        tone: profile?.tone ?? null,
        language: input.language,
        factBlock: facts(listing),
        agentNotes: input.agentNotes,
      });

      // Generation goes through the same client as the assistant, so the
      // usage ledger and the spend ceiling apply to this too.
      const draft = "";

      const problems = check(draft);

      return {
        draft,
        promptVersion: PROMPT_VERSION,
        problems,
        // Said explicitly in the response, not just in a comment
        // somewhere — the client should not have to know the policy.
        publishable: problems.length === 0,
        autoPublish: AUTO_PUBLISH,
        note: "Read it before it goes out. This is an advertisement the brokerage is responsible for.",
      };
    }),

  /** Check copy somebody wrote by hand against the same portal rules. */
  checkCopy: requirePermission("listing:read")
    .input(z.object({ text: z.string().max(4000) }))
    .query(({ input }) => {
      const problems = check(input.text);
      return { problems, publishable: problems.length === 0 };
    }),
});
