"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * What the assistant is allowed to spend.
 *
 * My first version invented feature toggles — reply after hours, answer
 * in Arabic, book directly. None of those exist. What the router
 * actually controls is **budget**, and on reflection that is the more
 * important setting: an assistant that answers everything is the
 * product working, and an assistant that quietly runs up a bill is the
 * thing an owner needs a lever for.
 *
 * `isRunning` is read live. A cached answer to "is it sending messages
 * on my behalf right now" is not an answer.
 */
export function AssistantSettings() {
  const { data: running } = api.assistant.isRunning.useQuery(undefined, {
    staleTime: 0, refetchOnWindowFocus: true,
  });
  const { data: status } = api.assistant.status.useQuery();
  const update = api.assistant.updateSettings.useMutation();
  const pause = api.assistant.pause.useMutation();
  const resume = api.assistant.resume.useMutation();

  const [budget, setBudget] = useState<number | null>(null);
  const [warnAt, setWarnAt] = useState<number | null>(null);

  // The budget lives under `usage.budgetFils` — `status` carries the
  // spend ceiling alongside what has been spent against it, because
  // one is meaningless without the other.
  const currentBudget = budget ?? Number(status?.usage.budgetFils ?? 0) / 100;
  const currentWarn = warnAt ?? status?.warnAtPercent ?? 80;

  return (
    <section>
      <h2 className="font-sans font-semibold text-[19px] text-accent-deep -tracking-[0.02em] mb-1">
        The assistant
      </h2>
      <p className="text-sm text-ink-2 mb-4 max-w-[48ch]">
        {running?.enabled
          ? "Answering enquiries now."
          : "Stopped. Nothing is being sent on your behalf."}
      </p>

      <div className="flex gap-2 flex-wrap mb-8">
        {running?.enabled ? (
          <Button variant="secondary" loading={pause.isPending}
            onClick={() => pause.mutate({ reason: "Paused from settings" })}>
            Stop everything
          </Button>
        ) : (
          <Button variant="primary" loading={resume.isPending} onClick={() => resume.mutate()}>
            Start answering
          </Button>
        )}
      </div>

      <div className="border-t border-ink pt-5">
        <label htmlFor="budget" className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
          Monthly ceiling, in dirhams
        </label>
        <input id="budget" type="number" inputMode="decimal" value={currentBudget}
          onChange={(e) => setBudget(Number(e.target.value) || 0)}
          className="w-40 min-h-11 px-4 text-[16px] text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)] tabular" />
        <p className="text-sm text-ink-2 mt-1.5 max-w-[46ch] leading-snug">
          A hard stop, not a target. Reaching it hands conversations to your agents rather
          than dropping them — nobody is left unanswered because of a budget.
        </p>
      </div>

      <div className="mt-6">
        <label htmlFor="warn" className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
          Warn me at
        </label>
        <div className="flex gap-2 items-center">
          <input id="warn" type="number" min={50} max={95} value={currentWarn}
            onChange={(e) => setWarnAt(Number(e.target.value) || 80)}
            className="w-24 min-h-11 px-4 text-[16px] text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)] tabular" />
          <span className="text-[15px] text-ink-2">per cent</span>
        </div>
        <p className="text-sm text-ink-2 mt-1.5 max-w-[46ch] leading-snug">
          Early enough to do something about. A warning at a hundred is a notification about
          a decision already made for you.
        </p>
      </div>

      <Button variant="primary" className="mt-6" loading={update.isPending}
        onClick={() => update.mutate({
          monthlyBudgetFils: BigInt(Math.round(currentBudget * 100)),
          warnAtPercent: currentWarn,
        })}>
        Save
      </Button>

      <p className="text-sm text-ink-3 mt-8 max-w-[48ch] leading-snug">
        It never invents a fact about a property. Everything it says comes from your
        listings — if it does not know, it says so and fetches an agent.
      </p>
    </section>
  );
}
