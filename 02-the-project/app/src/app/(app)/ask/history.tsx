"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/cn";
import { QueryError } from "@/components/ui/query-state";

/**
 * What you asked for, and what came back.
 *
 * `requests.mine` was written, mounted and permission-gated, and no
 * screen ever called it — the one procedure the reachability audit
 * called genuinely missing rather than deliberately unscreened. An agent
 * could speak a request and read the answer once; refresh the page and
 * it was gone.
 *
 * That matters more here than it would elsewhere. The classifier gets
 * things wrong, and the transcript is kept verbatim precisely so
 * somebody can see *why* — but only if there is somewhere to see it.
 * Without this, the record exists solely in a table nobody can open.
 *
 * **Scoped to the calling agent, deliberately.** `requests.mine`
 * filters on `agentId`, and this is their thinking out loud: half-formed
 * questions, a valuation they checked twice because they were nervous
 * about it. A manager reading that changes what gets asked.
 */
export function History() {
  const { data, isLoading, isError, refetch, error } = api.requests.mine.useQuery();
  const [open, setOpen] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-sm text-ink-3 mt-10">Loading what you've asked…</p>;
  }

  if (isError) {
    return (
      <div className="mt-10">
        <QueryError retry={() => void refetch()} what="your requests" error={error} />
      </div>
    );
  }

  /**
   * The empty state says what to do, not that there is nothing.
   *
   * A new agent's first sight of this screen is the empty one, and
   * "No requests" tells them nothing about whether that is normal,
   * broken, or something they have not set up.
   */
  if (!data || data.length === 0) {
    return (
      <section className="mt-12 border-t border-rule pt-6">
        <h2 className="t-label text-ink-3">Earlier</h2>
        <p className="text-ui text-ink-2 mt-3 max-w-[46ch] leading-snug">
          Nothing yet. Anything you ask above is kept here, so you can find that
          valuation again on Thursday without asking for it twice.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-12 border-t border-rule pt-6">
      <h2 className="t-label text-ink-3">
        Earlier · {data.length}
      </h2>

      <ul className="mt-2">
        {data.map((r) => {
          const expanded = open === r.id;
          return (
            <li key={r.id} className="border-b border-rule">
              <button
                onClick={() => setOpen(expanded ? null : r.id)}
                aria-expanded={expanded}
                className="flex w-full min-h-12 items-baseline gap-3 py-3 text-left"
              >
                <State state={r.state} />
                <span className="flex-1 text-ui text-ink leading-snug">
                  {/* Verbatim, and truncated by CSS rather than by
                      slicing — a transcript cut mid-word in the markup
                      is also cut in the expanded view. */}
                  <span className={cn(!expanded && "line-clamp-1")}>{r.transcript}</span>
                </span>
                <span className="t-label text-ink-3 shrink-0 tabular">
                  {when(r.createdAt)}
                </span>
              </button>

              {expanded && (
                <div className="pb-4 pl-[4.5rem] pr-1">
                  <p className="t-label text-ink-3">
                    {RECIPE[r.recipe] ?? r.recipe.toLowerCase().replace(/_/g, " ")}
                  </p>

                  {/* The caveats are the deliverable, not a footnote.
                      A comparables range an agent quotes to a seller is
                      worth exactly what its qualifications say it is. */}
                  {r.caveats.length > 0 && (
                    <div className="mt-2 space-y-1.5 border-l-2 border-l-accent-edge pl-3">
                      {r.caveats.map((c, i) => (
                        <p key={i} className="text-sm text-ink-2 max-w-[46ch] leading-snug">{c}</p>
                      ))}
                    </div>
                  )}

                  {r.state === "REFUSED" && r.caveats.length === 0 && (
                    <p className="mt-2 text-sm text-ink-2 max-w-[46ch] leading-snug">
                      This one wasn't done and no reason was recorded against it. Ask it
                      again and the answer will say why.
                    </p>
                  )}

                  {r.state === "QUEUED" && (
                    <p className="mt-2 text-sm text-ink-2 max-w-[46ch] leading-snug">
                      Still waiting on something. Requests that need a second answer —
                      which building, how many bedrooms — sit here until you give it.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * State in words, with the colour second.
 *
 * The design rule is that colour carries state — but never *only*
 * colour. Somebody reading this on a phone in Dubai sunlight is not
 * distinguishing two greys, and about one man in twelve cannot separate
 * the red from the green at all.
 */
function State({ state }: { state: string }) {
  const label = ({
    DONE: "done",
    QUEUED: "waiting",
    RUNNING: "running",
    REFUSED: "no",
    ESCALATED: "passed on",
  } as Record<string, string>)[state] ?? state.toLowerCase();

  return (
    <span
      className={cn(
        "t-label w-14 shrink-0",
        state === "DONE" ? "text-ink" : state === "REFUSED" ? "text-accent-deep" : "text-ink-3"
      )}
    >
      {label}
    </span>
  );
}

/** The enum, in the words an agent would use. */
const RECIPE: Record<string, string> = {
  COMPARABLES: "Comparables",
  LISTING_PITCH: "Listing pitch",
  VENDOR_UPDATE: "Owner update",
  LOG_CONTACT: "Contact logged",
  BOOK_VIEWING: "Viewing",
  DRAFT_REPLY: "Draft reply",
  DAY_BRIEF: "Day brief",
  UNCLEAR: "Not understood",
};

/**
 * Relative, then absolute.
 *
 * "2h" is what you want for this morning and useless for last month.
 * The switch is at a week, which is roughly where an agent stops
 * thinking in "the other day".
 */
function when(at: Date | string) {
  const d = new Date(at);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  if (mins < 10080) return `${Math.round(mins / 1440)}d`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
