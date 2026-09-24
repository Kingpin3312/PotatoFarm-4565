"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/cn";
import { RecordAnswer } from "@/app/(app)/viewings/what-they-thought";

/**
 * The agent's follow-ups, and the one button that clears them.
 *
 * `FollowUp` was written by voice notes and by the overnight sweep, and
 * this screen showed only a count of them — "3 follow-ups due" — that
 * nothing could bring down, because no procedure completed one and no
 * screen listed one. The reminder push linked to the blackbook, which
 * does not show them. An agent could set a reminder and never see it
 * again.
 *
 * Exactly the set the sentence at the top counts, so the two agree.
 */
export function FollowUps() {
  const utils = api.useUtils();
  const { data } = api.today.followUps.useQuery();
  const [failed, setFailed] = useState<string | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);

  const complete = api.today.completeFollowUp.useMutation({
    onMutate: async ({ id }) => {
      setFailed(null);
      await utils.today.followUps.cancel();
      const previous = utils.today.followUps.getData();
      utils.today.followUps.setData(undefined, (old) => old?.filter((f) => f.id !== id));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) utils.today.followUps.setData(undefined, ctx.previous);
      setFailed(err.message || "That did not save. It is back on your list.");
    },
    onSettled: () => {
      void utils.today.followUps.invalidate();
      // The count in the opening sentence reads the same rows.
      void utils.today.brief.invalidate();
    },
  });

  const items = data ?? [];
  // Nothing due is said by saying nothing — the sentence above already
  // says "nothing is overdue" when that is true.
  if (!items.length && !failed) return null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return (
    /* Styled as the action list above it — same label, same rules, Done
       underneath — because it is the same kind of thing: something to do.
       A second visual language for a second list reads as a second
       product. */
    <section id="follow-ups" className="mt-10 border-t border-rule pt-6 scroll-mt-6" aria-labelledby="follow-ups-heading">
      <h2 id="follow-ups-heading" className="t-label text-ink-3">
        Follow-ups · {items.length}
      </h2>

      {failed && (
        <p role="alert" className="mt-2 text-sm text-danger max-w-[52ch]">{failed}</p>
      )}

      <ul className="mt-2">
        {items.map((f) => {
          const due = new Date(f.dueAt);
          /**
           * Overdue means left over from an earlier day, not "the time
           * has passed". Every task a sweep raises is due the moment it
           * is written, so the stricter reading turned each one red a
           * minute after it appeared — and a list that is always red is
           * one an agent stops reading.
           */
          const overdue = due < startOfToday;
          const when = overdue
            ? due.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
            : due.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

          // A prepared message is folded away: it is long, and it is for
          // when the agent is ready to send, not for scanning the list.
          const [reason, draft] = (f.body ?? "").split(/\s*A draft:\s*/);

          return (
            <li key={f.id} className="border-b border-rule py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <p className="text-control leading-snug text-ink">{f.title}</p>
                {/* Said in words as well as colour, so it survives a
                    screen reader and a colour-blind eye. */}
                <span className={cn("shrink-0 t-label tabular", overdue ? "text-accent-type" : "text-ink-3")}>
                  {overdue ? `overdue · ${when}` : when}
                </span>
              </div>
              {f.lead && (
                <Link href={`/blackbook/${f.lead.id}`} className="mt-0.5 inline-block text-sm text-ink-2 no-underline hover:underline">
                  {f.lead.name}
                </Link>
              )}
              {reason && (
                <p className="mt-1 max-w-[68ch] text-sm leading-snug text-ink-2">{reason}</p>
              )}
              {draft && (
                <details className="mt-2 max-w-[68ch]">
                  <summary className="cursor-pointer t-label text-ink-3 hover:text-ink">Show the draft</summary>
                  <p className="mt-2 text-sm leading-snug text-ink-2 whitespace-pre-line bg-sunk p-3 rounded-sm">{draft}</p>
                </details>
              )}
              {answering === f.id && f.viewingId ? (
                <RecordAnswer viewingId={f.viewingId} onDone={() => {
                  // Saving the answer closes this task on the server.
                  setAnswering(null);
                  void utils.today.followUps.invalidate();
                  void utils.today.brief.invalidate();
                }} />
              ) : (
                <div className="mt-3 flex flex-wrap gap-x-6">
                  {/* A question's task is finished by its answer, so that
                      comes first; Done is still there for "they never
                      replied". */}
                  {f.viewingId && (
                    <button type="button" onClick={() => setAnswering(f.id)} className="btn-inline min-h-11">
                      Record their answer
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => complete.mutate({ id: f.id })}
                    className="btn-inline min-h-11"
                    aria-label={`Done: ${f.title}`}
                  >
                    Done
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
