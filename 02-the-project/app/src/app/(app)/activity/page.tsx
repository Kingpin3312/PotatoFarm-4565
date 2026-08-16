"use client";

import { api } from "@/lib/trpc";
import { cn } from "@/lib/cn";
import { QueryError } from "@/components/ui/query-state";

/**
 * What the assistant did, and the button that reverses it.
 *
 * `AiAction` carried request, interpretation, before, after, who
 * approved and how to undo — and had one writer and no reader. A record
 * nobody can open is not an audit trail.
 *
 * This is the screen that decides whether a brokerage ever moves off
 * Copilot. The argument for autonomy is never "trust it". It is: here is
 * everything it did, why it did it, and how to take it back.
 */
export default function Activity() {
  const utils = api.useUtils();
  const { data: settings } = api.activity.autonomy.useQuery();
  const { data: actions, isLoading, isError, refetch, error } = api.activity.mine.useQuery();

  const setMode = api.activity.setAutonomy.useMutation({
    onSettled: () => void utils.activity.autonomy.invalidate(),
  });
  const undo = api.activity.undo.useMutation({
    onSettled: () => {
      void utils.activity.mine.invalidate();
      void utils.today.brief.invalidate();
    },
  });

  return (
    <div className="mx-auto max-w-[680px] px-6 pb-28">
      <header className="pt-10 pb-6">
        <h1 className="font-sans text-[clamp(2rem,1.5rem+2vw,2.5rem)] font-semibold leading-none -tracking-[0.026em] text-ink">
          What it did
        </h1>
        <p className="mt-3 max-w-[48ch] text-[15px] leading-snug text-ink-2">
          Everything the assistant has done on your behalf, why it did it, and how to
          take it back.
        </p>
      </header>

      {settings && (
        <section className="border-t border-rule pt-6">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            How much it may do
          </h2>

          <div className="mt-3 grid gap-2">
            {settings.options.map((o) => {
              const on = settings.mode === o.mode;
              return (
                <button
                  key={o.mode}
                  onClick={() => setMode.mutate({ mode: o.mode })}
                  disabled={setMode.isPending}
                  aria-pressed={on}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-left disabled:opacity-60",
                    on ? "border-ink bg-sunk" : "border-rule hover:border-rule-strong"
                  )}
                >
                  <span className="flex items-baseline gap-2">
                    <span className="text-[16px] font-semibold text-ink">{o.label}</span>
                    {/* In words. The border alone is not a signal. */}
                    {on && (
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent-deep">
                        On
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block max-w-[46ch] text-sm leading-snug text-ink-2">
                    {o.blurb}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Stop everything outranks this setting, and saying so is the
              difference between "Autopilot is on and nothing happens"
              and an agent understanding why.

              Named the way the button in Settings names it. `claims.py`
              fails the build when one concept goes by two names across
              surfaces, and it caught this comment using the other one —
              twice, because the correction mentioned it. */}
          {!settings.assistantEnabled && (
            <p className="mt-3 max-w-[48ch] text-sm leading-snug text-ink-2">
              The assistant is stopped, so nothing runs unattended whatever is chosen
              here. You will still be told what to do.
            </p>
          )}

          <p className="mt-3 max-w-[48ch] text-sm leading-snug text-ink-3">
            Nothing reaches a client without you, at any setting. Even on Autopilot it
            prepares the message and waits.
          </p>
        </section>
      )}

      <section className="mt-10 border-t border-rule pt-6">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
          Recently
        </h2>

        {isLoading && <p className="mt-3 text-sm text-ink-3">Loading…</p>}

        {isError && (
          <div className="mt-3">
            <QueryError retry={() => void refetch()} what="what it has been doing" error={error} />
          </div>
        )}

        {actions?.length === 0 && (
          <p className="mt-3 max-w-[46ch] text-[15px] leading-snug text-ink-2">
            Nothing yet. This fills up as the assistant does things — and on Copilot it
            does very little, which is the point of starting there.
          </p>
        )}

        {actions && actions.length > 0 && (
          <ul className="mt-2">
            {actions.map((a) => (
              <li key={a.id} className="border-b border-rule py-3.5">
                <div className="flex items-baseline gap-3">
                  <span
                    className={cn(
                      "w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.1em]",
                      a.undoneAt ? "text-ink-3"
                        : a.outcome === "DONE" ? "text-ink"
                        : a.outcome === "REFUSED" ? "text-accent-deep" : "text-ink-3"
                    )}
                  >
                    {a.undoneAt ? "undone" : a.levelLabel}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-[15px] leading-snug",
                        a.undoneAt ? "text-ink-3 line-through" : "text-ink"
                      )}
                    >
                      {headline(a)}
                    </p>
                    {/* Why, in its own words. Without this the log is a
                        list of things that happened to you. */}
                    {a.interpretation && (
                      <p className="mt-0.5 max-w-[48ch] text-sm leading-snug text-ink-2">
                        {a.interpretation}
                      </p>
                    )}
                    {a.error && (
                      <p className="mt-0.5 max-w-[48ch] text-sm leading-snug text-accent-deep">
                        {a.error}
                      </p>
                    )}
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                      {a.origin} · {when(a.createdAt)}
                    </p>
                  </div>

                  {a.undoable && (
                    <button
                      onClick={() => undo.mutate({ id: a.id })}
                      disabled={undo.isPending}
                      className="btn-inline min-h-11 shrink-0 disabled:opacity-50"
                    >
                      Undo
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * What happened, said as a thing rather than a row.
 *
 * The origin is a machine name and belongs underneath; the headline has
 * to read as English to somebody who did not write the code.
 */
function headline(a: {
  origin: string;
  action: string | null;
  entity: string | null;
  after: unknown;
}): string {
  const after = (a.after ?? {}) as Record<string, unknown>;

  if (a.origin === "voice.transcribe") return "Turned your voice note into text";
  if (a.entity === "FollowUp") {
    const t = typeof after.title === "string" ? after.title : null;
    return t ? `Set you a reminder — ${t}` : "Set you a reminder";
  }
  if (a.action) return a.action.toLowerCase().replace(/_/g, " ");
  return a.origin;
}

function when(at: Date | string) {
  const d = new Date(at);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  if (mins < 10080) return `${Math.round(mins / 1440)}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
