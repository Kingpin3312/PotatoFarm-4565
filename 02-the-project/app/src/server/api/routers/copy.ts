import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requirePermission } from "../trpc";
import { buildPrompt, facts, check, PROMPT_VERSION } from "@/server/lib/copy/listing";
import { callModel } from "@/server/assistant/run";

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
       * Wired now. It used to be `const draft = ""` beneath a comment
       * claiming generation went through the assistant's client, then a
       * `NOT_IMPLEMENTED` once that was found — because the response
       * had been `{ draft: "", problems: [], publishable: true }`, an
       * empty advertisement marked fit to publish, since `check("")`
       * finds nothing wrong with an empty string.
       *
       * **A missing key still refuses rather than returning nothing.**
       * That is the same decision `aml/screen.ts` takes about a missing
       * screening provider: an empty result that looks like a
       * successful one is worse than an honest failure.
       */
      if (!process.env.ANTHROPIC_API_KEY?.trim()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Drafting needs ANTHROPIC_API_KEY, which is not set. Write the " +
            "description and use the portal-rules check on it instead.",
        });
      }

      let draft: string;
      try {
        /**
         * The assistant's own client, not a second one. It carries the
         * timeout and the response parsing, and two HTTP clients to the
         * same provider is how one of them quietly stops matching the
         * other's model or version header.
         *
         * The facts go in as the single turn rather than as system
         * text, because the model is being asked to write *from* them —
         * and `buildPrompt` already forbids inventing anything not in
         * the fact block, which is the rule that keeps an invented
         * service charge or a nonexistent sea view out of a legally
         * binding advertisement.
         */
        const out = await callModel(prompt, [
          { direction: "INBOUND", body: facts(listing) },
        ]);
        draft = out.text.trim();
      } catch (err) {
        // A timeout or a 5xx is not a draft. Refusing keeps the agent in
        // the one state they can act on: write it yourself.
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Drafting failed: ${String(err).slice(0, 200)}`,
        });
      }

      /**
       * **The empty case is checked explicitly**, because it is the
       * exact shape of the bug this procedure used to be. A model that
       * returns nothing — refusal, truncation, a content filter — must
       * not arrive at the screen as publishable copy.
       */
      if (draft.length < 40) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "The model returned nothing usable. Nothing has been saved — " +
            "write the description and check it instead.",
        });
      }

      const problems = check(draft);
      return {
        draft,
        problems,
        /**
         * `AUTO_PUBLISH` is false and this is not it. Publishable means
         * "breaks no portal rule", which is a fact about the text. It
         * never means "send it" — a human accepts the draft, which is
         * why this procedure writes nothing to the listing.
         */
        publishable: problems.length === 0,
        promptVersion: PROMPT_VERSION,
      };
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
