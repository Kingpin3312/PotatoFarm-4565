"use client";

import { api } from "@/lib/trpc";

/**
 * My next two days.
 *
 * Deliberately short. A fortnight of viewings is a calendar; two days is
 * a plan an agent can hold in their head between appointments.
 */
export function MyViewings() {
  const { data, isLoading } = api.viewings.mine.useQuery({ days: 2 });
  // `viewings.mine` returns the array itself, not `{ viewings }`.
  const viewings = data ?? [];
  if (isLoading || viewings.length === 0) return null;

  return (
    <section>
      <h2 className="font-sans font-medium text-sub text-ink mb-3">Next two days</h2>
      <div className="border-t border-ink">
        {viewings.map((v) => (
          /* The person, not `/viewings#<id>`.
             
             That fragment matched no element — the viewing card carries
             no id — and the day view only ever shows today, so a row
             for Tuesday had nowhere to land even in principle. Every
             one of these rows is an appointment with somebody, and
             their page is the thing an agent wants before they set off. */
          <a key={v.id} href={`/blackbook/${v.lead.id}`}
             className="flex items-baseline gap-3 py-3 border-b border-rule no-underline">
            <span className="font-mono text-label text-ink-3 tabular w-24 shrink-0">
              {new Date(v.scheduledAt).toLocaleString("en-GB",
                { weekday: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="text-ui text-ink flex-1">{v.building ?? "—"}</span>
            <span className="text-sm text-ink-2 shrink-0">{(v.lead.name ?? v.lead.phone)}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
