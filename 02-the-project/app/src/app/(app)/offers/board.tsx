"use client";

import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";

/**
 * What the vendor is choosing between.
 *
 * **Not sorted by price**, and that is the whole point of the screen.
 *
 * A cash offer with no conditions beats a higher mortgage offer that has
 * not been pre-approved, and every experienced agent knows it. Sorting
 * by the biggest number invites somebody to get that wrong on a Friday
 * afternoon in front of an owner.
 *
 * The number is still shown, large. The ranking just isn't it.
 */
export function OfferBoard({ listingId }: { listingId: string }) {
  const { data, isLoading, isError, refetch, error } =
    api.offers.onListing.useQuery({ listingId });

  if (isError) return <QueryError retry={() => void refetch()} what="the offers" error={error} />;
  if (isLoading) return <div className="h-40 bg-sunk rounded-sm" aria-busy />;
  if (!data?.length) {
    return (
      <div className="border-t border-rule py-8">
        <p className="text-[17px] text-ink">No offers yet.</p>
        <p className="text-sm text-ink-2 mt-1 max-w-[44ch]">
          When one comes in, record it here rather than in a message — the vendor will ask
          what has been on the table, and so will a manager in six months.
        </p>
      </div>
    );
  }

  const ranked = [...data].sort((a, b) => b.strength - a.strength);

  return (
    <div className="border-t border-ink">
      {ranked.map((o, i) => (
        <article key={o.id} className="py-5 border-b border-rule">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-sans font-semibold text-[26px] text-ink -tracking-[0.02em] tabular">
              {o.current}
            </span>
            {o.current !== o.opened && (
              // Movement matters more than the current figure. A buyer
              // who has come up twice has room; one who opened and stood
              // still does not.
              <span className="font-mono text-[11px] text-ink-3">
                opened {o.opened} · moved {o.moves}×
              </span>
            )}
            {i === 0 && ranked.length > 1 && (
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-accent-deep font-semibold">
                Strongest, not highest
              </span>
            )}
          </div>

          <div className="flex gap-2 mt-2.5 flex-wrap">
            <Tag good={o.financing === "CASH"}>{o.financing.toLowerCase()}</Tag>
            {o.financing === "MORTGAGE" && (
              <Tag good={o.preApproved}>
                {o.preApproved ? "pre-approved" : "not pre-approved"}
              </Tag>
            )}
            {o.conditions && <Tag>conditional</Tag>}
            {o.expiresAt && <Expiry at={o.expiresAt} />}
          </div>

          {o.conditions && (
            <p className="text-sm text-ink-2 mt-2.5 pl-3 border-l-2 border-rule max-w-[52ch]">
              {o.conditions}
            </p>
          )}

          {o.history.length > 0 && (
            <details className="mt-3">
              <summary className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3 cursor-pointer min-h-11 flex items-center">
                {o.history.length} exchange{o.history.length === 1 ? "" : "s"}
              </summary>
              <ol className="mt-2 space-y-1.5">
                {o.history.map((h, j) => (
                  <li key={j} className="text-sm text-ink-2">
                    <span className="font-mono text-[11px] text-ink-3 uppercase mr-2">
                      {h.by.toLowerCase()}
                    </span>
                    {h.amount ?? h.kind.toLowerCase()}
                    {h.note && <span className="text-ink-3"> — {h.note}</span>}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </article>
      ))}

      <p className="text-sm text-ink-3 mt-5 max-w-[52ch]">
        Ranked on whether the buyer can actually complete, not on the number. Cash with no
        conditions beats a higher offer subject to a mortgage nobody has applied for.
      </p>
    </div>
  );
}

function Tag({ children, good }: { children: React.ReactNode; good?: boolean }) {
  return (
    <span className={cn(
      "font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 border rounded-[3px]",
      good ? "border-accent text-accent font-semibold" : "border-rule text-ink-3"
    )}>
      {children}
    </span>
  );
}

function Expiry({ at }: { at: Date | string }) {
  const hours = Math.round((new Date(at).getTime() - Date.now()) / 3_600_000);
  const soon = hours <= 24;
  return (
    <span className={cn(
      "font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 border rounded-[3px]",
      soon ? "border-danger-deep text-danger-deep font-semibold" : "border-rule text-ink-3"
    )}>
      {hours <= 0 ? "expired" : `${hours}h left`}
    </span>
  );
}
