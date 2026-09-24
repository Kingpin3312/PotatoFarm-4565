"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { question, followUp, VERDICTS } from "@/server/lib/feedback/collect";

/**
 * What a buyer thought of a viewing, as the agent records it.
 *
 * The same four answers and the same short list of reasons the buyer is
 * offered in `collect.ts`, read from there rather than copied, so an
 * answer an agent records and one a buyer taps are counted together in
 * the owner's report. A second list here would drift from the first and
 * split one reason into two lines of the report.
 */
export type Thought = { verdict: (typeof VERDICTS)[number]; reasons: string[] };

const toggle = (on: boolean) =>
  `min-h-11 px-4 rounded-lg border text-ui ${
    on ? "bg-accent text-on-accent border-accent-edge font-medium" : "border-rule text-ink"}`;

export function WhatTheyThought({ value, onChange, allowNotYet = false }: {
  value: Thought | null;
  onChange: (v: Thought | null) => void;
  /** At the viewing itself the honest answer is usually "not asked yet". */
  allowNotYet?: boolean;
}) {
  const answers = question("", null).options;
  const why = value ? followUp(value.verdict) : null;

  return (
    <div>
      <div role="group" aria-label="What did they think?" className="flex gap-2 flex-wrap">
        {allowNotYet && (
          <button type="button" aria-pressed={value === null} className={toggle(value === null)}
            onClick={() => onChange(null)}>
            Not asked yet
          </button>
        )}
        {answers.map((o) => (
          <button key={o.id} type="button" aria-pressed={value?.verdict === o.id}
            className={toggle(value?.verdict === o.id)}
            // A new answer starts its reasons afresh: "price" under "not
            // for me" is not a reason under "I'd like to make an offer".
            onClick={() => onChange({ verdict: o.id as Thought["verdict"], reasons: [] })}>
            {o.label}
          </button>
        ))}
      </div>

      {value && why && (
        <div className="mt-3">
          <span className="block t-label text-ink-3 mb-2">What was the main thing? Pick any.</span>
          <div role="group" aria-label="Reasons" className="flex gap-2 flex-wrap">
            {why.options.map((o) => {
              const on = value.reasons.includes(o.id);
              return (
                <button key={o.id} type="button" aria-pressed={on} className={toggle(on)}
                  onClick={() => onChange({
                    ...value,
                    reasons: on ? value.reasons.filter((r) => r !== o.id) : [...value.reasons, o.id],
                  })}>
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** What stays with the agent and what reaches the owner, said where it is typed. */
export const OWNER_SEES =
  "The owner's weekly report counts the answer and the reasons across every viewing. " +
  "Their own words stay here — an owner never sees them.";

/**
 * Recording the answer later: from the task `feedback.ask` puts on the
 * agent's list, once the buyer has replied or been rung.
 */
export function RecordAnswer({ viewingId, onDone }: { viewingId: string; onDone?: () => void }) {
  const [thought, setThought] = useState<Thought | null>(null);
  const [comment, setComment] = useState("");
  const save = api.viewings.feedback.useMutation({ onSuccess: () => onDone?.() });

  return (
    <div className="mt-3 border-t border-rule pt-3 max-w-[68ch]">
      <span className="block t-label text-ink-3 mb-2">What did they say?</span>
      <WhatTheyThought value={thought} onChange={setThought} />
      <label className="block mt-3">
        <span className="block t-label text-ink-3 mb-2">In their words (optional)</span>
        <textarea rows={2} value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)}
          className="w-full px-4 py-2.5 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
      </label>
      <p className="text-sm text-ink-2 mt-1.5 max-w-[52ch] leading-snug">{OWNER_SEES}</p>
      {save.error && <p role="alert" className="text-sm text-danger mt-2">{save.error.message}</p>}
      <Button variant="primary" className="mt-3" loading={save.isPending} disabled={!thought}
        onClick={() => thought && save.mutate({
          viewingId, verdict: thought.verdict, reasons: thought.reasons as never, comment: comment.trim() || undefined,
        })}>
        Save their answer
      </Button>
    </div>
  );
}
