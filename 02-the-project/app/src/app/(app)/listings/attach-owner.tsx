"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Who owns a listing, and who looks after it.
 *
 * Flagged rather than blocked everywhere else in the product — an offer
 * can be recorded without an owner, a listing can be created without
 * one. This is where it gets fixed, and the reason it matters is stated
 * rather than assumed: without an owner the weekly report has nobody to
 * go to and the Form F has nobody to sign it.
 *
 * Owners were attached by typing an "Owner ID" — the database's internal
 * key, which no agent has ever seen — so in practice none could be. They
 * are picked by name now. And the agent is new: until `Listing.agentId`
 * existed the owner's report had to guess who should send it.
 */
export function AttachOwner({ listingId, current, agent }: {
  listingId: string;
  current?: { id: string; name: string } | null;
  agent?: { id: string } | null;
}) {
  const utils = api.useUtils();
  const refresh = () => void utils.listings.list.invalidate();
  const attach = api.vendors.attach.useMutation({ onSuccess: refresh });
  const setAgent = api.listings.update.useMutation({ onSuccess: refresh });
  const { data: owners } = api.vendors.list.useQuery(undefined, { enabled: !current });
  const { data: team } = api.org.members.useQuery();
  const [picked, setPicked] = useState("");

  const people = (team?.members ?? []).filter((m) => m.role !== "VIEWER" && m.role !== "COMPLIANCE_OFFICER");
  const error = attach.error?.message ?? setAgent.error?.message ?? null;
  const select = "min-h-11 px-3 text-control text-ink bg-sunk border border-rule rounded-lg";

  return (
    <div className="border-t border-rule">
      {current ? (
        <div className="flex items-baseline gap-3 py-3">
          <span className="t-label text-ink-3 w-[120px] shrink-0">Owner</span>
          <span className="text-ui text-ink">{current.name}</span>
          <a href={`/vendors/${current.id}`} className="btn-inline ms-auto">Brief</a>
        </div>
      ) : (
        <div className="py-4">
          <span className="block t-label text-ink-3 mb-2">No owner on file</span>
          <p className="text-sm text-ink-2 mb-3 max-w-[46ch] leading-snug">
            The weekly report has nobody to go to, and the Form F has nobody to sign it. Attach
            one before you present an offer.
          </p>
          <div className="flex gap-2 flex-wrap">
            <label htmlFor={`owner-${listingId}`} className="sr-only">Choose an owner</label>
            <select id={`owner-${listingId}`} value={picked} onChange={(e) => setPicked(e.target.value)}
              className={`${select} flex-1 min-w-[200px]`}>
              <option value="">{owners?.length ? "Choose an owner" : "No owners yet"}</option>
              {(owners ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <Button variant="primary" loading={attach.isPending} disabled={!picked}
              onClick={() => attach.mutate({ listingId, vendorId: picked })}>
              Attach
            </Button>
            <a href="/vendors/new" className="btn-inline">Add a new one</a>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 py-3 border-t border-rule flex-wrap">
        <label htmlFor={`agent-${listingId}`} className="t-label text-ink-3 w-[120px] shrink-0">Looked after by</label>
        <select id={`agent-${listingId}`} value={agent?.id ?? ""} disabled={setAgent.isPending}
          onChange={(e) => setAgent.mutate({ id: listingId, agentId: e.target.value || null })}
          className={`${select} min-w-[200px]`}>
          <option value="">Nobody yet</option>
          {people.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name ?? m.user.email}</option>)}
        </select>
        <span className="text-note text-ink-3 max-w-[36ch]">The owner&rsquo;s weekly report comes to them.</span>
      </div>
      {error && <p role="alert" className="text-sm text-danger pb-3">{error}</p>}
    </div>
  );
}
