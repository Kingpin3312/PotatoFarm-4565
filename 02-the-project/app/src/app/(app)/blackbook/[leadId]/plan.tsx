"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * The plan this person is on, and the one place to put them on one.
 *
 * On the person because that is where an agent is when somebody says
 * "we're looking in about six months" — the moment the README says a
 * plan exists for, and until now the moment it became a note in a field.
 */
const when = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : null;

export function Plan({ leadId }: { leadId: string }) {
  const utils = api.useUtils();
  const { data } = api.plans.forLead.useQuery({ leadId });
  const [picked, setPicked] = useState("");
  const done = () => { setPicked(""); void utils.plans.forLead.invalidate({ leadId }); };
  const subscribe = api.plans.subscribe.useMutation({ onSuccess: done });
  const resume = api.plans.resume.useMutation({ onSuccess: done });
  const stop = api.plans.stop.useMutation({ onSuccess: done });
  const error = subscribe.error ?? resume.error ?? stop.error;

  if (!data) return null;
  const live = data.subscriptions.find((s) => s.state === "RUNNING" || s.state === "PAUSED");
  const past = data.subscriptions.filter((s) => s !== live).slice(0, 3);

  return (
    <section className="mb-10" aria-labelledby="plan-heading">
      <h2 id="plan-heading" className="font-sans font-medium text-sub text-ink mb-1">Nurture plan</h2>

      {live ? (
        <div className="mt-2">
          <p className="text-ui text-ink">
            <span className="font-medium">{live.plan}</span>
            <span className="text-ink-3"> · step {live.done} of {live.of} done</span>
          </p>
          {live.state === "PAUSED" ? (
            // Said as what happened, because that is the good news: they
            // wrote back, and a person has them now.
            <p className="text-sm text-ink-2 mt-1 max-w-[52ch]">
              Paused — they replied. Nothing more comes up from the plan until you carry on.
            </p>
          ) : live.next ? (
            <p className="text-sm text-ink-2 mt-1 max-w-[52ch]">
              {/* A task written as a sentence already has its full stop. */}
              Next, on {when(live.nextDueAt)}: {live.next.replace(/[.!?]\s*$/, "")}.
            </p>
          ) : null}
          <div className="flex gap-x-6 mt-2">
            {live.state === "PAUSED" && (
              <button type="button" className="btn-inline min-h-11" disabled={resume.isPending}
                onClick={() => resume.mutate({ subscriptionId: live.id })}>
                Carry on with the plan
              </button>
            )}
            <button type="button" className="btn-inline min-h-11" disabled={stop.isPending}
              onClick={() => stop.mutate({ subscriptionId: live.id })}>
              Stop the plan
            </button>
          </div>
        </div>
      ) : data.plans.length === 0 ? (
        <p className="text-sm text-ink-3 mt-1 max-w-[52ch]">
          The brokerage has no plans yet. A manager can write one under Settings → Nurture plans.
        </p>
      ) : (
        <div className="mt-2">
          <p className="text-sm text-ink-2 max-w-[52ch]">
            For somebody who isn&rsquo;t ready yet. Each step comes up on your list when it&rsquo;s due; nothing
            is sent without you, and a reply pauses it.
          </p>
          <div className="flex gap-2 mt-3 flex-wrap">
            <label className="sr-only" htmlFor="plan-pick">Plan</label>
            <select id="plan-pick" value={picked} onChange={(e) => setPicked(e.target.value)}
              className="min-h-11 px-3 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]">
              <option value="">Choose a plan</option>
              {data.plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.steps} {p.steps === 1 ? "step" : "steps"}</option>
              ))}
            </select>
            <Button variant="primary" disabled={!picked} loading={subscribe.isPending}
              onClick={() => subscribe.mutate({ leadId, planId: picked })}>
              Put them on it
            </Button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger mt-2 max-w-[52ch]">{error.message}</p>}

      {past.length > 0 && (
        <ul className="mt-3 space-y-1">
          {past.map((s) => (
            <li key={s.id} className="text-sm text-ink-3">
              {s.plan} — {s.endedReason ?? s.state.toLowerCase()}{s.finishedAt ? `, ${when(s.finishedAt)}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
