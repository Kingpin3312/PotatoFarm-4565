"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { aed } from "@/lib/money";
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
 * ## Two things changed when this was finally mounted
 *
 * It carried its own start/stop pair, and its host is the settings
 * screen — where `KillSwitch` is the first and largest thing on the
 * page, with a confirmation that states the consequence in the
 * brokerage's own enquiry volume. Two stop buttons on one screen is
 * worse than one: the smaller of them looks like the lesser stop, and
 * there is no such thing. The controls are gone from here and the
 * ceiling is what remains, which is what the doc comment above always
 * said this was for.
 *
 * And zero was unsendable. `updateSettings` takes a **positive**
 * bigint or null, and a brokerage with no ceiling set reads back as
 * `budgetFils: null`, which this rendered as `0` — so opening the
 * screen and pressing Save, changing nothing, failed validation with
 * nothing on screen to say so. Zero now means what the schema means by
 * null, the field says so, and both outcomes of the mutation are
 * visible.
 */
export function AssistantSettings() {
  const utils = api.useUtils();
  const { data: status } = api.assistant.status.useQuery();
  const update = api.assistant.updateSettings.useMutation({
    onSuccess: () => { setFailed(null); setSaved(true); void utils.assistant.status.invalidate(); },
    onError: (e) => { setSaved(false); setFailed(e.message); },
  });

  const [budget, setBudget] = useState<number | null>(null);
  const [warnAt, setWarnAt] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // The budget lives under `usage.budgetFils` — `status` carries the
  // spend ceiling alongside what has been spent against it, because
  // one is meaningless without the other.
  const currentBudget = budget ?? Number(status?.usage.budgetFils ?? 0) / 100;
  const currentWarn = warnAt ?? status?.warnAtPercent ?? 80;

  return (
    <section className="mt-12">
      <h2 className="font-sans font-semibold text-section text-ink mb-1">
        What it may spend
      </h2>
      <p className="text-sm text-ink-3 max-w-[60ch]">
        A hard stop, not a target. Reaching it hands conversations to your agents rather
        than dropping them — nobody is left unanswered because of a budget.
      </p>

      <div className="border-t border-ink mt-5 pt-5">
        <label htmlFor="budget" className="block t-label text-ink-3 mb-2">
          Monthly ceiling, in dirhams
        </label>
        <input id="budget" type="number" min={0} inputMode="decimal" value={currentBudget}
          onChange={(e) => { setSaved(false); setBudget(Number(e.target.value) || 0); }}
          className="w-40 min-h-11 px-4 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)] tabular" />
        <p className="text-sm text-ink-2 mt-1.5 max-w-[46ch] leading-snug">
          Zero means no ceiling. {status
            ? `${aed(status.usage.spentFils)} spent this month.`
            : ""}
        </p>
      </div>

      <div className="mt-6">
        <label htmlFor="warn" className="block t-label text-ink-3 mb-2">
          Warn me at
        </label>
        <div className="flex gap-2 items-center">
          <input id="warn" type="number" min={10} max={99} value={currentWarn}
            onChange={(e) => { setSaved(false); setWarnAt(Number(e.target.value) || 80); }}
            className="w-24 min-h-11 px-4 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)] tabular" />
          <span className="text-ui text-ink-2">per cent</span>
        </div>
        <p className="text-sm text-ink-2 mt-1.5 max-w-[46ch] leading-snug">
          Early enough to do something about. A warning at a hundred is a notification about
          a decision already made for you.
        </p>
      </div>

      {failed && (
        <p role="alert" className="mt-5 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">
          {failed}
        </p>
      )}
      {saved && !failed && (
        <p role="status" className="mt-5 px-3 py-2.5 border border-rule text-sm rounded-[3px] text-ink-2">
          Saved.
        </p>
      )}

      <Button variant="primary" className="mt-6" loading={update.isPending}
        onClick={() => {
          setSaved(false);
          setFailed(null);
          update.mutate({
            // Null, not zero. The schema takes a positive amount or
            // nothing at all, and "no ceiling" is the second of those.
            monthlyBudgetFils: currentBudget > 0
              ? BigInt(Math.round(currentBudget * 100))
              : null,
            warnAtPercent: currentWarn,
          });
        }}>
        Save
      </Button>

      <p className="text-sm text-ink-3 mt-8 max-w-[48ch] leading-snug">
        It never invents a fact about a property. Everything it says comes from your
        listings — if it does not know, it says so and fetches an agent.
      </p>
    </section>
  );
}
