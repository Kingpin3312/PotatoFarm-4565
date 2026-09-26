"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { aedWhole } from "@/lib/money";
import { PublishCheck } from "./publish-check";
import { AttachOwner } from "./attach-owner";
import { Lease } from "./lease";
import { WhoWantsIt } from "./who-wants-it";
import { AddProperty } from "./add-property";
import { EditListing } from "./edit-listing";
import { CheckCopy } from "./check-copy";
import { download } from "@/lib/download";
import { TYPE_OPTIONS } from "./add-property";

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
  // Which row has its owner panel open. One at a time: the panel is a
  // block, and two of them open in a table turns the list into a form.
  const [ownerFor, setOwnerFor] = useState<string | null>(null);

  /**
   * Filters, applied by the server. The screen asked for twenty-five and
   * never for more — `fetchNextPage` was not called anywhere — so a
   * brokerage with two hundred properties saw an eighth of its stock.
   */
  const [f, setF] = useState<ListingFilters>({ status: "AVAILABLE" });
  const [typed, setTyped] = useState(q);
  const [sort, setSort] = useState<"updated" | "newest" | "price_asc" | "price_desc">("updated");
  const [showFilters, setShowFilters] = useState(false);
  useEffect(() => { setTyped(q); }, [q]);
  useEffect(() => {
    const next = typed.trim() || undefined;
    const t = setTimeout(() => setF((x) => (x.search === next ? x : { ...x, search: next })), 300);
    return () => clearTimeout(t);
  }, [typed]);
  // Arriving from search with a reference means that listing, whatever
  // its status — a sold one is still the one they asked for.
  useEffect(() => { if (q) setF((x) => ({ ...x, status: undefined })); }, [q]);
  const filters = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== "")) as ListingFilters;

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, isPlaceholderData } =
    api.listings.list.useInfiniteQuery(
      { ...filters, sort, limit: 50 },
      { getNextPageParam: (l) => l.nextCursor ?? undefined, placeholderData: (prev) => prev },
    );
  const { data: counted } = api.listings.count.useQuery(filters, { placeholderData: (prev) => prev });
  const { data: mine } = api.org.mine.useQuery();
  const manager = ["MANAGER", "ADMIN", "OWNER"].includes(mine?.find((o) => o.active)?.role ?? "");
  const { data: team } = api.org.members.useQuery(undefined, { enabled: manager });
  const { data: everything } = api.listings.count.useQuery({});
  const exporter = api.listings.exportCsv.useMutation({ onSuccess: (r) => download(r.filename, r.csv) });

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const set = (patch: Partial<ListingFilters>) => setF((x) => ({ ...x, ...patch }));
  const aedIn = (v: string) => {
    const n = Number(v.replace(/[,\s]/g, "").replace(/m$/i, "e6").replace(/k$/i, "e3"));
    return v.trim() && Number.isFinite(n) ? Math.round(n) : undefined;
  };
  const { data: expiring , isError, refetch } = api.listings.expiringPermits.useQuery({ withinDays: 14 });
  const { data: rejections } = api.listings.rejections.useQuery();

  const rows = data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <div className="max-w-[1080px] mx-auto px-6 pb-24">
      <header className="pt-8 pb-1 flex items-end gap-5 flex-wrap">
        <div>
          <span className="t-label text-ink-3 block mb-3">
            Listings
          </span>
          {/* The count of what matches, not of what is loaded, and "live"
              only for what is available — it said "25 live" over a page
              of drafts and sold stock. */}
          <h1 className="font-sans text-page text-ink" data-total={counted?.total ?? ""}>
            {counted === undefined ? "—"
              : f.status === "AVAILABLE" ? `${counted.total.toLocaleString()} available`
              : `${counted.total.toLocaleString()} ${counted.total === 1 ? "property" : "properties"}`}
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

        {/* `ms-auto` so it sits at the end of the header on a desktop
            and wraps under the heading on a phone, where the flex-wrap
            above puts it on its own line at full reach of a thumb. */}
        <div className="ms-auto flex items-center gap-4">
          {manager && (
            <button type="button" className="btn-inline min-h-11" disabled={exporter.isPending}
              onClick={() => exporter.mutate(filters)}>
              {exporter.isPending ? "Exporting…" : "Export"}
            </button>
          )}
          <AddProperty />
        </div>
      </header>

      {/* The two failures that are otherwise invisible. Shown before the
          list, because a permit nobody sees becomes a permit that lapses. */}
      <div className="grid grid-cols-2 max-[720px]:grid-cols-1 border-t border-rule-strong mt-6">
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

      <div className="mt-6 min-[900px]:hidden">
        <button type="button" className="btn-inline min-h-11" aria-expanded={showFilters}
        aria-controls="listing-filters" onClick={() => setShowFilters((v) => !v)}>
        {showFilters ? "Hide filters" : "Filters"}
      </button></div>
      <div id="listing-filters" role="search"
        className={cn("gap-3 mt-4 grid-cols-2 min-[900px]:grid min-[900px]:mt-8 min-[900px]:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]",
          showFilters ? "grid" : "hidden")}>
        <label className="flex flex-col gap-1 col-span-2 min-[900px]:col-span-1">
          <span className="t-label text-ink-3">Reference, name or building</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DH-101, Marina Gate" className={INPUT} />
        </label>
        <Pick label="Status" value={f.status ?? ""} onChange={(v) => set({ status: (v || undefined) as ListingFilters["status"] })}
          options={[["", "Any"], ["AVAILABLE", "Available"], ["UNDER_OFFER", "Under offer"], ["DRAFT", "Draft"], ["SOLD", "Sold"], ["LET", "Let"], ["WITHDRAWN", "Withdrawn"]]} />
        <Pick label="Sale or rent" value={f.purpose ?? ""} onChange={(v) => set({ purpose: (v || undefined) as "SALE" | "RENT" | undefined })}
          options={[["", "Either"], ["SALE", "For sale"], ["RENT", "To rent"]]} />
        <label className="flex flex-col gap-1 min-w-0">
          <span className="t-label text-ink-3">Area</span>
          <input defaultValue="" placeholder="Marina" className={INPUT}
            onBlur={(e) => set({ community: e.target.value.trim() || undefined })}
            onKeyDown={(e) => { if (e.key === "Enter") set({ community: (e.target as HTMLInputElement).value.trim() || undefined }); }} />
        </label>
        <Pick label="Type" value={f.propertyType ?? ""} onChange={(v) => set({ propertyType: (v || undefined) as ListingFilters["propertyType"] })}
          options={[["", "Any"], ...TYPE_OPTIONS.slice(1)]} />
        <Pick label="Ready or off-plan" value={f.completion ?? ""} onChange={(v) => set({ completion: (v || undefined) as ListingFilters["completion"] })}
          options={[["", "Either"], ["READY", "Ready"], ["OFF_PLAN", "Off-plan"]]} />
        <Pick label="Bedrooms" value={f.bedrooms == null ? "" : String(f.bedrooms)}
          onChange={(v) => set({ bedrooms: v === "" ? undefined : Number(v) })}
          options={[["", "Any"], ["0", "Studio +"], ["1", "1 +"], ["2", "2 +"], ["3", "3 +"], ["4", "4 +"], ["5", "5 +"]]} />
        <label className="flex flex-col gap-1 min-w-0">
          <span className="t-label text-ink-3">Price from (AED)</span>
          <input inputMode="decimal" placeholder="1m" className={INPUT}
            onBlur={(e) => set({ minPriceAed: aedIn(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="t-label text-ink-3">Price up to (AED)</span>
          <input inputMode="decimal" placeholder="3m" className={INPUT}
            onBlur={(e) => set({ maxPriceAed: aedIn(e.target.value) })} />
        </label>
        {team && (
          <Pick label="Agent" value={f.agentId ?? ""} onChange={(v) => set({ agentId: v || undefined })}
            options={[["", "Anyone"], ...team.members.map((m) => [m.user.id, m.user.name ?? m.user.email] as [string, string])]} />
        )}
        <Pick label="Sort" value={sort} onChange={(v) => setSort(v as typeof sort)}
          options={[["updated", "Last changed"], ["newest", "Newest first"], ["price_asc", "Price, low to high"], ["price_desc", "Price, high to low"]]} />
      </div>

      <div className={cn("border-t border-rule-strong mt-6 transition-opacity", isPlaceholderData && "opacity-60")}
           data-rows={rows.length} aria-busy={isPlaceholderData || undefined}>
        {/* The last column is a width, not `auto`, and in both grids. Each
            row is its own grid, so `auto` sized it to that row's five
            buttons while the header's empty cell sized it to nothing —
            every heading sat a column to the right of what it named. */}
        <div className="grid grid-cols-[1.6fr_140px_1fr_120px_400px] gap-4 py-3.5 px-1 border-b border-rule-strong t-label text-ink-3 max-[820px]:hidden">
          <span>Property</span><span>Price</span><span>Portals</span><span>Permit</span><span />
        </div>

        {isLoading && <RowsSkeleton />}

        {rows.map((l) => (
          <div
            key={l.id}
            // Same handle the pipeline board uses on a card. It is what
            // lets a check assert against *this* row rather than against
            // the page — the browser test for adding a property passed
            // with the price parsing deliberately broken, because it was
            // reading a matching number off a different listing.
            data-listing={l.reference}
            className="grid grid-cols-[1.6fr_140px_1fr_120px_400px] gap-4 items-center py-3.5 px-1 border-b border-rule hover:bg-raised max-[820px]:grid-cols-1 max-[820px]:gap-2"
          >
            <div>
              <div className="font-mono text-label text-ink-3">{l.reference}</div>
              <div className="text-ui font-medium text-ink mt-0.5">{l.title}</div>
              {/* What it is, when somebody has said: a buyer asks "villa or
                  apartment? ready or off-plan?" before anything else. */}
              {(l.propertyType || l.completion === "OFF_PLAN" || l.developer) && (
                <div className="text-sm text-ink-3 mt-0.5">
                  {[
                    l.propertyType ? TYPE_OPTIONS.find(([v]) => v === l.propertyType)?.[1] : null,
                    l.completion === "OFF_PLAN"
                      ? `Off-plan${l.handoverAt ? `, handover ${new Date(l.handoverAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : ""}`
                      : null,
                    [l.developer, l.project].filter(Boolean).join(", ") || null,
                  ].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>

            <div className="font-mono text-note text-ink">
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
                    "t-label border rounded-[2px] px-1.5 py-0.5",
                    p.state === "PUBLISHED" && "text-success border-success",
                    p.state === "REJECTED" && "text-accent-deep border-accent",
                    p.state === "PENDING" && "text-ink-3 border-rule border-dashed",
                    p.state === "FAILED" && "text-accent-deep border-accent border-dashed",
                    /* Quiet, not alarming. Nothing is wrong with this
                       listing and there is nothing for the agent to do
                       — the portal is not connected yet. Wearing the
                       accent here would put a listing that is fine on
                       the same footing as one a portal refused. */
                    p.state === "NOT_CONNECTED" && "text-ink-3 border-rule"
                  )}
                >
                  {p.state === "PUBLISHED"
                    ? "Live"
                    : p.state === "NOT_CONNECTED"
                      /* Not "not_connected". Every other state is one
                         word and lowercases cleanly; this one does not,
                         and a screen reading "not_connected" is the tell
                         that a label was derived rather than written. */
                      ? "not connected"
                      : p.state.toLowerCase()}
                </span>
              ))}
            </div>

            <div
              className={cn(
                "font-mono text-label",
                l.permitDaysLeft === null && "text-ink-3",
                l.permitDaysLeft !== null && l.permitDaysLeft < 0 && "text-accent-deep font-medium",
                l.permitDaysLeft !== null && l.permitDaysLeft >= 0 && l.permitDaysLeft <= 14 && "text-accent-deep",
                l.permitDaysLeft !== null && l.permitDaysLeft > 14 && "text-ink-2"
              )}
            >
              {permit(l.permitDaysLeft)}
            </div>

            <div className="justify-self-end flex gap-2 flex-wrap justify-end max-[820px]:justify-self-start max-[820px]:justify-start">
              <EditListing listing={l} />
              <CheckCopy listingId={l.id} />
              <WhoWantsIt listingId={l.id} reference={l.reference} />
              <PublishCheck
                listingId={l.id}
                reference={l.reference}
                channelIds={l.publications.map((p) => p.channelId)}
              />
              {/* Who owns it, which nothing in the product could show
                  or set. `attach-owner.tsx` was finished and imported by
                  nothing, and its own "Brief" button pointed at
                  `/vendors/<id>` — a route that did not exist either.
                  Marked when there is no owner, because that is the
                  state with consequences: no weekly report and nobody
                  to sign the Form F. */}
              <button
                onClick={() => setOwnerFor((o) => (o === l.id ? null : l.id))}
                aria-expanded={ownerFor === l.id}
                className={l.vendor
                  ? "min-h-11 px-1.5 text-sm text-ink-2 hover:text-ink hover:underline underline-offset-4 focus-visible:outline-none focus-visible:shadow-[var(--ring)] rounded-sm"
                  : "btn-inline min-h-11"}
              >
                {l.vendor ? "Owner" : "No owner"}{l.purpose === "RENT" ? " & lease" : ""}
              </button>
            </div>

            {ownerFor === l.id && (
              <div className="col-span-full">
                <AttachOwner listingId={l.id} current={l.vendor} agent={l.agent} />
                {l.purpose === "RENT" && <Lease listingId={l.id} />}
              </div>
            )}
          </div>
        ))}

        {/* This said "Import a feed or add one, and it appears here."
            when neither was possible: nothing in the product could
            create a listing, and portal import still cannot. An empty
            state that names two routes a brokerage does not have reads
            as "you have missed a setting" and sends them looking. It
            now names the one that works. */}
        {rows.length > 0 && (
          <div ref={sentinel} className="pt-5 flex items-center gap-4">
            <span className="text-sm text-ink-3 tabular" data-shown={rows.length}>
              Showing {rows.length.toLocaleString()} of {(counted?.total ?? rows.length).toLocaleString()}
            </span>
            {hasNextPage && (
              <button type="button" className="btn-inline min-h-11" disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}>
                {isFetchingNextPage ? "Loading…" : "Show more"}
              </button>
            )}
          </div>
        )}

        {/* Stock that exists but is filtered out is a different sentence
            from having none: "No properties yet" over a list of drafts
            would send somebody to add them again. */}
        {!isLoading && rows.length === 0 && !q && (everything?.total ?? 0) > 0 && (
          <p className="py-8 text-sm text-ink-3">
            Nothing matches these filters.{" "}
            <button type="button" className="btn-inline" onClick={() => { setF({}); setTyped(""); }}>Show everything</button>
          </p>
        )}

        {!isLoading && rows.length === 0 && !q && everything?.total === 0 && (
          <div className="py-10 max-w-[46ch]">
            <p className="text-sub font-medium text-ink">No properties yet.</p>
            <p className="text-sm text-ink-2 mt-2">
              Add the first one and it appears here, ready to match against your
              buyers. A reference and a name are enough — the permit can follow.
            </p>
            <div className="mt-4"><AddProperty /></div>
          </div>
        )}

        {/* A search that matched nothing is a different sentence. The
            shared one used to tell somebody whose "DH-9" found nothing
            that they had no properties at all. */}
        {!isLoading && rows.length === 0 && q && (
          <p className="py-8 text-sm text-ink-3">
            Nothing matches &ldquo;{q}&rdquo;.{" "}
            <Link href="/listings" className="btn-inline">Show all</Link>
          </p>
        )}
      </div>
    </div>
  );
}

function Alert({ count, title, detail, last }: { count: number; title: string; detail: string; last?: boolean }) {
  return (
    <div className={cn("px-5 py-5 border-b border-rule", !last && "border-e border-rule max-[720px]:border-e-0")}>
      <div className={cn("font-sans font-semibold text-h2 leading-none", count ? "text-accent-deep" : "text-ink-3")}>
        {count}
      </div>
      <div className="text-ui font-medium text-ink mt-2">{title}</div>
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

type ListingFilters = {
  status?: "DRAFT" | "AVAILABLE" | "UNDER_OFFER" | "SOLD" | "LET" | "WITHDRAWN";
  search?: string; purpose?: "SALE" | "RENT"; community?: string; agentId?: string;
  bedrooms?: number; minPriceAed?: number; maxPriceAed?: number;
  propertyType?: "APARTMENT" | "VILLA" | "TOWNHOUSE" | "PENTHOUSE" | "DUPLEX" | "PLOT" | "OFFICE" | "RETAIL" | "WAREHOUSE" | "OTHER";
  completion?: "READY" | "OFF_PLAN";
};

/** 16px on every control — below that iOS zooms the page on focus. */
const INPUT = "min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink w-full";

function Pick({ label, value, onChange, options }:
  { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="t-label text-ink-3">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
