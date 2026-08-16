"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Drafting listing copy.
 *
 * The check matters more than the draft. Portal listings get rejected
 * for things nobody remembers — a phone number in the description, a
 * superlative that reads as a guarantee, a missing permit reference —
 * and a rejection costs a day.
 */
export function DraftCopy({ listingId }: { listingId: string }) {
  const draft = api.copy.draftListing.useMutation();
  const check = api.copy.checkCopy.useMutation();
  const [text, setText] = useState("");
  /**
   * True only while the box holds words the agent has not touched.
   *
   * The soft orange marks machine text everywhere else in the product,
   * and this is the one place the machine writes into a field the agent
   * then edits. Tinting the textarea for ever would say "this is the
   * assistant's" about a description they wrote themselves; never
   * tinting it would hide the one moment it matters, which is the
   * paragraph about to go to a portal that nobody has read yet.
   *
   * So the tint is the *unread* state and the first keystroke clears
   * it — the same moment the words stop being the model's.
   */
  const [drafted, setDrafted] = useState(false);

  return (
    <div className="border-t border-rule pt-5">
      <h2 className="font-sans font-semibold text-[17px] text-accent-deep mb-3">Description</h2>

      <label htmlFor="copy" className="sr-only">Listing description</label>
      {drafted && (
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-1.5">
          Drafted — read it before you publish
        </p>
      )}
      <textarea id="copy" rows={6} value={text}
        data-machine={drafted ? "claim" : undefined}
        onChange={(e) => { setText(e.target.value); setDrafted(false); }}
        className={`w-full px-4 py-2.5 text-[16px] text-ink border rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)] ${
          drafted ? "bg-accent-soft border-accent-edge" : "bg-sunk border-rule"}`} />

      <div className="flex gap-2 mt-3 flex-wrap">
        <Button variant="secondary" loading={draft.isPending}
          onClick={() => draft.mutate({ listingId },
            // `draft`, not `text` — see the router's return.
            { onSuccess: (d) => { setText(d.draft); setDrafted(true); } })}>
          Draft it for me
        </Button>
        <Button variant="secondary" loading={check.isPending} disabled={!text.trim()}
          onClick={() => check.mutate({ text })}>
          Check before publishing
        </Button>
      </div>

      {/* Each problem says what it costs, not just what it is. "Contains
          a phone number" is a note; "portals reject this" is a reason. */}
      {check.data?.problems?.length ? (
        <div className="mt-4 border-t border-ink">
          {check.data.problems.map((p, i) => (
            <div key={i} className="py-3 border-b border-rule">
              {/* `rule` is what was breached, `found` is the text that
                  breached it — which is the bit an agent needs in order
                  to go and change it. */}
              <p className="text-[15px] text-ink font-semibold">{p.rule}</p>
              <p className="text-sm text-ink-2 mt-1 max-w-[46ch] leading-snug">
                Found: &ldquo;{p.found}&rdquo;
              </p>
            </div>
          ))}
        </div>
      ) : check.isSuccess ? (
        <p className="text-[15px] text-success mt-4">Nothing that would get it rejected.</p>
      ) : null}
    </div>
  );
}
