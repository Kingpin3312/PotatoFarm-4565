"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";

/**
 * Book a viewing.
 *
 * Six of seven viewing procedures had no screen — an agent could see
 * today's list and do nothing with it.
 *
 * The hold-then-confirm shape exists because two agents offering the
 * same slot to two buyers is the failure that costs a viewing. Holding
 * takes the slot off the board while the buyer decides; confirming
 * commits it. A hold that is never confirmed expires on its own.
 */
export default function Book({ searchParams }: {
  searchParams: { lead?: string; listing?: string };
}) {
  const leadId = searchParams.lead ?? "";
  const listingId = searchParams.listing;

  const { data: me } = api.org.mine.useQuery();
  const agentId = me?.userId ?? "";

  const { data, isLoading, isError, refetch } = api.viewings.slots.useQuery(
    { agentId, listingId, days: 7 },
    { enabled: Boolean(agentId) }
  );

  const hold = api.viewings.hold.useMutation();
  const confirm = api.viewings.confirm.useMutation();
  const [picked, setPicked] = useState<string | null>(null);

  if (isError) return <QueryError retry={() => void refetch()} what="available times" />;

  if (confirm.isSuccess) {
    return (
      <div className="max-w-[560px] mx-auto px-6 py-20">
        <h1 className="font-sans font-semibold text-[30px] text-ink -tracking-[0.026em]">Booked.</h1>
        <p className="text-[17px] text-ink-2 mt-3 max-w-[42ch]">
          It's on your day. The buyer gets the address and a route, not just a time.
        </p>
        <a href="/viewings" className="btn-inline mt-6 inline-block">Today</a>
      </div>
    );
  }

  const slots = data?.slots ?? [];
  const byDay = slots.reduce<Record<string, typeof slots>>((acc, s) => {
    const k = new Date(s.start).toLocaleDateString("en-GB",
      { weekday: "long", day: "numeric", month: "long" });
    (acc[k] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="max-w-[620px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-ink -tracking-[0.026em] leading-none">
          Pick a time
        </h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[46ch]">
          Only times you can actually get to. Slots that would leave you crossing the city in
          twenty minutes aren't offered.
        </p>
      </header>

      {isLoading ? (
        <div className="h-64 bg-sunk rounded-sm" aria-busy />
      ) : slots.length === 0 ? (
        <p className="text-[17px] text-ink-2 border-t border-rule pt-5 max-w-[44ch]">
          Nothing free in the next week. Widen the range or move something.
        </p>
      ) : (
        Object.entries(byDay).map(([day, list]) => (
          <section key={day} className="mb-7">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3 pb-2 border-b border-rule">
              {day}
            </h2>
            <div className="flex gap-2 flex-wrap mt-3">
              {list.map((s) => {
                const iso = new Date(s.start).toISOString();
                return (
                  <button key={iso} onClick={() => setPicked(iso)} aria-pressed={picked === iso}
                    className={cn("min-h-11 px-4 rounded-lg border text-[15px] tabular",
                      picked === iso
                        ? "bg-accent text-on-accent border-accent-edge font-semibold"
                        : "border-rule text-ink")}>
                    {new Date(s.start).toLocaleTimeString("en-GB",
                      { hour: "2-digit", minute: "2-digit" })}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      {hold.error && <p role="alert" className="text-sm text-danger mt-4">{hold.error.message}</p>}

      <Button variant="primary" full className="mt-6"
        loading={hold.isPending || confirm.isPending}
        disabled={!picked || !leadId}
        onClick={() => {
          if (!picked) return;
          // Hold, then confirm. Two calls on purpose — the hold is what
          // stops a second agent offering the same slot while this one
          // is still being agreed.
          hold.mutate(
            { leadId, agentId, listingId, start: new Date(picked), durationMins: 30 },
            { onSuccess: (v) => confirm.mutate({ viewingId: v.id }) }
          );
        }}>
        Book it
      </Button>
    </div>
  );
}
