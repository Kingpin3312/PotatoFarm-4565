"use client";

import { api } from "@/lib/trpc";
import { aed } from "@/lib/money";
import { QueryError } from "@/components/ui/query-state";

/**
 * What an agent is owed.
 *
 * The first question in every demo, and until this screen existed the
 * answer was no. Three numbers, in the order they care about them, and
 * nothing else above the fold.
 */
export default function CommissionPage() {
  const { data, isLoading , isError, refetch } = api.commission.mine.useQuery({});
  const { data: tier } = api.commission.myTier.useQuery();

  if (isLoading) return <Skeleton />;
  if (isError) return <QueryError retry={() => void refetch()} what="this" />;
  if (!data) return null;

  return (
    <div className="max-w-[860px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
          Commission
        </span>
        <h1 className="font-sans text-[clamp(2rem,1.5rem+2vw,2.75rem)] text-ink -tracking-[0.01em] leading-none">
          What you&rsquo;re owed
        </h1>
      </header>

      <div className="grid grid-cols-3 max-[640px]:grid-cols-1 border-t border-ink mt-8">
        <Figure label="Paid" value={data.paid} />
        {/* The one that matters. Earned, confirmed received by the
            brokerage, and not yet in their account. */}
        <Figure label="Owed to you" value={data.owed} highlight />
        <Figure label="Forecast" value={data.forecast} muted />
      </div>

      {tier && (
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3 mt-5">
          {tier.earnedThisYear} this year · your share is {(tier.shareBp / 100).toFixed(0)}%
        </p>
      )}

      <h2 className="font-sans font-semibold -tracking-[0.024em] text-[22px] text-ink mt-12 mb-1">Every deal</h2>
      <div className="border-t border-ink mt-4">
        {data.rows.length === 0 && (
          <p className="py-6 text-sm text-ink-3">
            Nothing yet. Deals appear here the moment a commission is recorded against them.
          </p>
        )}
        {data.rows.map((r, i) => (
          <div key={i} className="flex gap-4 items-baseline py-4 border-b border-rule flex-wrap">
            <span className="font-mono text-[13px] text-ink-3 min-w-[110px]">{r.deal}</span>
            <span className="text-[15px] text-ink font-semibold">{r.amount}</span>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
              {r.state}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Figure({ label, value, highlight, muted }: { label: string; value: string; highlight?: boolean; muted?: boolean }) {
  return (
    <div className="px-5 py-5 border-r border-b border-rule last:border-r-0 max-[640px]:border-r-0">
      <div className={`font-sans font-semibold -tracking-[0.024em] text-[28px] leading-none ${highlight ? "text-accent" : muted ? "text-ink-3" : "text-ink"}`}>
        {value}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3 mt-2">{label}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="max-w-[860px] mx-auto px-6 pt-10" aria-busy>
      <span className="sr-only">Loading your commission</span>
      <div className="h-10 w-64 bg-sunk rounded-sm" />
      <div className="grid grid-cols-3 gap-px mt-8">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-sunk rounded-sm" />)}
      </div>
    </div>
  );
}
