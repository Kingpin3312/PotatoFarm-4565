"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Attaching an owner to a listing.
 *
 * Flagged rather than blocked everywhere else in the product — an offer
 * can be recorded without one, a listing can be created without one.
 * This is where it gets fixed, and the reason it matters is stated
 * rather than assumed: without an owner the weekly report has nobody to
 * go to and the Form F has nobody to sign it.
 */
export function AttachOwner({ listingId, current }: {
  listingId: string; current?: { id: string; name: string } | null;
}) {
  const attach = api.vendors.attach.useMutation();
  const [picked, setPicked] = useState("");

  if (current && !attach.isSuccess) {
    return (
      <div className="flex items-baseline gap-3 py-3 border-t border-rule">
        <span className="t-label text-ink-3">Owner</span>
        <span className="text-ui text-ink">{current.name}</span>
        <a href={`/vendors/${current.id}`} className="btn-inline ml-auto">Brief</a>
      </div>
    );
  }

  return (
    <div className="py-4 border-t border-rule">
      <span className="block t-label text-ink-3 mb-2">
        No owner on file
      </span>
      <p className="text-sm text-ink-2 mb-3 max-w-[46ch] leading-snug">
        The weekly report has nobody to go to, and the Form F has nobody to sign it. Attach
        one before you present an offer.
      </p>
      <div className="flex gap-2 flex-wrap">
        <label htmlFor="vsel" className="sr-only">Choose an owner</label>
        <input id="vsel" value={picked} onChange={(e) => setPicked(e.target.value)}
          placeholder="Owner ID"
          className="flex-1 min-w-[200px] min-h-11 px-4 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
        <Button variant="primary" loading={attach.isPending} disabled={!picked}
          onClick={() => attach.mutate({ listingId, vendorId: picked })}>
          Attach
        </Button>
        <a href="/vendors/new" className="btn-inline">Add a new one</a>
      </div>
    </div>
  );
}
