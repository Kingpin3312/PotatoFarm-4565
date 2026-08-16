"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { aed, aedShort } from "@/lib/money";
import { sentence } from "@/lib/sentence";
import { Funnel } from "@/components/ui/chart";

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
  const { data, isLoading , isError, refetch, error } = api.pipeline.board.useQuery({ perColumn: 20 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const [failed, setFailed] = useState<string | null>(null);

  /**
   * The card moves on drop, not on the server's reply.
   *
   * Dragging is the most physical thing in this product — a hand moved
   * a card across a screen — and it was the slowest: the card snapped
   * back to its old column and sat there for a mutation *and* a refetch
   * before appearing where it had been put. Two round trips of the card
   * being visibly in the wrong place, on the one interaction where the
   * agent has already committed.
   *
   * `perColumn: 20` is repeated here because a cache write is keyed by
   * the input. Written with `undefined` it silently updates nothing —
   * no error, no change, and the only symptom is the optimism appearing
   * not to work.
   */
  const KEY = { perColumn: 20 } as const;
  type Board = ReturnType<typeof utils.pipeline.board.getData>;

  const move = api.pipeline.move.useMutation({
    async onMutate(vars): Promise<{ previous: Board }> {
      setFailed(null);
      // Before the snapshot: a refetch already in flight when the card
      // was dropped will otherwise land afterwards and undo the move on
      // its own, which reads as the drag having been ignored.
      await utils.pipeline.board.cancel();
      const previous = utils.pipeline.board.getData(KEY);

      utils.pipeline.board.setData(KEY, (old) => {
        if (!old) return old;
        const from = old.columns.find((c) => c.leads.some((l) => l.id === vars.leadId));
        const card = from?.leads.find((l) => l.id === vars.leadId);
        if (!from || !card) return old;
        const sameColumn = from.stage.id === vars.toStageId;

        return {
          ...old,
          columns: old.columns.map((col) => {
            const without = col.leads.filter((l) => l.id !== vars.leadId);

            if (col.stage.id === vars.toStageId) {
              // The neighbours come from the drop handler, which read
              // them off the DOM with the dragged card excluded — so
              // they index into `without`, not into `col.leads`.
              const before = vars.beforeLeadId
                ? without.findIndex((l) => l.id === vars.beforeLeadId)
                : -1;
              const after = vars.afterLeadId
                ? without.findIndex((l) => l.id === vars.afterLeadId)
                : -1;
              const at = before >= 0 ? before : after >= 0 ? after + 1 : without.length;

              const leads = [...without];
              leads.splice(at, 0, {
                ...card,
                // Moving a lead resets `stageEnteredAt` server-side, so
                // carrying the old "Untouched 12 days" across would be a
                // stale badge on a card the agent has just touched.
                stale: sameColumn ? card.stale : false,
              });

              return sameColumn ? { ...col, leads } : {
                ...col,
                leads,
                total: col.total + 1,
                value: sum(col.value, card.budgetMaxFils),
              };
            }

            if (col.stage.id === from.stage.id) {
              return { ...col, leads: without, total: Math.max(0, col.total - 1),
                       value: sum(col.value, card.budgetMaxFils, -1) };
            }
            return col;
          }),
        };
      });

      return { previous };
    },

    onError(err, _vars, ctx) {
      // Put it back first, whatever went wrong. A card left in the
      // column the server rejected is the worst of both worlds.
      if (ctx?.previous) utils.pipeline.board.setData(KEY, ctx.previous);

      if (err.data?.code === "CONFLICT") {
        // Not an error message to dismiss — the board was wrong and is
        // being corrected. Say so, then fix it.
        setConflict(true);
        void utils.pipeline.board.invalidate();
        setTimeout(() => setConflict(false), 3000);
        return;
      }
      // Every other failure. Silence here would leave the card sliding
      // back with no explanation, which is worse than never having
      // moved it — the agent cannot tell whether the move was recorded.
      setFailed(err.message || "That move did not save. The card is back where it was.");
    },

    onSettled: () => utils.pipeline.board.invalidate(),
  });

  if (isLoading) return <BoardSkeleton />;
  if (isError) return <QueryError retry={() => void refetch()} what="your pipeline" error={error} />;
  if (!data) return null;

  /**
   * Nothing at all, anywhere.
   *
   * Five empty columns tell an agent nothing — they cannot distinguish
   * "we have no leads yet" from "this is broken". On day one that
   * distinction is the whole difference between patience and a support
   * call.
   */
  /**
   * No stages at all, which is not the same thing as no leads.
   *
   * This screen used to answer both with "Your pipeline is empty. Leads
   * appear here the moment an enquiry arrives" — told to a brokerage
   * that had thirteen. Nothing created a `PipelineStage`, so the board
   * had no columns, every lead sat with `stageId: null`, and the empty
   * state reassured the owner that nothing was wrong while their whole
   * pipeline was unreachable.
   *
   * Checked before the lead count, because with no columns the lead
   * count is always zero and the wrong message wins.
   */
  if (data.columns.length === 0) {
    return (
      <div className="grid place-items-center min-h-[60vh] px-6">
        <div className="max-w-[46ch] text-center">
          <p className="text-body-lg font-semibold text-ink">
            This brokerage has no pipeline stages.
          </p>
          <p className="text-sm text-ink-2 mt-2">
            A board needs columns before it can show anything, and none were set
            up. Any leads you already have are safe — they are on the Leads
            screen, and they will appear here once stages exist.
          </p>
          <p className="mt-5">
            <a href="/settings" className="text-ui text-accent-deep">
              Set up your stages
            </a>
          </p>
        </div>
      </div>
    );
  }

  const totalLeads = data.columns.reduce((n, c) => n + c.total, 0);
  if (totalLeads === 0) {
    return (
      <div className="grid place-items-center min-h-[60vh] px-6">
        <div className="max-w-[42ch] text-center">
          <p className="text-body-lg font-semibold text-ink">Your pipeline is empty.</p>
          <p className="text-sm text-ink-2 mt-2">
            Leads appear here the moment an enquiry arrives from a portal or a WhatsApp
            message. Nothing is wrong — there is just nothing yet.
          </p>
          <p className="t-label text-ink-3 mt-5">
            {data.columns.length} stages ready
          </p>
        </div>
      </div>
    );
  }

  /**
   * Open work, which is not the same as every card on the board.
   *
   * `Won` and `Lost` are terminal: counting them in "open" would make a
   * brokerage that closed ten deals look busier than one that closed
   * none, which is the opposite of true.
   */
  const terminal = /^(won|lost)$/i;
  const openCols = (data?.columns ?? []).filter((c) => !terminal.test(c.stage.name));
  const open = openCols.reduce((n, c) => n + c.total, 0);
  const openValue = openCols.reduce((n, c) => n + (c.value ?? 0n), 0n);

  return (
    <div className="flex flex-col min-h-0 h-full">
      {conflict && (
        <div role="status" className="px-5 py-3 bg-ink text-ground text-sm">
          Someone else moved this column while you were dragging. Refreshed.
        </div>
      )}

      {/* `alert`, not `status`: the card has just slid back under the
          agent's hand and they need to know why without going looking
          for it. The column totals have already been restored. */}
      {failed && (
        <div role="alert" className="px-5 py-3 bg-ink text-ground text-sm flex items-center gap-4">
          <span>{failed}</span>
          <button
            type="button"
            onClick={() => setFailed(null)}
            className="ml-auto min-h-11 px-2 bg-transparent border-0 text-ground underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/**
        * The shape of the board, above the board.
        *
        * The columns already carry the counts, and a row of counts is a
        * table: it tells you the numbers and not the story. The question
        * an owner opens the pipeline to ask is "where does it stop
        * moving", and the answer is a shape — the stage that takes nine
        * in and passes one on.
        *
        * Same data as the columns beside it, no extra query. Hidden on a
        * phone: at 375px the funnel would be six stacked bars above a
        * board that is already the thing you came to use, and the shape
        * is a glance a manager takes on a laptop.
        */}
      <div className="hidden md:block border-b border-rule px-5 py-4">
        <div className="max-w-[620px]">
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="t-label text-ink-3">Where it stops moving</h2>
            {open > 0 && (
              <span className="text-note text-ink-3">
                {open.toLocaleString()} open · {aedShort(openValue)}
              </span>
            )}
          </div>
          <Funnel
            rows={(data?.columns ?? []).map((c) => ({
              label: c.stage.name,
              value: c.total,
              note: c.value ? aedShort(c.value) : undefined,
            }))}
            empty="Nothing in the pipeline yet. Stages fill as enquiries arrive and get qualified."
          />
        </div>
      </div>

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
                <span className="t-label text-ink">
                  {col.stage.name}
                </span>
                <span className="ml-auto font-mono text-label text-ink-3">{col.total}</span>
              </div>
              <div className="font-sans font-semibold text-section text-ink mt-1.5">
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
                    <span className="text-ui font-medium text-ink">
                      {l.name ?? l.phone}
                    </span>
                  </span>

                  <span className="block font-mono text-note text-ink mt-1.5">
                    {l.budgetMaxFils ? aedShort(l.budgetMaxFils) : "—"}
                  </span>

                  <span className="flex gap-2 mt-2 items-center flex-wrap">
                    {l.source && (
                      <span className="t-label text-ink-3 border border-rule rounded-[2px] px-1.5">
                        {sentence(l.source)}
                      </span>
                    )}
                    <span className="ml-auto text-label text-ink-3">
                      {l.assignedTo?.name ?? "Unassigned"}
                    </span>
                  </span>

                  {/* Going cold. The one thing on the card that is a
                      judgement rather than a fact, so it says how long. */}
                  {l.stale && (
                    /* The stripe keeps the brand orange; the words take
                       the readable step. At 9px, #E86A2C is 3.22:1 and
                       this is the one label on the card somebody has to
                       read at a glance across a room. A border is not
                       text and 3.22:1 clears the 3:1 it needs. */
                    <span className="flex items-center gap-1.5 mt-2 pl-2 border-l-2 border-accent t-label text-accent-deep">
                      Untouched {days(l.stageEnteredAt)} days
                    </span>
                  )}
                </button>
              ))}

              {col.leads.length < col.total && (
                <p className="px-4 py-4 t-label text-ink-3">
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

/**
 * Column value, adjusted by one card.
 *
 * `bigint` because the whole product holds money in fils and a column
 * total in a busy brokerage passes `Number.MAX_SAFE_INTEGER` — 9.007e15
 * fils is around AED 900 billion, which sounds unreachable until you
 * remember fils are two decimal places on top of a market that prices in
 * millions. Doing this in `number` would be right for years and then
 * quietly wrong.
 *
 * A lead with no budget contributes nothing rather than zero, so a
 * column of unpriced leads still reads "—" instead of "AED 0" — which an
 * owner would read as a pipeline worth nothing.
 */
function sum(total: bigint | null, delta: bigint | null, sign: 1 | -1 = 1): bigint | null {
  if (delta === null) return total;
  const next = (total ?? 0n) + (sign === 1 ? delta : -delta);
  return next < 0n ? 0n : next;
}
