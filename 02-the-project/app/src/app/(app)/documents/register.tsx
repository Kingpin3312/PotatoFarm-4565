"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";

/**
 * What expires, when, and who it stops.
 *
 * Three documents here stop business when they lapse — the Trakheesi
 * permit, an agent's RERA broker card and the brokerage licence — and
 * all three fail silently: nothing errors, a transaction simply cannot
 * proceed, and somebody finds out on the day it matters.
 *
 * So the screen leads with the consequence rather than the date. "Expires
 * in 12 days" is a fact; "this agent cannot legally act on a transaction
 * once it lapses" is the reason anybody does something about it.
 */
export function Register({ filter }: { filter: "all" | "expiring" }) {
  const [showing, setShowing] = useState<"all" | "expiring">(filter);
  const { data, isLoading, isError, refetch, error } =
    api.documents.register.useQuery({ filter: showing });
  const [adding, setAdding] = useState(false);

  if (isError) return <QueryError retry={() => void refetch()} what="the document register" error={error} />;
  if (isLoading) {
    return <div className="max-w-[760px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>;
  }

  const { rows, total, needingAttention, blockingCount, canWrite } = data!;

  return (
    <div className="max-w-[760px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="t-label text-ink-3 block mb-3">
          Documents
        </span>
        <h1 className="font-sans font-semibold text-page text-ink">
          {total === 0
            ? "Nothing recorded yet."
            : needingAttention === 0
              ? "Nothing lapsing."
              : `${needingAttention} need${needingAttention === 1 ? "s" : ""} renewing.`}
        </h1>
        {blockingCount > 0 && (
          <p className="text-sm mt-3 max-w-[52ch]" style={{ color: "var(--danger-deep)" }}>
            {blockingCount} of {blockingCount === 1 ? "them stops" : "them stop"} work when
            {blockingCount === 1 ? " it lapses" : " they lapse"}.
          </p>
        )}
        {total === 0 && (
          <p className="text-sub text-ink-2 mt-3 max-w-[48ch]">
            Broker cards, the brokerage licence and Trakheesi permits all expire, and none of
            them warn you. Record the dates here and you get told sixty days out, which is how
            long a card actually takes to renew.
          </p>
        )}
      </header>

      <div className="flex gap-2 flex-wrap mb-6">
        {(["all", "expiring"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setShowing(f)}
            aria-pressed={showing === f}
            className={cn(
              "min-h-11 px-3 rounded-lg border text-ui",
              showing === f
                ? "bg-accent text-on-accent border-accent-edge font-medium"
                : "border-rule text-ink",
            )}
          >
            {f === "all" ? `Everything (${total})` : `Needs renewing (${needingAttention})`}
          </button>
        ))}
        {/* Offered to everyone who can see the register, not only to
            `canWrite`. Anybody may record a document that belongs to
            them — the broker card case — and the server refuses the rest
            by name. Hiding the button from an agent would hide the one
            document they are the only person who can chase. */}
        <Button variant="secondary" className="ml-auto" onClick={() => setAdding((a) => !a)}>
          {adding ? "Cancel" : "Record one"}
        </Button>
      </div>

      {adding && <RecordForm canWrite={canWrite} onDone={() => { setAdding(false); void refetch(); }} />}

      {rows.length === 0 && total > 0 && (
        <p className="text-sub text-ink-2 max-w-[44ch]">
          Nothing in this list. Everything recorded is current.
        </p>
      )}

      {rows.length > 0 && (
        <div className="border-t border-ink">
          {rows.map((d) => (
            <article key={d.id} data-document={d.id} className="py-4 border-b border-rule">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-sans font-medium text-sub text-ink">{d.typeLabel}</span>
                <span className="text-sm text-ink-2">{d.ownerName}</span>
                <span
                  className="ml-auto t-label"
                  style={{
                    color:
                      d.state === "expired" ? "var(--danger-deep)"
                      : d.state === "expiring" ? "var(--tertiary)"
                      : "var(--ink-3)",
                  }}
                >
                  {d.expiresAt == null
                    ? "no expiry"
                    : d.state === "expired"
                      ? `expired ${Math.abs(d.daysLeft ?? 0)}d ago`
                      : `${d.daysLeft}d left`}
                </span>
              </div>

              {/* The consequence, not the date. A row that says "12 days"
                  is information; a row that says what stops is a reason
                  to pick up the phone. Shown only when it applies. */}
              {d.state !== "valid" && d.consequence && (
                <p className={cn("text-sm mt-1.5 max-w-[54ch] leading-snug", d.blocking ? "text-ink" : "text-ink-2")}>
                  {d.consequence}
                </p>
              )}

              <div className="flex gap-2 mt-2 flex-wrap items-center">
                {d.reference && (
                  <span className="t-label px-2 py-0.5 border border-rule rounded-[3px] text-ink-3">
                    {d.reference}
                  </span>
                )}
                {!d.hasFile && (
                  <span className="t-label text-ink-3">
                    no scan on file
                  </span>
                )}
                {d.verifiedAt ? (
                  <span className="t-label text-ink-3">checked</span>
                ) : canWrite ? (
                  <Verify id={d.id} onDone={() => void refetch()} />
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Verify({ id, onDone }: { id: string; onDone: () => void }) {
  const verify = api.documents.verify.useMutation({ onSuccess: onDone });
  return (
    <button className="btn-inline" disabled={verify.isPending} onClick={() => verify.mutate({ id })}>
      I have seen it
    </button>
  );
}

/**
 * Recording one.
 *
 * The owner is picked before the type, because the type list depends on
 * it — offering `TRAKHEESI_PERMIT` against a person is how a permit ends
 * up filed on an agent and warns nobody about the listing.
 */
function RecordForm({ canWrite, onDone }: { canWrite: boolean; onDone: () => void }) {
  const { data } = api.documents.options.useQuery();
  const [ownerType, setOwnerType] = useState<"USER" | "LISTING" | "ORGANISATION" | "LEAD" | "DEAL">("USER");
  const [ownerId, setOwnerId] = useState("");
  const [type, setType] = useState("");
  const [reference, setReference] = useState("");
  const [expires, setExpires] = useState("");
  const [failed, setFailed] = useState<string | null>(null);

  const record = api.documents.record.useMutation({
    onSuccess: () => { setFailed(null); onDone(); },
    onError: (e) => setFailed(e.message),
  });

  if (!data) return null;

  const owner = data.owners.find((o) => o.value === ownerType);
  const rule = data.rules.find((r) => r.type === type);
  const needsOwnerId = ownerType !== "ORGANISATION";
  const choices =
    // An agent can only record against themselves, so they are offered
    // only themselves. Listing every colleague and then refusing the
    // save is a form that lets you finish before telling you.
    ownerType === "USER" ? (canWrite ? data.people : data.people.filter((p) => p.id === data.me))
    : ownerType === "LISTING" ? data.listings
    : [];

  return (
    <form
      className="bg-sunk rounded-xl p-5 mb-8 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setFailed(null);
        record.mutate({
          ownerType,
          ownerId: needsOwnerId ? ownerId : undefined,
          type: type as never,
          reference: reference.trim() || undefined,
          // Midday UTC, for the same reason as an away date: a date
          // picked in Dubai and stored at 00:00Z is the previous day to
          // anyone reading it four hours behind, and this one decides
          // whether an agent is warned in time.
          expiresAt: expires ? new Date(`${expires}T12:00:00.000Z`) : null,
        });
      }}
    >
      {failed && (
        <p role="alert" className="px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">{failed}</p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-note text-ink-3">Belongs to</span>
        <select
          value={ownerType}
          onChange={(e) => {
            setOwnerType(e.target.value as typeof ownerType);
            setOwnerId("");
            setType("");
          }}
          className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink"
        >
          <option value="USER">An agent</option>
          <option value="ORGANISATION">The brokerage</option>
          <option value="LISTING">A property</option>
          <option value="LEAD">A client</option>
          <option value="DEAL">A transaction</option>
        </select>
      </label>

      {needsOwnerId && choices.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-note text-ink-3">Which one</span>
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink"
          >
            <option value="">Pick one</option>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.id === data.me ? " (you)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {needsOwnerId && choices.length === 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-note text-ink-3">Reference of the record it belongs to</span>
          <input
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink"
          />
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-note text-ink-3">Document</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink"
        >
          <option value="">Pick one</option>
          {owner?.types.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>

      <div className="flex gap-3 flex-wrap">
        <label className="flex flex-col gap-1">
          <span className="text-note text-ink-3">Number (optional)</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="BRN 12345"
            className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-note text-ink-3">Expires{rule ? "" : " (optional)"}</span>
          <input
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            aria-label="Expiry date"
            className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink"
          />
        </label>
      </div>

      {/* The lead time comes from how long the renewal actually takes.
          Saying so here is what stops somebody reading a 14-day warning
          on a permit as stingy next to 90 on a licence. */}
      {rule && (
        <p className="text-note text-ink-3 max-w-[52ch] leading-snug">
          You will be warned {rule.warnDays} days out — that is how long this one takes to renew.
          {rule.blocking ? " Work stops when it lapses." : ""}
        </p>
      )}

      <div className="flex">
        <Button
          type="submit"
          variant="primary"
          className="ml-auto"
          loading={record.isPending}
          disabled={!type || (needsOwnerId && !ownerId)}
        >
          Record it
        </Button>
      </div>
    </form>
  );
}
