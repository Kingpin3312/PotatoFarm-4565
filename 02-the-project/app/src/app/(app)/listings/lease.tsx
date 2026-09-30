"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { aedWhole } from "@/lib/money";

/**
 * The lease on a rental.
 *
 * Recording it is what brings the renewal back: ten days before the
 * ninety-day notice line, the agent gets a task naming the date
 * (`lib/tenancy/renewals.ts`). A rental let with no lease on file is a
 * renewal nobody is reminded of.
 */
const day = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function Lease({ listingId }: { listingId: string }) {
  const utils = api.useUtils();
  const { data } = api.tenancies.forListing.useQuery({ listingId });
  const [adding, setAdding] = useState(false);
  const done = () => {
    setAdding(false);
    void utils.tenancies.forListing.invalidate({ listingId });
    void utils.listings.list.invalidate();
  };
  const record = api.tenancies.record.useMutation({ onSuccess: done });
  const end = api.tenancies.end.useMutation({ onSuccess: done });

  if (!data) return null;
  const live = data.find((t) => !t.endedAt);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => (f.get(k) as string | null)?.trim() || undefined;
    const n = (k: string) => { const v = s(k); return v ? Number(v.replace(/,/g, "")) : undefined; };
    const iso = (k: string) => new Date(`${s(k)}T12:00:00.000Z`).toISOString();
    record.mutate({
      listingId, tenantName: s("tenantName"), startsAt: iso("startsAt"), endsAt: iso("endsAt"),
      rentAed: n("rentAed") ?? 0, cheques: n("cheques"), depositAed: n("depositAed"), ejariNumber: s("ejariNumber"),
    });
  }

  return (
    <section className="mt-5 pt-4 border-t border-rule" aria-label="Lease">
      <h3 className="text-ui font-medium text-ink">Lease</h3>
      {live && !adding ? (
        <div className="mt-1" data-lease={live.id}>
          <p className="text-ui text-ink">
            {live.tenantName ?? "Tenant"} · {aedWhole(live.rentFils)} a year
            {live.cheques ? ` in ${live.cheques} cheque${live.cheques === 1 ? "" : "s"}` : ""}
          </p>
          <p className="text-sm text-ink-2">
            {day(live.startsAt)} to {day(live.endsAt)}{live.ejariNumber ? ` · Ejari ${live.ejariNumber}` : ""}
            {live.renewalTaskAt ? " · renewal is on the agent’s list" : ""}
          </p>
          <div className="flex gap-x-6">
            <button type="button" className="btn-inline min-h-11" onClick={() => setAdding(true)}>Record the renewal</button>
            <button type="button" className="btn-inline min-h-11" disabled={end.isPending}
              onClick={() => { if (window.confirm("End this lease now and put the property back on the market?")) end.mutate({ id: live.id }); }}>
              Ended early
            </button>
          </div>
        </div>
      ) : !adding ? (
        <>
          <p className="text-sm text-ink-3 mt-1 max-w-[56ch]">
            No lease on file. Record it when it is let, and the renewal comes back to you before the
            90-day notice line.
          </p>
          <button type="button" className="btn-inline min-h-11" onClick={() => setAdding(true)}>Record a lease</button>
        </>
      ) : (
        <form onSubmit={submit} className="grid grid-cols-2 gap-3 mt-3 max-w-[560px]">
          <In name="tenantName" label="Tenant" />
          <In name="ejariNumber" label="Ejari number" />
          <In name="startsAt" label="Starts" type="date" required />
          <In name="endsAt" label="Ends" type="date" required />
          <In name="rentAed" label="Rent a year (AED)" inputMode="decimal" required />
          <In name="cheques" label="Cheques" type="number" inputMode="numeric" />
          <In name="depositAed" label="Deposit (AED)" inputMode="decimal" />
          <div className="col-span-2 flex gap-3 items-center">
            <Button type="submit" variant="primary" size="sm" loading={record.isPending}>Save the lease</Button>
            <button type="button" className="btn-inline min-h-11" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}
      {(record.error ?? end.error) && (
        <p role="alert" className="text-sm text-danger mt-2">{(record.error ?? end.error)!.message}</p>
      )}
    </section>
  );
}

/** 16px on every input — below that iOS zooms the page on focus. */
function In({ name, label, ...rest }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="t-label text-ink-3">{label}</span>
      <input name={name} autoComplete="off"
        className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink" {...rest} />
    </label>
  );
}
