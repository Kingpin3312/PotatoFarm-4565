"use client";

import { useState } from "react";

import Link from "next/link";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/cn";
import { aedShort } from "@/lib/money";
import { sentence as label } from "@/lib/sentence";
import { Ask } from "../ask/ask-box";
import { QueryError } from "@/components/ui/query-state";

/**
 * The front door.
 *
 * `/` redirected to the inbox, which is a conventional-CRM answer to
 * "what should I do now": here are four hundred things, you decide. The
 * whole premise of this product is that it should have an opinion.
 *
 * Two elements and nothing else. **What can I do for you** at the top,
 * because the fastest path through this product is a sentence. Then the
 * five things that matter, each with the reason beside it.
 *
 * The restraint is the design. Every card added here is one an agent
 * scrolls past on a phone in a car park, and the thing they came for
 * moves further down.
 */
export default function Today() {
  const { data, isLoading, isError, refetch, error } = api.today.brief.useQuery();
  const utils = api.useUtils();

  /**
   * The row leaves before the server answers.
   *
   * This is the screen an agent works standing in a lobby on a 4G
   * connection, and "Done" is the action they press most in the day.
   * Waiting for a round trip before the row moves is the difference
   * between a product that feels instant and one that feels like a web
   * page, and nothing about the outcome is in doubt — the row is theirs
   * and the server is being told, not asked.
   *
   * **What makes it safe rather than a lie is the failure path.** An
   * optimistic update that silently reverts is worse than a spinner: the
   * row reappears with no explanation and the agent has no idea whether
   * the work was recorded. So a failure puts the row back *and* says so.
   *
   * `cancel()` first, or an in-flight refetch that started before the
   * press can land afterwards and put the row back on its own.
   */
  const [failed, setFailed] = useState<string | null>(null);

  /** The snapshot passed from onMutate to onError, named so it types. */
  type Rollback = { previous: ReturnType<typeof utils.today.brief.getData> };

  const optimistic = {
    onMutate: async ({ id }: { id: string }): Promise<Rollback> => {
      setFailed(null);
      await utils.today.brief.cancel();
      const previous = utils.today.brief.getData();
      utils.today.brief.setData(undefined, (old) =>
        old ? { ...old, actions: old.actions.filter((a) => a.id !== id) } : old
      );
      return { previous };
    },
    onError: (err: { message: string }, _vars: { id: string }, ctx: Rollback | undefined) => {
      if (ctx?.previous) utils.today.brief.setData(undefined, ctx.previous);
      setFailed(err.message || "That did not save. It is back on your list.");
    },
    onSettled: () => void utils.today.brief.invalidate(),
  };

  const dismiss = api.today.dismiss.useMutation(optimistic);
  const act = api.today.act.useMutation(optimistic);

  return (
    <div className="mx-auto max-w-[680px] px-6 pb-28">
      <header className="pt-10 pb-6">
        <h1 className="font-sans text-page font-semibold text-ink">
          {/* "day" while it loads, not a guess at "morning". It is
              correct English at any hour, so the one-word settle when
              the query lands is a refinement rather than a correction —
              and being greeted with the wrong time of day is the sort of
              small wrongness that makes a product feel careless. */}
          Good {data?.partOfDay ?? "day"}
        </h1>
        {data && <Summary counts={data.counts} pipelineFils={data.pipelineFils} />}
      </header>

      {/* The command line. Same component the Ask screen uses — one
          natural-language surface, not two that drift apart. */}
      <Ask compact />

      {isLoading && (
        <p className="mt-10 text-sm text-ink-3">Working out what matters…</p>
      )}

      {isError && (
        <div className="mt-10">
          <QueryError retry={() => void refetch()} what="today" error={error} />
        </div>
      )}

      {data && (
        <>
          {/* The revert, said out loud.
              role="alert" rather than status: the row has just jumped
              back onto a list the agent thought they had cleared, and
              that is an interruption, not an update. */}
          {failed && (
            <p role="alert" className="mt-6 text-sm text-danger max-w-[52ch]">
              {failed}
            </p>
          )}
          <Actions
            actions={data.actions}
            onAct={(id) => act.mutate({ id })}
            onDismiss={(id) => dismiss.mutate({ id })}
          />
          <Viewings viewings={data.viewings} />
        </>
      )}
    </div>
  );
}

/**
 * The numbers, in a sentence rather than a row of tiles.
 *
 * Four stat cards is the house style of every CRM dashboard ever
 * shipped and it is the reason none of them are read. A line of prose
 * with the figures in it is shorter, scans faster, and does not pretend
 * that "7" is an insight.
 */
function Summary({
  counts, pipelineFils,
}: {
  counts: { hot: number; waiting: number; followUpsDue: number; viewingsToday: number };
  pipelineFils: bigint;
}) {
  const bits: string[] = [];
  if (counts.viewingsToday) bits.push(`${counts.viewingsToday} viewing${counts.viewingsToday === 1 ? "" : "s"} today`);
  if (counts.waiting) bits.push(`${counts.waiting} waiting on a reply`);
  if (counts.followUpsDue) bits.push(`${counts.followUpsDue} follow-up${counts.followUpsDue === 1 ? "" : "s"} due`);
  if (counts.hot) bits.push(`${counts.hot} running hot`);

  if (bits.length === 0) {
    return (
      <p className="mt-3 max-w-[46ch] text-ui leading-snug text-ink-2">
        Nothing is waiting on you and nothing is overdue.
      </p>
    );
  }

  return (
    <p className="mt-3 max-w-[52ch] text-ui leading-snug text-ink-2">
      {sentence(bits)}
      {pipelineFils > 0n && (
        <>
          {" "}
          <span className="text-ink">{aedShort(pipelineFils)}</span> of that is live.
        </>
      )}
    </p>
  );
}

