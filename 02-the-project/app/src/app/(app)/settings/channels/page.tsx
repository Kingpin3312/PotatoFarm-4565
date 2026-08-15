"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";
import { ConnectChannel } from "./connect";

/**
 * Channels.
 *
 * Where every lead comes from, and where you find out one stopped.
 *
 * A portal going quiet is silent by nature — no error, just fewer
 * leads, and nobody notices for a fortnight. This screen exists mainly
 * to make silence visible.
 */
export default function Channels() {
  const { data, isLoading, isError, refetch, error } = api.channels.health.useQuery();
  /**
   * `list`, alongside `health`, because they answer different questions.
   *
   * `health` is "what has gone quiet" and shows only active channels —
   * correct for an alarm, and useless for settings, where a
   * disconnected channel has to be visible or it cannot be reconnected.
   */
  const { data: all } = api.channels.list.useQuery();
  const utils = api.useUtils();
  const [actionError, setActionError] = useState<string | null>(null);
  const setActive = api.channels.setActive.useMutation({
    onSuccess: () => {
      void utils.channels.list.invalidate();
      void utils.channels.health.invalidate();
    },
    // Reconnecting can legitimately fail: the identifier may have been
    // claimed by another brokerage while this one had it switched off.
    onError: (e) => setActionError(e.message),
  });

  if (isError) return <QueryError retry={() => void refetch()} what="your channels" error={error} />;
  if (isLoading) return <div className="max-w-[680px] mx-auto px-6 pt-10"><div className="h-52 bg-sunk rounded-sm" aria-busy /></div>;

  const rows = data?.channels ?? [];
  const quiet = rows.filter((c) => c.quiet);
  // `canSend` is null for anything that is not WhatsApp — only WhatsApp
  // sends from this product — so `=== false` rather than `!c.canSend`,
  // which would count every portal as unable to reply.
  const halfConnected = (all ?? []).filter((c) => c.active && c.canSend === false).length;

  return (
    <div className="max-w-[680px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
          Channels
        </span>
        {/* "All connected" is true of zero channels only in the way
            that every statement is true of an empty set. On a brokerage
            that had connected nothing — which was every brokerage, since
            nothing could create a channel — this screen reported
            everything was fine while inbound WhatsApp was being dropped
            as coming from an unknown number. Three states, not two. */}
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-accent-type -tracking-[0.026em] leading-none">
          {all && all.length === 0
            ? "Nothing connected."
            : quiet.length > 0
              ? `${quiet.length} gone quiet.`
              : halfConnected > 0
                // A number that receives and cannot reply is not
                // "connected", and this is the heading an owner reads
                // before deciding whether to trust the inbox.
                ? `${halfConnected} can't reply yet.`
                : "All connected."}
        </h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[48ch]">
          A feed stopping doesn&rsquo;t throw an error — it just sends fewer leads. This is where
          that becomes visible.
        </p>
        <div className="mt-5"><ConnectChannel /></div>
      </header>

      {actionError && (
        <p role="alert" className="mb-4 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">
          {actionError}
        </p>
      )}

      {/* Nothing connected at all is the state every brokerage starts
          in, and it is not "all connected" — which is what this screen
          said, above an empty list, while every inbound WhatsApp message
          was being dropped as coming from an unknown number. */}
      {all && all.length === 0 && (
        <div className="border-t border-ink py-10 max-w-[48ch]">
          <p className="text-[17px] font-semibold text-ink">Nothing is connected yet.</p>
          <p className="text-sm text-ink-2 mt-2">
            Until a WhatsApp number is connected here, messages sent to it do not reach
            this brokerage at all — there is nothing to match them against. Connect the
            number first; replying needs one more step and the screen will walk you through it.
          </p>
        </div>
      )}

      <div className="border-t border-ink">
        {(all ?? []).map((ch) => {
          // `health` only carries active channels, so a disconnected one
          // has no entry there. Absent means "no silence to report",
          // never "silent".
          const c = rows.find((r) => r.id === ch.id);
          const quiet = c?.quiet ?? false;
          return (
          <div key={ch.id} className={cn("py-4 border-b border-rule",
            quiet && "border-l-[3px] border-l-accent-edge pl-4 -ml-4",
            !ch.active && "opacity-60")}>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-[16px] text-ink font-semibold">{ch.label}</span>

              {/* The state in words, not only in colour — a rule
                  ux-audit.py checks and one that matters most here,
                  where the difference between "receiving" and
                  "receiving but cannot reply" is the whole message. */}
              {!ch.active ? (
                <Tag>Disconnected</Tag>
              ) : ch.canSend === false ? (
                <Tag warn>Receives only</Tag>
              ) : null}

              <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.1em]"
                    style={{ color: quiet ? "var(--accent-type)" : "var(--ink-3)" }}>
                {c?.lastAt ? c.lastAgo : "never"}
              </span>
            </div>

            <p className="font-mono text-[11px] text-ink-3 mt-1">
              {ch.identifierLabel}: {ch.identifier}
            </p>

            {/* The half-connected state, spelled out where it is
                discovered rather than at the moment an agent presses
                send to a real customer. */}
            {ch.active && ch.canSend === false && (
              /* Still the state worth spelling out where it is
                 discovered rather than at the moment an agent presses
                 send to a real customer. What changed is the remedy: it
                 used to be an environment variable and a redeploy. */
              <div className="mt-2 border border-rule rounded-[3px] p-3 bg-ground">
                <p className="text-sm text-ink-2 leading-snug max-w-[52ch]">
                  Messages to this number arrive. Replies will not send until its access
                  token is added — reconnect it with the token to hand.
                </p>
              </div>
            )}
            {c?.lastError && (
              <p className="text-sm text-ink-2 mt-1.5 max-w-[48ch] leading-snug">{c.lastError}</p>
            )}
            {quiet && !c?.lastError && (
              <p className="text-sm text-ink-2 mt-1.5 max-w-[48ch] leading-snug">
                Nothing for {c?.lastAgo}. Either the ads stopped or the connection did —
                check the ads first, it&rsquo;s usually that.
              </p>
            )}

            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setActive.mutate({ id: ch.id, active: !ch.active });
                }}
                className="min-h-11 text-[14px] bg-transparent border-0 p-0 text-accent-deep underline cursor-pointer"
              >
                {ch.active ? "Disconnect" : "Reconnect"}
              </button>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

/** A state word. Never colour alone — see ux-audit.py. */
function Tag({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <span className={cn(
      "font-mono text-[9px] uppercase tracking-[0.1em] border rounded-[2px] px-1.5 py-0.5",
      warn ? "text-accent-deep border-accent-edge" : "text-ink-3 border-rule",
    )}>
      {children}
    </span>
  );
}
