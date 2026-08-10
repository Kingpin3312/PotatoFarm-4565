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
 */
export function Stages() {
  const { data, isLoading, refetch } = api.pipeline.stages.useQuery();
  const rebalance = api.pipeline.rebalance.useMutation({ onSuccess: () => void refetch() });

  if (isLoading || !data) return null;

  return (
    <section>
      <h2 className="font-sans font-semibold text-[19px] text-accent-type -tracking-[0.02em] mb-1">
        Stages
      </h2>
      <p className="text-sm text-ink-2 mb-4 max-w-[48ch]">
        A column with hundreds of leads in it is not a stage, it is a graveyard. Usually one
        agent hoarding, or one who left.
      </p>

      <div className="border-t border-ink">
        {data.stages.map((s) => {
          const heavy = s.count > 120;
          return (
            <div key={s.id} className={cn("py-3.5 border-b border-rule",
              heavy && "border-l-[3px] border-l-accent-edge pl-4 -ml-4")}>
              <div className="flex items-baseline gap-3">
                <span className="text-[16px] text-ink">{s.name}</span>
                <span className="ml-auto text-[15px] text-ink font-semibold tabular">
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
