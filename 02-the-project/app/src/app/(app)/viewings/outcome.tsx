"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { WhatTheyThought, OWNER_SEES, type Thought } from "./what-they-thought";

/**
 * What happened at the viewing.
 *
 * Asked once, in three taps, and only after the slot has passed. An
 * outcome form that appears before the viewing is a form nobody trusts.
 *
 * What the buyer thought matters more than the status: it is what the
 * owner's weekly report is built from, and "it went well" three times
 * running is how a vendor ends up surprised that nobody has offered.
 *
 * This form used to promise that its note went into that report. Nothing
 * read the note; the report reads a verdict and reasons, and nothing
 * wrote those. They are asked for here now, with "not asked yet" as the
 * default, because the honest answer at the door usually is — the
 * question goes on the agent's list two hours later.
 */
export function Outcome({ viewingId, onDone }: { viewingId: string; onDone?: () => void }) {
  const outcome = api.viewings.outcome.useMutation({ onSuccess: onDone });
  const [status, setStatus] = useState<"COMPLETED"|"NO_SHOW"|"CANCELLED"|null>(null);
  const [note, setNote] = useState("");
  const [thought, setThought] = useState<Thought | null>(null);

  return (
    <div className="border-t border-rule pt-4">
      <span className="block t-label text-ink-3 mb-2">
        How did it go?
      </span>
      <div className="flex gap-2 flex-wrap">
        {([["COMPLETED","They came"],["NO_SHOW","No show"],["CANCELLED","Cancelled"]] as const)
          .map(([k, label]) => (
            <button key={k} onClick={() => setStatus(k)} aria-pressed={status === k}
              className={`min-h-11 px-4 rounded-lg border text-ui ${
                status === k ? "bg-accent text-on-accent border-accent-edge font-medium"
                             : "border-rule text-ink"}`}>
              {label}
            </button>
          ))}
      </div>

      {status === "COMPLETED" && (
        <div className="mt-4">
          <span className="block t-label text-ink-3 mb-2">What did they think?</span>
          <WhatTheyThought value={thought} onChange={setThought} allowNotYet />
          <label htmlFor="vnote" className="block t-label text-ink-3 mt-4 mb-2">
            What did they say
          </label>
          <textarea id="vnote" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. too dark, wants a higher floor, second viewing with wife"
            className="w-full px-4 py-2.5 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
          <p className="text-sm text-ink-2 mt-1.5 max-w-[52ch] leading-snug">{OWNER_SEES}</p>
        </div>
      )}

      {outcome.error && <p role="alert" className="text-sm text-danger mt-3">{outcome.error.message}</p>}
      <Button variant="primary" className="mt-4" loading={outcome.isPending} disabled={!status}
        onClick={() => outcome.mutate({
          viewingId, status: status!, note: note || undefined,
          ...(status === "COMPLETED" && thought && {
            feedback: { verdict: thought.verdict, reasons: thought.reasons as never, comment: note || undefined },
          }),
        })}>
        Save
      </Button>
    </div>
  );
}
