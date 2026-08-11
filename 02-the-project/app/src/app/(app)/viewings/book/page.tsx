"use client";

import Link from "next/link";

import { use, useState } from "react";
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
  // Next 15 passes `searchParams` as a Promise, the same as `params`.
  searchParams: Promise<{ lead?: string; listing?: string }>;
}) {
  const { lead, listing: listingId } = use(searchParams);
  const leadId = lead ?? "";

  // No agentId passed: `viewings.slots` defaults to the calling agent,
  // which is who this screen is for. It used to read `userId` off
  // `org.mine`, which lists the brokerages you belong to and never had
  // one — so `agentId` was always "" and the query never ran.
  const { data, isLoading, isError, refetch, error } =
    api.viewings.slots.useQuery({ listingId, days: 7 });

  const hold = api.viewings.hold.useMutation();
  const confirm = api.viewings.confirm.useMutation();
  const [picked, setPicked] = useState<string | null>(null);

  if (isError) return <QueryError retry={() => void refetch()} what="available times" error={error} />;

  if (confirm.isSuccess) {
    return (
      <div className="max-w-[560px] mx-auto px-6 py-20">
        <h1 className="font-sans font-semibold text-[30px] text-accent-type -tracking-[0.026em]">Booked.</h1>
        <p className="text-[17px] text-ink-2 mt-3 max-w-[42ch]">
          It's on your day. The buyer gets the address and a route, not just a time.
        </p>
        <a href="/viewings" className="btn-inline mt-6 inline-block">Today</a>
      </div>
    );
  }

  const slots = data?.slots ?? [];
  // `false` only once the query has answered. While loading, `data` is
  // undefined and claiming the hours are unset would flash the wrong
  // advice on every open.
  const unconfigured = data ? !data.configured : false;
  const byDay = slots.reduce<Record<string, typeof slots>>((acc, s) => {
    const k = new Date(s.start).toLocaleDateString("en-GB",
      { weekday: "long", day: "numeric", month: "long" });
    (acc[k] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="max-w-[620px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-accent-type -tracking-[0.026em] leading-none">
          Pick a time
        </h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[46ch]">
          Only times you can actually get to. Slots that would leave you crossing the city in
          twenty minutes aren't offered.
        </p>
      </header>

      {isLoading ? (
        <div className="h-64 bg-sunk rounded-sm" aria-busy />
      ) : unconfigured ? (
        /**
         * The state this screen showed as a full diary.
         *
         * `availableSlots` skips any day with no `WorkingHours` row, and
         * nothing ever created one — so every brokerage got an empty
         * list and was told to move a viewing to make room, on a week
         * with nothing in it. Different cause, opposite instruction, and
         * it needs to name the screen that fixes it.
         */
        <div className="border-t border-rule pt-5 max-w-[46ch]">
          <p className="text-[17px] text-ink">No working hours are set.</p>
          <p className="text-sm text-ink-2 mt-2">
            Nothing can be booked until the brokerage says which days and times it
            works — the diary is not full, it is unset.
          </p>
          <p className="mt-4">
            <Link href="/settings/hours" className="text-[15px] text-accent-deep">
              Set the working week
            </Link>
          </p>
        </div>
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
            { leadId, listingId, start: new Date(picked), durationMins: 30 },
            { onSuccess: (v) => confirm.mutate({ viewingId: v.id }) }
          );
        }}>
        Book it
      </Button>
    </div>
  );
}
