"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { aed, aedShort } from "@/lib/money";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "handover", label: "Handover" },
  { id: "mine", label: "Mine" },
] as const;

/**
 * The conversation list.
 *
 * Every row carries the window state, because a closed conversation
 * cannot be answered normally and an agent needs to know that before
 * they open it rather than after they have typed a reply.
 */
export function InboxList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage } =
    api.conversations.list.useInfiniteQuery(
      { filter },
      { getNextPageParam: (last) => last.nextCursor }
    );

  const rows = data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <aside className="border-r border-rule flex flex-col min-h-0">
      <div className="flex gap-4 px-5 py-3.5 border-b border-rule overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              // 44px tall. These were 22px — half the minimum — and they
              // are the most-tapped controls on the screen an agent lives
              // in. The underline still sits under the label; the target
              // is the whole chip.
              "font-mono text-[11px] uppercase tracking-[0.1em] min-h-11 inline-flex items-center border-b whitespace-nowrap",
              filter === f.id ? "text-accent-deep border-accent" : "text-ink-3 border-transparent hover:text-ink"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-y-auto flex-1">
        {isLoading && <ListSkeleton />}

        {isError && (
          <div role="alert" className="px-5 py-8">
            <p className="text-[15px] text-ink font-semibold">Couldn&rsquo;t load your conversations.</p>
            <p className="text-sm text-ink-2 mt-1.5">Nothing is lost — this is a fetching problem.</p>
            <Button variant="secondary" className="mt-3.5" onClick={() => void refetch()}>Try again</Button>
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          // Says what will happen, not just that there is nothing. An
          // empty inbox on day one should not look broken.
          <p className="px-5 py-8 text-sm text-ink-3">
            Nothing here yet. New enquiries land in this list the moment they arrive.
          </p>
        )}

        {rows.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            aria-current={selectedId === c.id}
            className={cn(
              "block w-full text-left px-5 py-3.5 border-b border-rule hover:bg-raised",
              selectedId === c.id && "bg-raised shadow-[inset_2px_0_0_var(--accent)]"
            )}
          >
            <span className="flex items-baseline gap-2.5">
              {c.unreadCount > 0 && (
                <span aria-label="unread" className="size-[7px] rounded-full bg-accent shrink-0" />
              )}
              <span className="text-[15px] font-semibold text-ink">
                {c.lead.name ?? c.lead.phone}
              </span>
              <span className="ml-auto font-mono text-[9px] tracking-[0.08em] text-ink-3 whitespace-nowrap">
                {time(c.updatedAt)}
              </span>
            </span>

            <span className="block text-sm text-ink-2 mt-1.5 line-clamp-1">
              {c.messages[0]?.body ?? "No messages yet"}
            </span>

            <span className="flex gap-2.5 mt-2 flex-wrap items-center">
              {c.humanHandover && <Tag highlight>Handover</Tag>}
              {c.lead.budgetMaxFils && <Tag>{aedShort(c.lead.budgetMaxFils)}</Tag>}
              <Tag dashed={!c.window.open}>
                {c.window.open ? `Window ${c.window.hoursLeft}h` : "Window closed"}
              </Tag>
            </span>
          </button>
        ))}

        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            className="w-full px-5 py-4 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3 hover:text-ink"
          >
            Load more
          </button>
        )}
      </div>
    </aside>
  );
}

function Tag({ children, highlight, dashed }: { children: React.ReactNode; highlight?: boolean; dashed?: boolean }) {
  return (
    <span
      className={cn(
        "font-mono text-[9px] uppercase tracking-[0.1em] border rounded-[2px] px-1.5 py-0.5",
        highlight ? "text-accent-deep border-accent" : "text-ink-3 border-rule",
        dashed && "border-dashed"
      )}
    >
      {children}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy>
      <span className="sr-only">Loading conversations</span>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="px-5 py-4 border-b border-rule">
          <div className="h-3 w-28 bg-sunk rounded-sm" />
          <div className="h-2.5 w-full bg-sunk rounded-sm mt-2.5" />
        </div>
      ))}
    </div>
  );
}

const time = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" }).format(d);

