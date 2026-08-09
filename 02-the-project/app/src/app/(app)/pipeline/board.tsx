"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { aed, aedShort } from "@/lib/money";

/**
 * The pipeline board.
 *
 * The interesting part is not the drag, it is what happens when two
 * people drag at once. The server refuses a move whose neighbours have
 * shifted underneath it, and the client refetches rather than guessing —
 * a board that silently applies a stale move is a board nobody trusts.
 */
export function Board() {
  const utils = api.useUtils();
  const { data, isLoading , isError, refetch } = api.pipeline.board.useQuery({ perColumn: 20 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const move = api.pipeline.move.useMutation({
    onError(err) {
      if (err.data?.code === "CONFLICT") {
        // Not an error message to dismiss — the board was wrong and is
        // being corrected. Say so, then fix it.
        setConflict(true);
        void utils.pipeline.board.invalidate();
        setTimeout(() => setConflict(false), 3000);
      }
    },
    onSettled: () => utils.pipeline.board.invalidate(),
  });

  if (isLoading) return <BoardSkeleton />;
  if (isError) return <QueryError retry={() => void refetch()} what="your pipeline" />;
  if (!data) return null;

  /**
   * Nothing at all, anywhere.
   *
   * Five empty columns tell an agent nothing — they cannot distinguish
   * "we have no leads yet" from "this is broken". On day one that
   * distinction is the whole difference between patience and a support
   * call.
   */
  const totalLeads = data.columns.reduce((n, c) => n + c.total, 0);
  if (totalLeads === 0) {
    return (
      <div className="grid place-items-center min-h-[60vh] px-6">
        <div className="max-w-[42ch] text-center">
          <p className="text-[19px] font-semibold text-ink">Your pipeline is empty.</p>
          <p className="text-sm text-ink-2 mt-2">
            Leads appear here the moment an enquiry arrives from a portal or a WhatsApp
            message. Nothing is wrong — there is just nothing yet.
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3 mt-5">
            {data.columns.length} stages ready
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 h-full">
      {conflict && (
        <div role="status" className="px-5 py-3 bg-ink text-ground text-sm">
          Someone else moved this column while you were dragging. Refreshed.
        </div>
      )}

      <div className="grid grid-flow-col auto-cols-[290px] max-[640px]:auto-cols-[86vw] overflow-x-auto min-h-0 snap-x">
        {data.columns.map((col) => (
          <section
            key={col.stage.id}
            aria-label={col.stage.name}
            className="border-r border-rule flex flex-col min-h-0 snap-start"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              if (!dragging) return;

              /**
               * Work out which two cards it was dropped between, from the
               * cursor position against each card's midpoint.
               *
               * The first version always passed the top of the column,
               * which meant a drag could reorder nothing — you could move
               * a lead to a different stage and never change its place
               * within one. On a board where position is priority, that is
               * half the feature missing.
               */
              const cards = [...e.currentTarget.querySelectorAll("[data-lead]")]
                .filter((el) => el.getAttribute("data-lead") !== dragging);

              const next = cards.find((el) => {
                const r = el.getBoundingClientRect();
                return e.clientY < r.top + r.height / 2;
              });
              const index = next ? cards.indexOf(next) : cards.length;

              move.mutate({
                leadId: dragging,
                toStageId: col.stage.id,
                afterLeadId: index > 0 ? cards[index - 1]?.getAttribute("data-lead") ?? null : null,
                beforeLeadId: next ? next.getAttribute("data-lead") : null,
              });
              setDragging(null);
            }}
          >
            <div className="px-4 pt-3.5 pb-3 border-b border-ink sticky top-0 bg-ground z-10">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink">
                  {col.stage.name}
                </span>
                <span className="ml-auto font-mono text-[11px] text-ink-3">{col.total}</span>
              </div>
              <div className="font-sans font-semibold -tracking-[0.024em] text-[20px] text-ink mt-1.5 -tracking-[0.01em]">
                {col.value ? aedShort(col.value) : "—"}
              </div>
            </div>

            <div className="overflow-y-auto flex-1 pb-10">
              {col.leads.map((l) => (
                <button
                  key={l.id}
                  data-lead={l.id}
                  draggable
                  onDragStart={() => setDragging(l.id)}
                  onDragEnd={() => setDragging(null)}
                  className={cn(
                    "block w-full text-left px-4 py-3.5 border-b border-rule cursor-grab active:cursor-grabbing hover:bg-raised",
                    dragging === l.id && "opacity-40"
                  )}
                >
                  <span className="flex items-baseline gap-2">
                    {l.conversation && l.conversation.unreadCount > 0 && (
                      <span className="size-1.5 rounded-full bg-accent shrink-0" />
                    )}
                    <span className="text-[15px] font-semibold text-ink">
                      {l.name ?? l.phone}
                    </span>
                  </span>

                  <span className="block font-mono text-[13px] text-ink mt-1.5">
                    {l.budgetMaxFils ? aedShort(l.budgetMaxFils) : "—"}
                  </span>

                  <span className="flex gap-2 mt-2 items-center flex-wrap">
                    {l.source && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-3 border border-rule rounded-[2px] px-1.5">
                        {l.source.replace(/_/g, " ").toLowerCase()}
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[9px] text-ink-3">
                      {l.assignedTo?.name ?? "Unassigned"}
                    </span>
                  </span>

                  {/* Going cold. The one thing on the card that is a
                      judgement rather than a fact, so it says how long. */}
                  {l.stale && (
                    <span className="flex items-center gap-1.5 mt-2 pl-2 border-l-2 border-accent font-mono text-[9px] uppercase tracking-[0.1em] text-accent">
                      Untouched {days(l.stageEnteredAt)} days
                    </span>
                  )}
                </button>
              ))}

              {col.leads.length < col.total && (
                <p className="px-4 py-4 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                  {col.total - col.leads.length} more
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid grid-flow-col auto-cols-[290px] overflow-hidden" aria-busy>
      <span className="sr-only">Loading the pipeline</span>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="border-r border-rule p-4">
          <div className="h-2.5 w-20 bg-sunk rounded-sm" />
          <div className="h-6 w-28 bg-sunk rounded-sm mt-3" />
          {[...Array(3)].map((_, j) => (
            <div key={j} className="h-16 bg-sunk rounded-sm mt-3 opacity-60" />
          ))}
        </div>
      ))}
    </div>
  );
}

const days = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
