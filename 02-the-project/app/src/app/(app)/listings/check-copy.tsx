"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Writing a listing description, and checking it against the rules that
 * get listings rejected.
 *
 * Drafting is back. It was removed when `copy.draftListing` turned out
 * to build its prompt and never call the model — returning an empty
 * description marked publishable — and the model call is wired now, so
 * the two halves are one dialog again rather than two components with
 * overlapping jobs.
 *
 * `draft-copy.tsx`, the original, is **not** what came back. It was a
 * page block written for a listing detail screen that does not exist,
 * and restoring it would have put a second checking UI on the floor
 * beside this one. The behaviour was worth recovering; the component
 * was not.
 *
 * Worth having for a UAE brokerage specifically. A portal rejection is
 * silent from the agent's side — the listing simply is not live — and
 * the causes are things nobody remembers: a phone number in the
 * description, a superlative that reads as a guarantee, block capitals.
 * `publish-check.tsx` covers the permit; this covers the words.
 */
export function CheckCopy({ listingId }: { listingId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const check = api.copy.checkCopy.useMutation();
  const draft = api.copy.draftListing.useMutation();

  /**
   * True only while the box holds words the agent has not touched.
   *
   * The soft accent marks machine text everywhere else in the product,
   * and this is the one place the machine writes into a field the agent
   * then edits. Tinting it for ever would say "this is the assistant's"
   * about a description they wrote themselves; never tinting it would
   * hide the one moment that matters — a paragraph about to go to a
   * portal that nobody has read yet. So the tint is the *unread* state
   * and the first keystroke clears it.
   */
  const [unread, setUnread] = useState(false);

  const open = () => {
    check.reset();
    draft.reset();
    dialog.current?.showModal();
    dialog.current?.focus();
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={open}>Check wording</Button>

      <dialog
        ref={dialog}
        aria-labelledby="check-copy-title"
        tabIndex={-1}
        className="border border-ink rounded-[3px] p-0 max-w-[560px] w-[calc(100%-40px)] bg-raised text-ink-2 backdrop:bg-ink/50"
      >
        <div className="p-6">
          <h2 id="check-copy-title" className="font-sans font-semibold text-h3 text-ink mb-1.5">
            Check the wording
          </h2>
          <p className="text-sm text-ink-3 mb-5">
            Draft it from the property's facts, or paste your own. Either way it is
            checked against the rules portals reject listings for.
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="t-label text-ink-3">Description</span>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setUnread(false); }}
              rows={7}
              autoFocus
              data-machine={unread ? "claim" : undefined}
              className={`px-3 py-2.5 text-control border rounded-[3px] text-ink outline-none focus:border-ink resize-y ${
                unread ? "bg-accent-soft border-accent-edge" : "bg-ground border-rule"}`}
              placeholder="Spacious two-bedroom apartment in Marina Gate with full marina views…"
            />
          </label>

          {check.isSuccess && (
            <div role="status" className="mt-4">
              {check.data.publishable ? (
                <p className="text-ui text-success">
                  Nothing here breaks a portal rule.
                </p>
              ) : (
                <>
                  <p className="text-ui text-ink font-medium mb-2">
                    {check.data.problems.length} thing
                    {check.data.problems.length > 1 ? "s" : ""} a portal may reject:
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {check.data.problems.map((p, i) => (
                      <li key={i} className="text-sm text-ink-2">
                        <span className="text-ink">{p.rule}</span>
                        {/* The matched text, so the agent can find it
                            rather than re-reading the whole description
                            guessing which phrase was meant. */}
                        {p.found && <> — “{p.found}”</>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {unread && (
            <p className="t-label text-ink-3 mt-1.5">
              Drafted from the property&rsquo;s facts — read it before you publish.
            </p>
          )}

          {draft.isError && (
            <p role="alert" className="mt-4 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">
              {draft.error.message}
            </p>
          )}

          {check.isError && (
            <p role="alert" className="mt-4 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">
              {check.error.message}
            </p>
          )}

          <div className="flex gap-2.5 mt-7">
            <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
              Close
            </Button>
            {/* Drafting never publishes and never saves — it fills this
                box, a person reads it, and the agent still has to check
                and paste. `AUTO_PUBLISH` is false for the same reason. */}
            <Button
              type="button"
              variant="secondary"
              loading={draft.isPending}
              onClick={() =>
                draft.mutate(
                  { listingId },
                  { onSuccess: (d) => { setText(d.draft); setUnread(true); check.reset(); } },
                )
              }
            >
              Draft it for me
            </Button>
            <Button
              variant="primary"
              className="ms-auto"
              loading={check.isPending}
              disabled={text.trim().length === 0}
              onClick={() => check.mutate({ text })}
            >
              Check it
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
