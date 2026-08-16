"use client";

import { api } from "@/lib/trpc";
import { ViewingCard } from "@/components/ui/viewing-card";
import { QueryError } from "@/components/ui/query-state";

/**
 * The day.
 *
 * The agent test: *"Where is it. How do I get there. Which building,
 * which entrance, which tower."* Before this, a viewing was a time and a
 * name.
 *
 * Ordered by time, not by geography. A route optimiser sounds clever and
 * is wrong — a buyer waiting outside at ten does not care that eleven
 * o'clock in JVC would have been a shorter drive. What the screen does
 * instead is **warn** when two stops are too far apart for the gap, and
 * leave the agent to decide.
 */
export default function Viewings() {
  /**
   * Midnight, not now.
   *
   * `new Date()` here is recomputed on every render and React Query keys
   * by the serialised input — so the key changed every millisecond, the
   * query refetched, the refetch re-rendered, and the diary hammered the
   * server in a loop while never leaving its skeleton. The same fault
   * was on /me and in `settings/kill-switch.tsx`.
   *
   * A day query wants the day. Rounding also means the key is stable
   * until midnight, which is exactly how long the answer is good for.
   */
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const { data, isLoading, isError, refetch, error } = api.viewings.day.useQuery({
    date: today,
  });

  if (isError) return <QueryError retry={() => void refetch()} what="today's viewings" error={error} />;
  if (isLoading) return <Skeleton />;

  const list = data?.viewings ?? [];

  return (
    <div className="max-w-[680px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
          {new Intl.DateTimeFormat("en-GB", {
            weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Dubai",
          }).format(new Date())}
        </span>
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.75rem)] text-ink -tracking-[0.026em] leading-none">
          {list.length === 0 ? "Nothing today." : `${list.length} viewing${list.length === 1 ? "" : "s"}.`}
        </h1>
      </header>

      {list.length === 0 ? (
        <p className="text-[17px] text-ink-2 max-w-[42ch]">
          Nothing booked. When the assistant books one it appears here with the address and
          a route, so you can leave without opening anything else.
        </p>
      ) : (
        <div className="border-t border-ink">
          {list.map((v, i) => (
            <ViewingCard
              key={v.id}
              viewing={v}
              // The stop before, so the card can say "that's tight"
              // before the agent sets off rather than on the road.
              previous={i > 0 ? list[i - 1]! : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="max-w-[680px] mx-auto px-6 pt-10" aria-busy>
      <span className="sr-only">Loading today&rsquo;s viewings</span>
      <div className="h-10 w-52 bg-sunk rounded-sm" />
      <div className="mt-8 space-y-px">
        {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-sunk rounded-sm" />)}
      </div>
    </div>
  );
}
