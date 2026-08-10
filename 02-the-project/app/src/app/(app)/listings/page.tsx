"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { aedWhole } from "@/lib/money";
import { PublishCheck } from "./publish-check";
import { WhoWantsIt } from "./who-wants-it";

/**
 * Listings.
 *
 * Two things on this screen are the whole point, and both are silent
 * failures anywhere else: a Trakheesi permit about to lapse, and a
 * portal that has quietly refused a listing.
 */
/**
 * The Suspense boundary is required, not decorative.
 *
 * `useSearchParams` in a client component makes the route
 * unprerenderable, and Next 15 fails the production build rather than
 * shipping it — `npm run build` says so in as many words. Wrapping is
 * the fix; the fallback is what a reader sees for the instant before
 * hydration.
 */
export default function ListingsPage() {
  return (
    <Suspense fallback={<div className="max-w-[1080px] mx-auto px-6 pt-8"><RowsSkeleton /></div>}>
      <Listings />
    </Suspense>
  );
}

function Listings() {
  /**
   * The search this router always supported and nothing ever called.
   *
   * `listings.list` has taken a `search` input since it was written, and
   * no screen passed one — the light switch wired to nothing, again.
   * Global search now links here with `?q=DH-101`, so a property found
   * by asking a question in English lands on the list filtered to it.
   */
  const params = useSearchParams();
  const q = params.get("q")?.trim() ?? "";

  const { data, isLoading } = api.listings.list.useInfiniteQuery(
    { limit: 25, ...(q ? { search: q } : {}) },
    { getNextPageParam: (l) => l.nextCursor }
  );
  const { data: expiring , isError, refetch } = api.listings.expiringPermits.useQuery({ withinDays: 14 });
  const { data: rejections } = api.listings.rejections.useQuery();

  const rows = data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <div className="max-w-[1080px] mx-auto px-6 pb-24">
      <header className="pt-8 pb-1 flex items-end gap-5 flex-wrap">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
            Listings
          </span>
          <h1 className="font-sans text-[clamp(1.875rem,1.5rem+1.6vw,2.5rem)] text-ink -tracking-[0.01em] leading-none">
            {isLoading ? "—" : `${rows.length} live`}
          </h1>
        </div>

        {/* A filter with no way out of it is a screen that looks broken.
            Arriving from search has to be visibly a filtered view. */}
        {q && (
          <p className="text-sm text-ink-2">
            Filtered to &ldquo;{q}&rdquo;{" "}
            <Link href="/listings" className="btn-inline">Show all</Link>
          </p>
        )}
      </header>

      {/* The two failures that are otherwise invisible. Shown before the
          list, because a permit nobody sees becomes a permit that lapses. */}
      <div className="grid grid-cols-2 max-[720px]:grid-cols-1 border-t border-ink mt-6">
        <Alert
          count={expiring?.length ?? 0}
          title="Permits expiring inside 14 days"
          detail="An expired Trakheesi permit means the listing is pulled and you're advertising illegally until someone notices."
        />
        <Alert
          count={rejections?.length ?? 0}
          title="Rejected by a portal"
          detail="Rejections are silent from your side — the listing just never appears."
          last
        />
      </div>

      <div className="border-t border-ink mt-9">
        <div className="grid grid-cols-[1.6fr_140px_1fr_120px_auto] gap-4 py-3.5 px-1 border-b border-ink font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3 max-[820px]:hidden">
          <span>Property</span><span>Price</span><span>Portals</span><span>Permit</span><span />
        </div>

        {isLoading && <RowsSkeleton />}

        {rows.map((l) => (
          <div
            key={l.id}
            className="grid grid-cols-[1.6fr_140px_1fr_120px_auto] gap-4 items-center py-3.5 px-1 border-b border-rule hover:bg-raised max-[820px]:grid-cols-1 max-[820px]:gap-2"
          >
            <div>
              <div className="font-mono text-[11px] text-ink-3">{l.reference}</div>
              <div className="text-[15px] font-semibold text-ink mt-0.5">{l.title}</div>
            </div>

            <div className="font-mono text-[13px] text-ink">
              {/* Whole dirhams. `money.ts` says so in as many words —
                  "nobody says the fils on a flat, and `.00` on the end
                  of a seven-figure number reads as a system that has
                  not been thought about" — and this screen was the one
                  place still calling `aed()`. It was also overflowing:
                  "AED 11,500,000.00" does not fit a 92px column, so
                  every price wrapped with AED alone on the first line. */}
              {aedWhole(l.priceFils)}
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {l.publications.map((p) => (
                <span
                  key={p.channelId}
                  title={p.rejection ?? undefined}
                  className={cn(
                    "font-mono text-[9px] uppercase tracking-[0.08em] border rounded-[2px] px-1.5 py-0.5",
                    p.state === "PUBLISHED" && "text-success border-success",
                    p.state === "REJECTED" && "text-accent border-accent",
                    p.state === "PENDING" && "text-ink-3 border-rule border-dashed",
                    p.state === "FAILED" && "text-accent border-accent border-dashed"
                  )}
                >
                  {p.state === "PUBLISHED" ? "Live" : p.state.toLowerCase()}
                </span>
              ))}
            </div>

            <div
              className={cn(
                "font-mono text-[11px]",
                l.permitDaysLeft === null && "text-ink-3",
                l.permitDaysLeft !== null && l.permitDaysLeft < 0 && "text-accent font-medium",
                l.permitDaysLeft !== null && l.permitDaysLeft >= 0 && l.permitDaysLeft <= 14 && "text-accent",
                l.permitDaysLeft !== null && l.permitDaysLeft > 14 && "text-ink-2"
              )}
            >
              {permit(l.permitDaysLeft)}
            </div>

            <div className="justify-self-end flex gap-2 flex-wrap justify-end max-[820px]:justify-self-start max-[820px]:justify-start">
              <WhoWantsIt listingId={l.id} reference={l.reference} />
              <PublishCheck
                listingId={l.id}
                reference={l.reference}
                channelIds={l.publications.map((p) => p.channelId)}
              />
            </div>
          </div>
        ))}

        {!isLoading && rows.length === 0 && (
          <p className="py-8 text-sm text-ink-3">
            No listings yet. Import a feed or add one, and it appears here.
          </p>
        )}
      </div>
    </div>
  );
}

function Alert({ count, title, detail, last }: { count: number; title: string; detail: string; last?: boolean }) {
  return (
    <div className={cn("px-5 py-5 border-b border-rule", !last && "border-r border-rule max-[720px]:border-r-0")}>
      <div className={cn("font-sans font-semibold -tracking-[0.024em] text-[32px] leading-none", count ? "text-accent" : "text-ink-3")}>
        {count}
      </div>
      <div className="text-[15px] font-semibold text-ink mt-2">{title}</div>
      <p className="text-sm text-ink-2 mt-1 max-w-[44ch]">{detail}</p>
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div aria-busy>
      <span className="sr-only">Loading listings</span>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="py-4 border-b border-rule">
          <div className="h-2.5 w-20 bg-sunk rounded-sm" />
          <div className="h-3.5 w-64 bg-sunk rounded-sm mt-2" />
        </div>
      ))}
    </div>
  );
}

/** Days, said the way somebody would say them. */
function permit(days: number | null) {
  if (days === null) return "No permit";
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  return `${days} days left`;
}
