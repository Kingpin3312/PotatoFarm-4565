"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";

/**
 * How leads are handed out.
 *
 * Five procedures with no screen, and this is the one agents argue
 * about. A routing rule nobody can see is a routing rule everybody
 * suspects — the value here is not configuring it, it is showing it.
 *
 * `preview` matters more than `rules`: an owner changing the strategy
 * wants to know who gains and who loses before it happens, not after
 * four agents have complained.
 */
export default function Routing() {
  const { data, isLoading, isError, refetch, error } = api.routing.rules.useQuery();
  // The five values AssignStrategy actually has. "SPECIALIST" was not
  // one of them — matching on community and language is applied by
  // `available()` before every strategy runs, so it is a filter on all
  // of them rather than a strategy of its own.
  const [strategy, setStrategy] =
    useState<"ROUND_ROBIN"|"LEAST_LOADED"|"FASTEST"|"SPECIFIC"|"UNASSIGNED">("ROUND_ROBIN");
  const preview = api.routing.preview.useQuery({ strategy }, { enabled: Boolean(strategy) });

  if (isError) return <QueryError retry={() => void refetch()} what="the routing rules" error={error} />;
  if (isLoading) return <div className="max-w-[680px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>;

  const STRATEGIES = [
    ["ROUND_ROBIN", "In turn", "Everyone gets the next one. Fair, and ignores who is drowning."],
    ["LEAST_LOADED", "Whoever has fewest", "Balances the load. New agents get more, which is usually right."],
    ["FASTEST", "Whoever replies fastest", "Rewards speed — and quietly punishes anyone in a viewing."],
    ["SPECIFIC", "Always one person", "Every lead matching this rule goes to the same agent."],
    ["UNASSIGNED", "Shared pool", "Nobody gets it automatically. First to claim it owns it."],
  ] as const;

  return (
    <div className="max-w-[680px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
          Lead routing
        </span>
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-accent-type -tracking-[0.026em] leading-none">
          {data?.current ? label(data.current) : "Not set"}
        </h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[50ch]">
          Every agent can see this page and the history behind their own leads. A rule nobody
          can see is a rule everybody suspects.
        </p>
      </header>

      <div className="space-y-2">
        {STRATEGIES.map(([k, name, why]) => (
          <button key={k} onClick={() => setStrategy(k)} aria-pressed={strategy === k}
            className={cn("w-full text-left min-h-11 px-4 py-3 rounded-lg border",
              strategy === k ? "border-accent-edge bg-sunk" : "border-rule")}>
            <span className="text-[16px] text-ink font-semibold block">{name}</span>
            <span className="text-sm text-ink-2 block mt-0.5 leading-snug">{why}</span>
          </button>
        ))}
      </div>

      {/* Who gains and who loses, before it happens. An owner switching
          strategy without this finds out from four complaints. */}
      {preview.data && (
        <>
          <h2 className="font-sans font-semibold text-[17px] text-accent-deep mt-10 mb-1">
            Who would get the next one
          </h2>
          {/* `pool`, not `agents` — and every field here comes from what
              the router actually returns. The invented version showed a
              "would get / delta" table the procedure never produced.

              The real shape is better: it carries eligibility and the
              reason, so an agent asking "why not me" gets an answer
              without a manager guessing. */}
          <p className="text-sm text-ink-2 mb-3 max-w-[48ch]">
            Every agent and their current state. An agent who asks why a lead went elsewhere
            can be shown this.
          </p>
          <div className="border-t border-ink">
            {preview.data.pool.map((a) => (
              <div key={a.name}
                   className={cn("py-3 border-b border-rule",
                     !a.eligible && "opacity-60")}>
                <div className="flex items-baseline gap-3">
                  <span className="text-[15px] text-ink">{a.name}</span>
                  {a.away && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                      away
                    </span>
                  )}
                  <span className="ml-auto text-[15px] text-ink tabular">
                    {a.openLeads} / {a.capacity}
                  </span>
                  <span className="font-mono text-[11px] text-ink-3 w-20 text-right">
                    {a.lastAssignedAt
                      ? new Date(a.lastAssignedAt).toLocaleDateString("en-GB",
                          { day: "numeric", month: "short" })
                      : "never"}
                  </span>
                </div>
                {!a.eligible && (
                  <p className="text-sm text-ink-2 mt-1 max-w-[44ch] leading-snug">
                    Not in line for the next lead — at capacity, or marked away.
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-sm text-ink-3 mt-8 max-w-[48ch] leading-snug">
        An agent who thinks a lead went to the wrong person can raise it from the lead itself.
        The dispute goes to a manager with the routing decision attached, so the conversation
        starts with the facts.
      </p>
    </div>
  );
}

const label = (s: string) => ({
  ROUND_ROBIN: "In turn", LEAST_LOADED: "Whoever has fewest",
  FASTEST: "Whoever replies fastest", SPECIALIST: "By area or budget",
}[s] ?? s);
