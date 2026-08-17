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

      /**
       * Generation is not wired, and this refuses rather than pretending.
       *
       * The line here was `const draft = ""` under a comment saying
       * "generation goes through the same client as the assistant". No
       * call was ever made — `prompt` above is built and discarded.
       *
       * What made that dangerous rather than merely unfinished is what
       * came next: `check("")` finds no problems in an empty string, so
       * the response was `{ draft: "", problems: [], publishable: true }`.
       * **An empty advertisement, marked fit to publish.** That is the
       * same shape as a sanctions `CLEAR` nobody produced — see
       * `aml/screen.ts` — one regulated path over, and it is why
       * `DraftCopy` must not be mounted until this is real.
       *
       * `checkCopy` below is unaffected and genuinely works: it needs no
       * model, and checking copy an agent typed is the half of this
       * feature that is finished.
       */
      throw new TRPCError({
        code: "NOT_IMPLEMENTED",
        message:
          "Drafting listing copy is not available yet — the model call is not wired. " +
          "Write the description and use the portal-rules check on it instead.",
      });
    }),

  /** Check copy somebody wrote by hand against the same portal rules. */
  checkCopy: requirePermission("listing:read")
    .input(z.object({ text: z.string().max(4000) }))
    /**
     * A mutation, though it writes nothing.
     *
     * It is an action an agent takes on text they have just typed —
     * "check this before I publish" — not a value to cache and refetch.
     * As a query it would key on the whole description and accumulate a
     * cache entry per keystroke-batch, and the screen calls it from a
     * button either way.
     */
    .mutation(({ input }) => {
      const problems = check(input.text);
      return { problems, publishable: problems.length === 0 };
    }),
});
