"use client";

import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";

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

  if (isError) return <QueryError retry={() => void refetch()} what="your channels" error={error} />;
  if (isLoading) return <div className="max-w-[680px] mx-auto px-6 pt-10"><div className="h-52 bg-sunk rounded-sm" aria-busy /></div>;

  const rows = data?.channels ?? [];
  const quiet = rows.filter((c) => c.quiet);

  return (
    <div className="max-w-[680px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
          Channels
        </span>
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-ink -tracking-[0.026em] leading-none">
          {quiet.length === 0 ? "All connected." : `${quiet.length} gone quiet.`}
        </h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[48ch]">
          A feed stopping doesn't throw an error — it just sends fewer leads. This is where
          that becomes visible.
        </p>
      </header>

      <div className="border-t border-ink">
        {rows.map((c) => (
          <div key={c.id} className={cn("py-4 border-b border-rule",
            c.quiet && "border-l-[3px] border-l-accent-edge pl-4 -ml-4")}>
            <div className="flex items-baseline gap-3">
              <span className="text-[16px] text-ink font-semibold">{c.label}</span>
              <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.1em]"
                    style={{ color: c.quiet ? "var(--accent-type)" : "var(--ink-3)" }}>
                {c.lastAt ? c.lastAgo : "never"}
              </span>
            </div>
            {c.lastError && (
              <p className="text-sm text-ink-2 mt-1.5 max-w-[48ch] leading-snug">{c.lastError}</p>
            )}
            {c.quiet && !c.lastError && (
              <p className="text-sm text-ink-2 mt-1.5 max-w-[48ch] leading-snug">
                Nothing for {c.lastAgo}. Either the ads stopped or the connection did —
                check the ads first, it's usually that.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
