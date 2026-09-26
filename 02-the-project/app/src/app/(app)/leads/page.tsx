"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";
import { sentence } from "@/lib/sentence";
import { Funnel } from "@/components/ui/chart";
import { AddLead } from "./add-lead";
import { download } from "@/lib/download";

/**
 * Every lead, as a list.
 *
 * The pipeline board is for working; this is for finding. An owner
 * looking for "everyone from Bayut last month who never got a reply"
 * needs a list, not a board.
 *
 * ## It used to stop at twenty-five
 *
 * The procedure paged by cursor from the start and the screen never asked
 * for page two, so a brokerage with three hundred leads saw the newest
 * twenty-five under a heading reading 300 — the audit's first P0. It now
 * loads fifty at a time, and the next fifty as the end comes into view,
 * with a button for anybody whose screen reader or keyboard would rather
 * ask.
 *
 * ## Filters live on the server
 *
 * Every filter and every sort is sent to `leads.list` and applied in the
 * query. Filtering what happens to be loaded in the browser is how a
 * screen says "no Bayut leads" when there are forty on page three.
 */

type Filter = "all" | "unassigned" | "hot" | "cold";
type View = "active" | "archived" | "deleted";
type Band = "GOLDEN" | "HOT" | "WARM" | "COLD" | "UNSCORED";
type Sort = "newest" | "oldest" | "score" | "name" | "updated";
type Source = "PROPERTY_FINDER" | "BAYUT" | "DUBIZZLE" | "WEBSITE" | "META_LEAD_ADS" | "WHATSAPP_AD" | "REFERRAL" | "WALK_IN" | "UNKNOWN";

type Filters = {
  filter: Filter; view: View; search?: string; source?: Source;
  agentId?: string; band?: Band; tag?: string; stageId?: string;
};

const SOURCES: Source[] = ["PROPERTY_FINDER", "BAYUT", "DUBIZZLE", "WEBSITE", "META_LEAD_ADS", "WHATSAPP_AD", "REFERRAL", "WALK_IN", "UNKNOWN"];
const BAND_LABEL: Record<Band, string> = { GOLDEN: "Golden", HOT: "Hot", WARM: "Warm", COLD: "Cold", UNSCORED: "Not scored yet" };
const SORT_LABEL: Record<Sort, string> = {
  newest: "Newest first", oldest: "Oldest first", score: "Best score first", name: "Name, A–Z", updated: "Last changed",
};
const MANAGERS = new Set(["MANAGER", "ADMIN", "OWNER"]);

/** Drop the empties, so a saved view and a query key say only what was chosen. */
const clean = (f: Filters): Filters =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== "")) as Filters;

/**
 * The Suspense boundary is required: reading the address in a client
 * component makes the route unprerenderable, and Next fails the build
 * without one (the listings screen has the account).
 */
export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="max-w-[1180px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>}>
      <Leads />
    </Suspense>
  );
}

/**
 * Filters from the address, so a figure on the reports screen can open
 * the records behind it — "Bayut: 12 leads, 1 won" goes to exactly those
 * twelve. Only the names the list understands are read.
 */
function fromAddress(p: URLSearchParams): Filters {
  const pick = <T extends string>(k: string, ok: readonly T[]) => { const v = p.get(k); return v && (ok as readonly string[]).includes(v) ? (v as T) : undefined; };
  return {
    filter: pick("filter", ["all", "unassigned", "hot", "cold"] as const) ?? "all",
    view: pick("view", ["active", "archived", "deleted"] as const) ?? "active",
    source: pick("source", SOURCES),
    band: pick("band", ["GOLDEN", "HOT", "WARM", "COLD", "UNSCORED"] as const),
    agentId: p.get("agentId") ?? undefined,
    stageId: p.get("stageId") ?? undefined,
    tag: p.get("tag") ?? undefined,
  };
}

