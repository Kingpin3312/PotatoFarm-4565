"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";

/**
 * Every lead, as a list.
 *
 * The pipeline board is for working; this is for finding. An owner
 * looking for "everyone from Bayut last month who never got a reply"
 * needs a list, not a board.
 *
 * Bulk assign is here rather than on the board because it is a manager's
 * action taken deliberately, not something to do by dragging.
 */
export default function Leads() {
  const [filter, setFilter] = useState<"all"|"unassigned"|"cold"|"hot">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { data, isLoading, isError, refetch } = api.leads.list.useQuery({ filter });
  // pipeline.bulkAssign, not leads.assign — the latter takes ONE leadId
  // and this screen selects many. Passing an array to it would have
  // failed at runtime with a validation error nobody could read.
  const assign = api.pipeline.bulkAssign.useMutation({
    onSuccess: () => { setPicked(new Set()); void refetch(); },
  });
  const remove = api.leads.remove.useMutation({ onSuccess: () => void refetch() });
  const { data: team } = api.org.members.useQuery();

  if (isError) return <QueryError retry={() => void refetch()} what="your leads" />;

  const rows = data?.leads ?? [];
  const toggle = (id: string) => setPicked((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  return (
    <div className="max-w-[760px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
          Leads
        </span>
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-ink -tracking-[0.026em] leading-none tabular">
          {rows.length.toLocaleString()}
        </h1>
      </header>

      <div className="flex gap-2 flex-wrap mb-5">
        {([["all","Everyone"],["unassigned","Nobody's"],["hot","Hot"],["cold","Gone quiet"]] as const)
          .map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={cn("min-h-11 px-4 rounded-lg border text-[15px]",
                filter === k ? "bg-accent text-on-accent border-accent-edge font-semibold"
                             : "border-rule text-ink")}>
              {label}
            </button>
          ))}
      </div>

      {/* The bar appears only when something is selected, so it never
          sits there as permanent clutter. */}
      {picked.size > 0 && (
        <div className="bg-sunk rounded-xl p-4 mb-5 flex items-center gap-3 flex-wrap">
          <span className="text-[15px] text-ink font-semibold tabular">
            {picked.size} selected
          </span>
          <label htmlFor="assign-to" className="sr-only">Assign to</label>
          <select id="assign-to"
            onChange={(e) => e.target.value &&
              assign.mutate({ leadIds: [...picked], agentId: e.target.value })}
            className="min-h-11 px-3 text-[15px] text-ink bg-raised border border-rule rounded-lg">
            <option value="">Assign to…</option>
            {(team?.members ?? []).map((m) => (
              <option key={m.id} value={m.id}>{m.name ?? m.email}</option>
            ))}
          </select>
          <button className="btn-inline ml-auto" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="h-64 bg-sunk rounded-sm" aria-busy />
      ) : rows.length === 0 ? (
        <p className="text-[17px] text-ink-2 border-t border-rule pt-5 max-w-[42ch]">
          Nothing here. {filter === "unassigned" ? "Every lead has somebody on it." : ""}
        </p>
      ) : (
        <div className="border-t border-ink">
          {rows.map((l) => (
            <div key={l.id} className="flex items-center gap-3 py-3 border-b border-rule">
              <label className="flex items-center min-h-11 cursor-pointer">
                <span className="sr-only">Select {l.name ?? l.phone}</span>
                <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)}
                  className="w-5 h-5 accent-[var(--accent)]" />
              </label>
              <a href={`/inbox/${l.conversationId ?? l.id}`}
                 className="text-[15px] text-ink no-underline flex-1">
                {l.name ?? l.phone}
              </a>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                {l.source}
              </span>
              <span className="font-mono text-[11px] text-ink-3 w-20 text-right tabular">
                {l.agentName ?? "unassigned"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
