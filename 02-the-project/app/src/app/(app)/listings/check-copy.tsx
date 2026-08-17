"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Checking a description against the rules that get listings rejected.
 *
 * This is the surviving half of `draft-copy.tsx`, which offered drafting
 * *and* checking and was mounted by nothing. Drafting turned out to be
 * unfinished — `copy.draftListing` built its prompt and never called the
 * model, returning an empty description marked publishable — so it
 * throws now, and its component was deleted.
 *
 * **Checking is different: it is finished and it needs no model.** The
 * rules are a regex list, run in-process, free and instant. Deleting the
 * whole component would have taken a working feature off the floor
 * because the half beside it was broken.
 *
 * Worth having for a UAE brokerage specifically. A portal rejection is
 * silent from the agent's side — the listing simply is not live — and
 * the causes are things nobody remembers: a phone number in the
 * description, a superlative that reads as a guarantee, block capitals.
 * `publish-check.tsx` covers the permit; this covers the words.
 */
export function CheckCopy() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const check = api.copy.checkCopy.useMutation();

  const open = () => {
    check.reset();
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
            Paste the description. This checks it against the rules portals reject
            listings for — it does not write it for you.
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="t-label text-ink-3">Description</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              autoFocus
              className="px-3 py-2.5 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink resize-y"
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

          {check.isError && (
            <p role="alert" className="mt-4 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">
              {check.error.message}
            </p>
          )}

          <div className="flex gap-2.5 mt-7">
            <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
              Close
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