function Leads() {
  const params = useSearchParams();
  const [f, setF] = useState<Filters>(() => fromAddress(params));
  const [sort, setSort] = useState<Sort>("newest");
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Typing is not searching: a query per keystroke on a large book is
  // three hundred requests for one name.
  useEffect(() => {
    // Same object when nothing changed: a new one is a new filter, and a
    // new filter clears the ticks — which it did, 300ms after every load.
    const next = typed.trim() || undefined;
    const t = setTimeout(() => setF((x) => (x.search === next ? x : { ...x, search: next })), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const filters = useMemo(() => clean(f), [f]);
  // A different question is a different selection. Carrying ticks across
  // a filter change is how "archive 3" archives three leads nobody can see.
  useEffect(() => { setPicked(new Set()); setAllMatching(false); }, [filters, sort]);

  const list = api.leads.list.useInfiniteQuery(
    { ...filters, sort, limit: 50 },
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      // The last answer stays up while the next loads. Without it every
      // filter change flashed the heading to 0 and the list to empty.
      placeholderData: (prev) => prev,
    },
  );
  /**
   * The same filters, deliberately. The strip and the heading describe
   * the list underneath them, and `distribution` shares the `where`
   * clause with `list`, so the two cannot drift.
   */
  const { data: shape } = api.leads.distribution.useQuery(filters, { placeholderData: (prev) => prev });
  const { data: mine } = api.org.mine.useQuery();
  const role = mine?.find((o) => o.active)?.role ?? "AGENT";
  const manager = MANAGERS.has(role);
  const { data: team } = api.org.members.useQuery(undefined, { enabled: manager });
  const { data: stages } = api.pipeline.stages.useQuery();
  const { data: tags } = api.leads.tags.useQuery();
  const { data: views, refetch: refetchViews } = api.views.list.useQuery({ screen: "leads" });
  const saveView = api.views.save.useMutation({ onSuccess: () => void refetchViews() });
  const dropView = api.views.remove.useMutation({ onSuccess: () => void refetchViews() });

  const exporter = api.leads.exportCsv.useMutation({
    onSuccess: (r) => { download(r.filename, r.csv); setNotice(`${r.count.toLocaleString()} leads exported.`); },
  });
  const utils = api.useUtils();
  const bulk = api.leads.bulk.useMutation({
    onSuccess: (r, v) => {
      setPicked(new Set()); setAllMatching(false);
      setNotice(`${r.count.toLocaleString()} ${r.count === 1 ? "lead" : "leads"} ${DONE[v.action.type]}.`);
      void utils.leads.list.invalidate();
      void utils.leads.distribution.invalidate();
      void utils.leads.tags.invalidate();
    },
  });

  // The next fifty, as the end of the list comes into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es[0]?.isIntersecting && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [list.hasNextPage, list.isFetchingNextPage, list.fetchNextPage]);

  if (list.isError) return <QueryError retry={() => void list.refetch()} what="your leads" error={list.error} />;

  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];
  const total = shape?.total ?? rows.length;
  const selectedCount = allMatching ? total : picked.size;
  const allShownPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggle = (id: string) => {
    setAllMatching(false);
    setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }));
  const act = (action: Parameters<typeof bulk.mutate>[0]["action"]) => {
    setNotice(null);
    bulk.mutate({ target: allMatching ? { matching: filters } : { ids: [...picked] }, action });
  };
  const activeCount = (["search", "source", "agentId", "band", "tag", "stageId"] as const).filter((k) => f[k]).length
    + (f.view !== "active" ? 1 : 0) + (sort !== "newest" ? 1 : 0);
  const narrowed = Object.keys(filters).some((k) => k !== "filter" && k !== "view") || f.filter !== "all" || f.view !== "active";

  return (
    <div className="max-w-[1180px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <span className="t-label text-ink-3">
            {f.view === "archived" ? "Archived leads" : f.view === "deleted" ? "Deleted leads" : "Leads"}
          </span>
          <div className="flex items-center gap-4">
            {/* A book in and a book out — managers only, both logged. */}
            {manager && (
              <>
                <a href="/leads/import" className="btn-inline min-h-11 inline-flex items-center">Import</a>
                <button type="button" className="btn-inline min-h-11" disabled={exporter.isPending}
                  onClick={() => { setNotice(null); exporter.mutate({ ...filters, sort }); }}>
                  {exporter.isPending ? "Exporting…" : "Export"}
                </button>
              </>
            )}
            <AddLead />
          </div>
        </div>
        {/* `shape.total`, not `rows.length` — the rows are a page. */}
        <h1 className="font-sans font-semibold text-page text-ink tabular" data-total={total}>
          {total.toLocaleString()}
        </h1>
      </header>

      <div className="flex gap-2 flex-wrap mb-4">
        {/* "Waiting on us", not "Hot": the `hot` filter is unread inbound —
            our backlog — and Hot is also a score band on every row. */}
        {([["all", "Everyone"], ["unassigned", "Nobody's"], ["hot", "Waiting on us"], ["cold", "Gone quiet"]] as const)
          .map(([k, label]) => (
            <button key={k} onClick={() => set({ filter: k })} aria-pressed={f.filter === k}
              className={cn("min-h-11 px-4 rounded-lg border text-ui",
                f.filter === k ? "bg-accent text-on-accent border-accent-edge font-medium" : "border-rule text-ink")}>
              {label}
            </button>
          ))}
      </div>

      {/* On a phone the bar is behind a button: eight controls above the
          list put the first lead below the fold. The count says when
          something is already narrowing it. */}
      <div className="mb-2 min-[900px]:hidden">
      <button type="button" className="btn-inline min-h-11" aria-expanded={showFilters}
        aria-controls="lead-filters" onClick={() => setShowFilters((v) => !v)}>
        {showFilters ? "Hide filters" : `Filters${activeCount ? ` (${activeCount})` : ""}`}
      </button></div>

      {/* The filter bar. Every control is a server filter. */}
      <div id="lead-filters" role="search"
        className={cn("gap-3 mb-4 grid-cols-2 min-[900px]:grid min-[900px]:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]",
          showFilters ? "grid" : "hidden")}>
        <label className="flex flex-col gap-1 col-span-2 min-[900px]:col-span-1">
          <span className="t-label text-ink-3">Name or number</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Sarah, or 050 100 0001"
            className={INPUT} />
        </label>
        <Pick label="Source" value={f.source ?? ""} onChange={(v) => set({ source: (v || undefined) as Source | undefined })}
          options={[["", "Any"], ...SOURCES.map((s) => [s, sentence(s)] as [string, string])]} />
        <Pick label="Score" value={f.band ?? ""} onChange={(v) => set({ band: (v || undefined) as Band | undefined })}
          options={[["", "Any"], ...(Object.keys(BAND_LABEL) as Band[]).map((b) => [b, BAND_LABEL[b]] as [string, string])]} />
        <Pick label="Stage" value={f.stageId ?? ""} onChange={(v) => set({ stageId: v || undefined })}
          options={[["", "Any"], ...(stages?.stages ?? []).map((s) => [s.id, s.name] as [string, string])]} />
        {manager ? (
          <Pick label="With" value={f.agentId ?? ""} onChange={(v) => set({ agentId: v || undefined })}
            options={[["", "Anyone"], ...(team?.members ?? []).map((m) => [m.user.id, m.user.name ?? m.user.email] as [string, string])]} />
        ) : (
          <Pick label="Tag" value={f.tag ?? ""} onChange={(v) => set({ tag: v || undefined })}
            options={[["", "Any"], ...(tags ?? []).map((t) => [t.tag, `${t.tag} (${t.count})`] as [string, string])]} />
        )}
        {manager && (
          <Pick label="Tag" value={f.tag ?? ""} onChange={(v) => set({ tag: v || undefined })}
            options={[["", "Any"], ...(tags ?? []).map((t) => [t.tag, `${t.tag} (${t.count})`] as [string, string])]} />
        )}
        <Pick label="Sort" value={sort} onChange={(v) => setSort(v as Sort)}
          options={(Object.keys(SORT_LABEL) as Sort[]).map((s) => [s, SORT_LABEL[s]])} />
        <Pick label="Showing" value={f.view} onChange={(v) => set({ view: v as View })}
          options={[["active", "Current leads"], ["archived", "Archived"], ...(manager ? [["deleted", "Recently deleted"] as [string, string]] : [])]} />
      </div>

      {/* Saved views: the filters somebody wants back. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-6">
        {(views ?? []).map((v) => (
          <span key={v.id} className="inline-flex items-center gap-1">
            <button type="button" className="btn-inline min-h-11"
              onClick={() => {
                const saved = v.filters as { sort?: Sort } & Filters;
                const { sort: s, ...rest } = saved;
                setF({ ...({ filter: "all", view: "active" } as Filters), ...rest });
                setTyped(rest.search ?? "");
                if (s) setSort(s);
              }}>
              {v.name}{v.shared ? " · team" : ""}
            </button>
            {(v.mine || manager) && (
              <button type="button" aria-label={`Remove the view ${v.name}`} className="text-ink-3 min-h-11 px-1"
                onClick={() => dropView.mutate({ id: v.id })}>×</button>
            )}
          </span>
        ))}
        {narrowed && (
          <>
            <button type="button" className="btn-inline min-h-11"
              onClick={() => {
                const name = window.prompt("Name this view", "");
                if (!name?.trim()) return;
                const shared = manager && window.confirm("Share it with the whole team?");
                saveView.mutate({ screen: "leads", name: name.trim(), filters: { ...filters, sort }, shared });
              }}>
              Save this view
            </button>
            <button type="button" className="btn-inline min-h-11"
              onClick={() => { setF({ filter: "all", view: "active" }); setTyped(""); setSort("newest"); }}>
              Clear filters
            </button>
          </>
        )}
      </div>

      {shape && shape.total > 0 && f.view === "active" && (
        <div className="mb-6 max-w-[760px]">
          <Funnel
            caption="Leads by score"
            rows={shape.bands.map((b) => ({
              label: b.label,
              value: b.count,
              note: b.count === 0 ? undefined : `${Math.round((b.count / shape.total) * 100)}%`,
              muted: b.band !== "GOLDEN" && b.band !== "HOT",
            }))}
            empty="No leads to score yet."
          />
        </div>
      )}

      {notice && <p role="status" className="text-ui text-ink mb-4">{notice}</p>}
      {(bulk.error ?? exporter.error) && (
        <p role="alert" className="text-sm text-danger mb-4">{(bulk.error ?? exporter.error)!.message}</p>
      )}

      {/* The bar appears only when something is selected. */}
      {selectedCount > 0 && (
        <div className="bg-sunk rounded-xl p-4 mb-5 flex items-center gap-3 flex-wrap" aria-label="Act on the selected leads">
          <span className="text-ui text-ink font-medium tabular" data-selected={selectedCount}>
            {selectedCount.toLocaleString()} selected
          </span>
          {f.view === "deleted" ? (
            <Button size="sm" variant="primary" loading={bulk.isPending} onClick={() => act({ type: "restore" })}>
              Restore
            </Button>
          ) : (
            <>
              {manager && (
                <ActionPick label="Assign to" disabled={bulk.isPending}
                  options={[...(team?.members ?? []).map((m) => [m.user.id, m.user.name ?? m.user.email] as [string, string]),
                            ["__pool__", "Nobody — return to the pool"]]}
                  onPick={(v) => act({ type: "assign", agentId: v === "__pool__" ? null : v })} />
              )}
              <ActionPick label="Move to stage" disabled={bulk.isPending}
                options={(stages?.stages ?? []).map((s) => [s.id, s.name] as [string, string])}
                onPick={(v) => act({ type: "stage", stageId: v })} />
              <button type="button" className="btn-inline min-h-11" disabled={bulk.isPending}
                onClick={() => {
                  const tag = window.prompt("Tag to add", "")?.trim();
                  if (tag) act({ type: "tag", tag: tag.slice(0, 40) });
                }}>
                Add a tag
              </button>
              {f.tag && (
                <button type="button" className="btn-inline min-h-11" disabled={bulk.isPending}
                  onClick={() => act({ type: "untag", tag: f.tag! })}>
                  Remove &ldquo;{f.tag}&rdquo;
                </button>
              )}
              {f.view === "archived" ? (
                <button type="button" className="btn-inline min-h-11" disabled={bulk.isPending}
                  onClick={() => act({ type: "unarchive" })}>Bring back</button>
              ) : (
                <button type="button" className="btn-inline min-h-11" disabled={bulk.isPending}
                  onClick={() => act({ type: "archive" })}>Archive</button>
              )}
              {manager && (
                <button type="button" className="btn-inline min-h-11 text-danger" disabled={bulk.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete ${selectedCount.toLocaleString()} ${selectedCount === 1 ? "lead" : "leads"}? A manager can restore them from Recently deleted.`)) {
                      act({ type: "delete" });
                    }
                  }}>
                  Delete
                </button>
              )}
            </>
          )}
          <button className="btn-inline ms-auto min-h-11" onClick={() => { setPicked(new Set()); setAllMatching(false); }}>
            Clear
          </button>
        </div>
      )}

      {/* "All fifty shown" is not "all 312 matching", and says so. */}
      {allShownPicked && !allMatching && total > rows.length && (
        <p className="text-ui text-ink-2 mb-4">
          All {rows.length} shown are selected.{" "}
          <button type="button" className="btn-inline" onClick={() => setAllMatching(true)}>
            Select all {total.toLocaleString()} that match
          </button>
        </p>
      )}

      {list.isLoading ? (
        <div className="h-64 bg-sunk rounded-sm" aria-busy />
      ) : rows.length === 0 ? (
        <p className="text-sub text-ink-2 border-t border-rule pt-5 max-w-[42ch]">
          Nothing here. {f.filter === "unassigned" && !narrowed ? "Every lead has somebody on it." : narrowed ? "Try clearing a filter." : ""}
        </p>
      ) : (
        <>
          <label className="flex items-center gap-3 min-h-11 border-t border-rule-strong">
            <input type="checkbox" checked={allShownPicked || allMatching}
              onChange={() => {
                setAllMatching(false);
                setPicked(allShownPicked ? new Set() : new Set(rows.map((r) => r.id)));
              }}
              className="w-5 h-5 accent-[var(--accent)]" />
            <span className="t-label text-ink-3">Select all shown</span>
          </label>
          <div className={cn("border-t border-rule transition-opacity", list.isPlaceholderData && "opacity-60")}
               data-rows={rows.length} aria-busy={list.isPlaceholderData || undefined}>
            {rows.map((l) => (
              /**
               * A grid, so the band, the source and the owner line up
               * down the page, and a row that lights up under the pointer
               * so the far side of a wide screen is readable.
               */
              <div key={l.id} data-lead={l.id}
                   className="grid grid-cols-[auto_minmax(0,1fr)_104px] items-center gap-x-4 gap-y-1
                              border-b border-rule py-3 -mx-2 px-2 rounded-sm
                              transition-colors hover:bg-sunk
                              min-[900px]:grid-cols-[auto_minmax(0,1fr)_104px_96px_128px]">
                <label className="flex items-center min-h-11 cursor-pointer">
                  <span className="sr-only">Select {l.name ?? l.phone}</span>
                  <input type="checkbox" checked={allMatching || picked.has(l.id)} onChange={() => toggle(l.id)}
                    className="w-5 h-5 accent-[var(--accent)]" />
                </label>
                {/* The thread when there is one, the person otherwise — the
                    old fallback put a lead id into the inbox and opened nothing. */}
                <a href={l.conversation ? `/inbox/${l.conversation.id}` : `/blackbook/${l.id}`}
                   className="flex min-h-11 items-center gap-2 text-ui text-ink no-underline flex-1 min-w-0">
                  <span className="truncate">{l.name ?? l.phone}</span>
                  {l.tags.slice(0, 3).map((t) => (
                    <span key={t} className="t-label text-ink-3 border border-rule rounded-[2px] px-1 shrink-0 hidden min-[600px]:inline">{t}</span>
                  ))}
                </a>
                {/* Rendered even when there is none, so the columns do not
                    slide left for an unscored lead. */}
                {!l.band && <span aria-hidden />}
                {l.band && (
                  <span data-band={l.band.band} title={l.band.blurb}
                        className={cn(
                          "t-label px-1.5 py-0.5 rounded-[2px] border justify-self-end",
                          l.band.band === "GOLDEN" || l.band.band === "HOT"
                            ? "text-accent-deep border-accent-edge bg-accent-soft"
                            : "text-ink-3 border-rule")}>
                    {l.band.label} <span className="tabular">{l.score}</span>
                  </span>
                )}
                <span className="t-label text-ink-3 hidden min-[900px]:block truncate">
                  {sentence(l.source)}
                </span>
                <span className="font-mono text-label text-ink-3 truncate text-end tabular hidden min-[900px]:block">
                  {l.assignedTo?.name ?? "unassigned"}
                </span>
                {l.drivers.length > 0 && (
                  <p className="col-span-full ps-8 text-note leading-snug text-ink-3">
                    {l.drivers.join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div ref={sentinel} className="pt-5 flex items-center gap-4">
            <span className="text-sm text-ink-3 tabular" data-shown={rows.length}>
              Showing {rows.length.toLocaleString()} of {total.toLocaleString()}
            </span>
            {list.hasNextPage && (
              <Button size="sm" variant="secondary" loading={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}>
                Show more
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const DONE: Record<string, string> = {
  assign: "reassigned", stage: "moved", tag: "tagged", untag: "untagged",
  archive: "archived", unarchive: "brought back", delete: "deleted", restore: "restored",
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

/** A select that acts once and resets, for the bulk bar. */
function ActionPick({ label, options, onPick, disabled }:
  { label: string; options: [string, string][]; onPick: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex">
      <span className="sr-only">{label}</span>
      <select value="" disabled={disabled}
        onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) onPick(v); }}
        className="min-h-11 px-3 text-control text-ink bg-raised border border-rule rounded-lg">
        <option value="">{label}…</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
