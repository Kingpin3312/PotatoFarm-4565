"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";

/**
 * The blackbook.
 *
 * Everyone an agent deals with, including the people who are in nobody's
 * pipeline — the mortgage broker, the conveyancer, the developer's sales
 * manager.
 *
 * Nothing on this screen is visible to a manager. That is not a setting,
 * it is enforced in the router and checked in the build: every procedure
 * scopes to the calling agent, and the private note is deliberately not
 * audited, because an audit row is a record somebody can read.
 */
export default function Blackbook() {
  const [tag, setTag] = useState<string | undefined>();
  const { data, isLoading, isError, refetch, error } = api.blackbook.mine.useQuery({ tag });

  if (isError) return <QueryError retry={() => void refetch()} what="your blackbook" error={error} />;

  const rows = data ?? [];
  const tags = [...new Set(rows.flatMap((r) => r.tags))].sort();

  return (
    <div className="max-w-[680px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
          Yours
        </span>
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-ink -tracking-[0.026em] leading-none tabular">
          {rows.length} {rows.length === 1 ? "person" : "people"}
        </h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[48ch]">
          Your notes and tags. No manager sees this page, and it exports with you if you
          ever leave — the client records and the compliance file stay with the brokerage.
        </p>
      </header>

      {tags.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-6">
          <button onClick={() => setTag(undefined)} aria-pressed={!tag}
            className={cn("min-h-11 px-3 rounded-lg border text-[15px]",
              !tag ? "bg-accent text-on-accent border-accent-edge font-semibold" : "border-rule text-ink")}>
            Everyone
          </button>
          {tags.map((t) => (
            <button key={t} onClick={() => setTag(t)} aria-pressed={tag === t}
              className={cn("min-h-11 px-3 rounded-lg border text-[15px]",
                tag === t ? "bg-accent text-on-accent border-accent-edge font-semibold" : "border-rule text-ink")}>
              {t}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="h-64 bg-sunk rounded-sm" aria-busy />
      ) : rows.length === 0 ? (
        <p className="text-[17px] text-ink-2 border-t border-rule pt-5 max-w-[44ch]">
          Nobody yet. Add the people you actually deal with — including the ones who will
          never be a lead.
        </p>
      ) : (
        <div className="border-t border-ink">
          {rows.map((r) => (
            <a key={r.id}
               href={r.leadId ? `/blackbook/${r.leadId}` : `/blackbook/v/${r.vendorId ?? r.id}`}
               className="flex items-baseline gap-3 py-3.5 border-b border-rule no-underline">
              {r.starred && <span aria-label="starred" className="text-accent-deep">★</span>}
              <span className="text-[16px] text-ink">
                {r.nickname ?? r.standaloneName ?? "—"}
              </span>
              {r.tags.slice(0, 2).map((t) => (
                <span key={t} className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3 border border-rule rounded-[3px] px-1.5 py-0.5">
                  {t}
                </span>
              ))}
              <span className="ml-auto font-mono text-[11px] text-ink-3">
                {r.lastTouched ? rel(r.lastTouched) : ""}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/** Rounded to what somebody would actually say. */
function rel(d: Date | string): string {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}