/**
 * The shorter word for each action.
 *
 * Written in lower case when the label class uppercased everything, so
 * the map was really "CALL -> call -> CALL". With the transform gone it
 * rendered `call`, and a lookup table is a quieter place for that fault
 * to hide than a `.toLowerCase()` call.
 */
const LABEL: Record<string, string> = {
  CALL: "Call",
  SEND_PROPERTY: "Send",
  FOLLOW_UP: "Follow up",
  REQUEST_DOCUMENTS: "Documents",
  PREPARE_CMA: "Valuation",
  BOOK_VIEWING: "Viewing",
  ASK_FOR_LISTING: "Listing",
  REACTIVATE: "Reactivate",
  INTRODUCE_FINANCE: "Finance",
  NEGOTIATE: "Negotiate",
  RECORD_OUTCOME: "Log outcome",
};

function Actions({
  actions, onAct, onDismiss,
}: {
  actions: {
    id: string; action: string; headline: string; reason: string;
    priority: number; valueFils: bigint | null; leadId: string | null;
  }[];
  onAct: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  /**
   * An empty list here is good news, and has to read like it.
   *
   * "No recommendations" tells a new agent nothing about whether that is
   * normal, broken, or a system that has not run yet. The sweep runs
   * overnight, so on day one this is genuinely empty and saying so is
   * the honest thing.
   */
  if (actions.length === 0) {
    return (
      <section className="mt-10 border-t border-rule pt-6">
        <h2 className="t-label text-ink-3">
          Today
        </h2>
        <p className="mt-3 max-w-[46ch] text-ui leading-snug text-ink-2">
          Nothing needs you right now. This fills up overnight as your leads move
          — and stays empty when there is genuinely nothing worth doing, which is
          the point of it.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-10 border-t border-rule pt-6">
      <h2 className="t-label text-ink-3">
        Today · {actions.length}
      </h2>

      <ol className="mt-2">
        {actions.map((a, i) => (
          <li key={a.id} className="border-b border-rule py-4">
            <div className="flex items-baseline gap-3">
              {/* Ordinal, not a priority score. A number to two decimal
                  places invites an argument about the second one. */}
              <span className="w-4 shrink-0 font-mono text-label tabular text-ink-3">
                {i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-control leading-snug text-ink">
                  {a.leadId ? (
                    <Link href={`/leads?open=${a.leadId}`} className="text-ink no-underline hover:underline">
                      {a.headline}
                    </Link>
                  ) : a.headline}
                </p>

                {/* Always shown. An instruction with no reason is one an
                    agent learns to ignore, and the reason is also how
                    they catch it being wrong. */}
                <p className="mt-1 max-w-[48ch] text-sm leading-snug text-ink-2">
                  {a.reason}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="t-label text-ink-3">
                    {LABEL[a.action] ?? label(a.action)}
                  </span>
                  {a.valueFils !== null && a.valueFils > 0n && (
                    <span className="t-label tabular text-ink-3">
                      {aedShort(a.valueFils)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Done and Not now are opposite signals, so they are two
                buttons. Collapsing them into one means the engine can
                never learn from either. */}
            <div className="mt-3 flex gap-2 ps-7">
              <button
                onClick={() => onAct(a.id)}
                className="btn-inline min-h-11 disabled:opacity-50"
              >
                Done
              </button>
              <button
                onClick={() => onDismiss(a.id)}
                className={cn(
                  "min-h-11 px-2 t-label",
                  "text-ink-3 hover:text-ink disabled:opacity-50"
                )}
              >
                Not now
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Viewings({
  viewings,
}: {
  viewings: {
    id: string; scheduledAt: Date;
    lead: { name: string | null } | null;
    listing: { building: string | null; community: string | null } | null;
  }[];
}) {
  if (viewings.length === 0) return null;

  return (
    <section className="mt-10 border-t border-rule pt-6">
      <h2 className="t-label text-ink-3">
        Your day
      </h2>
      <ul className="mt-2">
        {viewings.map((v) => (
          <li key={v.id} className="flex items-baseline gap-3 border-b border-rule py-3">
            <span className="w-14 shrink-0 font-mono text-label tabular text-ink">
              {new Date(v.scheduledAt).toLocaleTimeString("en-GB", {
                hour: "2-digit", minute: "2-digit",
              })}
            </span>
            <span className="flex-1 text-ui leading-snug text-ink">
              {v.lead?.name ?? "Someone"}
              {v.listing?.building && (
                <span className="text-ink-2"> · {v.listing.building}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "a, b and c" — read aloud as often as read. */
function sentence(parts: string[]): string {
  const p = parts.filter(Boolean);
  if (p.length === 0) return "";
  const head = p[0]!;
  const first = head.charAt(0).toUpperCase() + head.slice(1);
  const rest = p.slice(1);
  if (rest.length === 0) return `${first}.`;
  if (rest.length === 1) return `${first} and ${rest[0]}.`;
  return `${first}, ${rest.slice(0, -1).join(", ")} and ${rest[rest.length - 1]}.`;
}
