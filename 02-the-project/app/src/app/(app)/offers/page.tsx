"use client";

import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";

/**
 * Every live offer, across the brokerage.
 *
 * The screen a manager opens on a Monday and an agent opens when a
 * vendor rings. Sorted by what is about to expire rather than by value —
 * a 2.5 offer with 40 hours on it needs nothing today; a 1.9 with three
 * hours needs a call now.
 */
export default function Offers() {
  const { data, isLoading, isError, refetch, error } = api.offers.live.useQuery();

  if (isError) return <QueryError retry={() => void refetch()} what="live offers" error={error} />;
  if (isLoading) return <div className="max-w-[760px] mx-auto px-6 pt-10"><div className="h-40 bg-sunk rounded-sm" aria-busy /></div>;

  const rows = data ?? [];

  return (
    <div className="max-w-[760px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
          Live
        </span>
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.75rem)] text-ink -tracking-[0.026em] leading-none">
          {rows.length === 0 ? "No live offers." : `${rows.length} on the table.`}
        </h1>
        {rows.length > 0 && (
          <p className="text-sm text-ink-2 mt-3 max-w-[46ch]">
            Soonest to expire first. An offer that lapses while you were looking at a bigger
            one is a deal lost to a calendar.
          </p>
        )}
      </header>

      {rows.length === 0 ? (
        <p className="text-[17px] text-ink-2 max-w-[44ch]">
          When one comes in, record it here rather than in a message. The vendor will ask what
          has been on the table, and so will a manager in six months.
        </p>
      ) : (
        <div className="border-t border-ink">
          {rows.map((o) => (
            <a key={o.id} href={`/listings/${o.listingId}`}
               className="flex items-baseline gap-4 py-4 border-b border-rule no-underline">
              <span className="font-sans font-semibold text-[19px] text-ink tabular">{o.current}</span>
              <span className="text-sm text-ink-2">{o.reference}</span>
              <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.1em]"
                    style={{ color: o.hoursLeft != null && o.hoursLeft <= 24 ? "var(--danger-deep)" : "var(--tertiary)" }}>
                {o.hoursLeft == null ? "no expiry" : o.hoursLeft <= 0 ? "expired" : `${o.hoursLeft}h`}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
