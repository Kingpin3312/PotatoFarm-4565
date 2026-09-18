"use client";

import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The board's own columns, and rebalancing them.
 *
 * `rebalance` is the interesting one. A stage with 340 leads in it is
 * not a stage, it is a graveyard — and the usual cause is one agent
 * hoarding or one who left. Redistributing is a manager's decision, so
 * it says what it will do before it does it.
 *
 * ## What it shows on a brokerage with no graveyard
 *
 * Mounting it exposed the problem with the first version: it sat under
 * the funnel on the board and printed the same six names against the
 * same six counts, and everything it *added* — the unassigned split and
 * the rebalance button — only appeared above 120 leads in a column. On
 * a healthy pipeline it was the funnel again in a plainer typeface.
 *
 * So `unassigned` is shown at every size, not only past the threshold.
 * It is the number the funnel cannot carry and the one that predicts a
 * graveyard: a column of twelve where five belong to nobody is where
 * the next one starts, and it is actionable while it is still small.
 */
export function Stages() {
  const { data, isLoading, refetch } = api.pipeline.stages.useQuery();
  const rebalance = api.pipeline.rebalance.useMutation({ onSuccess: () => void refetch() });

  if (isLoading || !data) return null;

  return (
    <section>
      <h2 className="font-sans font-semibold text-body-lg text-ink mb-1">
        Stages
      </h2>
      <p className="text-sm text-ink-2 mb-4 max-w-[48ch]">
        How many are in each column, and how many of those belong to nobody. A stage filling
        with unowned leads is where a graveyard starts — usually one agent hoarding, or one
        who left.
      </p>

      <div className="border-t border-ink">
        {data.stages.map((s) => {
          const heavy = s.count > 120;
          return (
            <div key={s.id} className={cn("py-3.5 border-b border-rule",
              heavy && "border-s-[3px] border-s-accent-edge ps-4 -ms-4")}>
              <div className="flex items-baseline gap-3">
                <span className="text-control text-ink">{s.name}</span>
                {/* Unowned, always. The count beside it is already on
                    the funnel above; this is not. */}
                <span className="ms-auto text-sm text-ink-3 tabular">
                  {s.unassigned > 0
                    ? `${s.unassigned.toLocaleString()} unassigned`
                    : "all owned"}
                </span>
                <span className="text-ui text-ink font-medium tabular min-w-[3ch] text-end">
                  {s.count.toLocaleString()}
                </span>
                {heavy && (
                  <Button variant="secondary" loading={rebalance.isPending}
                    onClick={() => rebalance.mutate({ stageId: s.id })}>
                    Rebalance
                  </Button>
                )}
              </div>
              {heavy && (
                <p className="text-sm text-ink-2 mt-1.5 max-w-[46ch] leading-snug">
                  {s.unassigned > 0
                    ? `${s.unassigned} have nobody on them. Rebalancing spreads them across the team by current load.`
                    : "Concentrated on a few agents. Rebalancing evens it out — nobody loses a lead they are actively working."}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
