"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The working week.
 *
 * Nothing ever wrote a `WorkingHours` row, and `availableSlots()` skips
 * any day it has no row for — so every brokerage got an empty list from
 * every booking query, and the booking screen said *"Nothing free in the
 * next week. Widen the range or move something."* A diary nobody had
 * configured, reported as a diary that was full.
 *
 * That is the last step of the product's own promise — answers the
 * enquiry, qualifies the lead, **books the viewing** — and it could not
 * offer a single time.
 *
 * ## Why every day is a row rather than a "weekdays" toggle
 *
 * Because the week here is not the one a scheduling library assumes.
 * Saturday is the busiest viewing day; Friday does not start until after
 * prayers; and a brokerage that works Sunday to Thursday is ordinary. A
 * five-day default with a weekend switch would be wrong for most of this
 * market and awkward for the rest.
 */
export default function WorkingHoursPage() {
  const { data, isLoading, isError, refetch, error } = api.org.hours.useQuery();
  const utils = api.useUtils();
  const [days, setDays] = useState<
    { dayOfWeek: number; name: string; closed: boolean; start: string; end: string }[]
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  /**
   * Seeded from the query once it lands.
   *
   * The form holds its own state because every field is edited before
   * anything is saved — seven days at once, one Save. Copying on arrival
   * rather than deriving on each render is what lets a half-finished
   * edit survive a background refetch.
   */
  useEffect(() => {
    if (data) {
      setDays(data.map((d) => ({
        dayOfWeek: d.dayOfWeek, name: d.name, closed: d.closed, start: d.start, end: d.end,
      })));
    }
  }, [data]);

  const save = api.org.setHours.useMutation({
    onSuccess: () => {
      void utils.org.hours.invalidate();
      // Both booking surfaces read the scheduler, and neither would
      // otherwise notice the week had changed until a reload.
      void utils.viewings.slots.invalidate();
      setFailed(null);
      setMessage("Saved.");
    },
    onError: (e) => { setMessage(null); setFailed(e.message); },
  });

  if (isError) return <QueryError retry={() => void refetch()} what="your working hours" error={error} />;
  if (isLoading || days.length === 0) {
    return <div className="max-w-[600px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>;
  }

  const unset = data?.filter((d) => d.unset).length ?? 0;
  const set = (i: number, patch: Partial<(typeof days)[number]>) =>
    setDays((old) => old.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <div className="max-w-[600px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
          Working hours
        </span>
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-ink -tracking-[0.026em] leading-none">
          {/* A day with no row is skipped by the scheduler exactly as if
              it were closed, so "unset" is the state worth a headline —
              it is the one nobody chose. */}
          {unset === 7 ? "Not set yet." : unset > 0 ? `${unset} days unset.` : "Your week."}
        </h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[50ch]">
          Viewings can only be offered inside these hours. A day with nothing set is
          treated as closed, so nothing is offered on it at all.
        </p>
      </header>

      {failed && (
        <p role="alert" className="mb-4 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">
          {failed}
        </p>
      )}
      {message && (
        <p role="status" className="mb-4 px-3 py-2.5 border border-rule text-sm rounded-[3px] text-ink-2">
          {message}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          setFailed(null);
          save.mutate({ days: days.map(({ dayOfWeek, closed, start, end }) => ({ dayOfWeek, closed, start, end })) });
        }}
      >
        <div className="border-t border-ink">
          {days.map((d, i) => (
            <div
              key={d.dayOfWeek}
              className={cn(
                "flex items-center gap-3 py-3 border-b border-rule flex-wrap",
                d.closed && "opacity-60",
              )}
            >
              <span className="text-[15px] text-ink font-semibold w-[92px]">{d.name}</span>

              <label className="flex items-center gap-2 order-last w-full min-[560px]:order-none min-[560px]:w-auto min-[560px]:ml-auto">
                <input
                  type="checkbox"
                  checked={d.closed}
                  onChange={(e) => set(i, { closed: e.target.checked })}
                  className="size-5 accent-[var(--accent)]"
                />
                <span className="text-[14px] text-ink-2">Closed</span>
              </label>

              {/* Disabled rather than hidden. A closed day that loses its
                  times looks like data you have thrown away, and an owner
                  reopening Friday should find the hours they had. */}
              <input
                type="time"
                value={d.start}
                disabled={d.closed}
                onChange={(e) => set(i, { start: e.target.value })}
                aria-label={`${d.name} opening time`}
                className="min-h-11 px-3 text-[16px] bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink disabled:opacity-50"
              />
              <span className="text-ink-3 text-[14px]">to</span>
              <input
                type="time"
                value={d.end}
                disabled={d.closed}
                onChange={(e) => set(i, { end: e.target.value })}
                aria-label={`${d.name} closing time`}
                className="min-h-11 px-3 text-[16px] bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink disabled:opacity-50"
              />
            </div>
          ))}
        </div>

        <div className="flex mt-6">
          <Button type="submit" variant="primary" loading={save.isPending} className="ml-auto">
            Save the week
          </Button>
        </div>
      </form>
    </div>
  );
}
