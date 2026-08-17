"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { api } from "@/lib/trpc";
import { aedShort } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";

/**
 * The answer an agent needs standing in an owner's kitchen.
 *
 * Every other screen in this product runs buyer → property. This is the
 * one that runs the other way, and it is the strongest thing a
 * brokerage's own database can say about itself:
 *
 *   *Eight people on our book are looking for exactly this. Three of
 *   them I can message today.*
 *
 * That sentence is the difference between asking an owner for an
 * instruction and being given one. It is also the reason the numbers
 * have to be true — an owner can check, and an agent who says "twelve"
 * and produces five has done the brokerage more harm than saying
 * nothing.
 *
 * Opened from the listings row rather than living on the row, because
 * the answer costs a real query across every live requirement and
 * running eight of them to render a page nobody has asked a question on
 * is how a list gets slow.
 */
export function WhoWantsIt({ listingId, reference }: { listingId: string; reference: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [asked, setAsked] = useState(false);

  const { data, isLoading, isError, refetch, error } = api.listings.buyers.useQuery(
    { listingId },
    { enabled: asked }
  );

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          setAsked(true);
          dialog.current?.showModal();
          dialog.current?.focus();
        }}
      >
        Who wants it
      </Button>

      <dialog
        ref={dialog}
        aria-labelledby="buyers-title"
        tabIndex={-1}
        /* Capped and scrollable. Eight buyers on an iPhone runs past the
           bottom of the screen, and a native dialog does not scroll its
           own content — the list below the fold and the Close button
           were both unreachable. A brokerage with a real book will have
           twenty-five. */
        className="border border-ink rounded-[3px] p-0 max-w-[560px] w-[calc(100%-40px)] max-h-[85dvh] overflow-y-auto overscroll-contain bg-raised text-ink-2 backdrop:bg-ink/50"
      >
        <div className="p-6">
          <span className="t-label text-ink-3">
            {reference}
          </span>

          {/* The sentence comes from the server, next to the numbers it
              describes, so the two can never disagree. */}
          <h2
            id="buyers-title"
            className="font-sans font-semibold text-section leading-tight text-accent-deep mt-2 max-w-[36ch]"
          >
            {isLoading ? "Looking through your book…" : (data?.pitch ?? "Who wants it")}
          </h2>

          {/**
           * The answer arrives after the dialog has already been read out.
           *
           * A screen reader announces the dialog's label when it opens —
           * at which point the label is still "Looking through your
           * book…". The real sentence lands a second later and changes
           * nothing audible. This says it when it arrives, and stays
           * out of the way of everybody else.
           */}
          <p role="status" aria-live="polite" className="sr-only">
            {isLoading ? "Looking through your book" : (data?.pitch ?? "")}
          </p>

          {isError && (
            <div className="mt-4">
              <QueryError retry={() => void refetch()} what="the buyers for this one" error={error} />
            </div>
          )}

          {data && data.matches.length > 0 && (
            <ul className="mt-5 border-t border-ink">
              {data.matches.map((m) => (
                <li key={m.key} className="border-b border-rule py-3.5">
                  <div className="flex items-baseline gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-ui font-medium text-ink">
                        {m.leadId ? (
                          <Link href={`/blackbook/${m.leadId}`} className="hover:underline">
                            {m.name ?? "Unnamed"}
                          </Link>
                        ) : (
                          /* Somebody else's client. The count is the
                             firm's; the name is not. What an agent can
                             act on is knowing who to go and ask. */
                          <span className="text-ink-2">
                            {m.agentName ? `${m.agentName}'s buyer` : "Another agent's buyer"}
                          </span>
                        )}
                      </p>

                      <p className="mt-0.5 text-sm leading-snug text-ink-2">
                        {/* Reasons and caveats in one line, in that
                            order. A caveat said plainly — "5% over what
                            they mentioned" — is what makes the rest of
                            the row believable. */}
                        {[...m.reasons, ...m.caveats].join(" · ") ||
                          "Fits what they asked for"}
                      </p>
                    </div>

                    <div className="shrink-0 text-end">
                      <div className="font-mono text-note text-ink tabular-nums">
                        {Math.round(m.score * 100)}%
                      </div>
                      {m.budgetMaxFils !== null && (
                        <div className="font-mono text-label text-ink-3 tabular-nums">
                          up to {aedShort(m.budgetMaxFils)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Whether the send path would actually agree, said in
                      the words an agent can repeat out loud. */}
                  <p
                    className={cn(
                      "mt-1.5 t-label",
                      m.contactable.ok ? "text-success" : "text-ink-3"
                    )}
                  >
                    {m.contactable.ok
                      ? [
                          data.outsideHours ? "Can be messaged from 9am" : "Can be messaged now",
                          // Outside the 24-hour window Meta requires an
                          // approved template, and an agent who does not
                          // know that writes a free-form message that is
                          // accepted and never delivered.
                          m.contactable.useTemplate ? "template" : null,
                        ].filter(Boolean).join(" — ")
                      : m.contactable.reason}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {data && data.unconfirmed > 0 && (
            <p className="mt-4 max-w-[46ch] text-sm leading-snug text-ink-3">
              {data.unconfirmed} of these came from something the assistant worked out
              rather than something a person entered. Confirm the requirement on the
              lead and they can be messaged.
            </p>
          )}

          {data && data.matches.length === 0 && (
            <p className="mt-4 max-w-[46ch] text-sm leading-snug text-ink-2">
              Nothing on the book fits this one yet. It will appear here the moment
              somebody asks for something like it.
            </p>
          )}

          <div className="mt-6 flex justify-end">
            <Button variant="secondary" onClick={() => dialog.current?.close()}>
              Close
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
