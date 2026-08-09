"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Moving a viewing.
 *
 * Distinct from cancelling and rebooking, which loses the history and
 * tells the buyer twice. Rescheduling keeps one viewing and one
 * conversation.
 */
export function Reschedule({ viewingId, agentId, listingId, onDone }: {
  viewingId: string; agentId: string; listingId?: string; onDone?: () => void;
}) {
  const { data } = api.viewings.slots.useQuery({ agentId, listingId, days: 7 });
  const move = api.viewings.reschedule.useMutation({ onSuccess: onDone });
  const [picked, setPicked] = useState<string | null>(null);

  // `viewings.slots` returns the array itself, not `{ slots }`.
  const slots = data ?? [];

  return (
    <div className="bg-sunk rounded-xl p-4">
      <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
        Move it to
      </span>
      {slots.length === 0 ? (
        <p className="text-sm text-ink-2 max-w-[42ch] leading-snug">
          Nothing free this week that you could get to in time.
        </p>
      ) : (
        <div className="flex gap-2 flex-wrap">
          {slots.slice(0, 12).map((s) => {
            const iso = new Date(s.start).toISOString();
            return (
              <button key={iso} onClick={() => setPicked(iso)} aria-pressed={picked === iso}
                className={`min-h-11 px-3 rounded-lg border text-[15px] tabular ${
                  picked === iso ? "bg-accent text-on-accent border-accent-edge font-semibold"
                                 : "border-rule text-ink"}`}>
                {new Date(s.start).toLocaleString("en-GB",
                  { weekday: "short", hour: "2-digit", minute: "2-digit" })}
              </button>
            );
          })}
        </div>
      )}
      <Button variant="primary" className="mt-4" loading={move.isPending} disabled={!picked}
        onClick={() => picked && move.mutate({ viewingId, start: new Date(picked) })}>
        Move it
      </Button>
      <p className="text-sm text-ink-2 mt-3 max-w-[42ch] leading-snug">
        The buyer gets one message about the change, not a cancellation and a new booking.
      </p>
    </div>
  );
}
