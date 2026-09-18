"use client";

import { use, useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";
import { sentence } from "@/lib/sentence";

/**
 * The negotiation.
 *
 * An agent could record an offer and then do nothing with it — present,
 * counter and accept were all mounted with no screen. This is the
 * twenty minutes the whole job is about.
 *
 * Every action here creates a row. Nothing overwrites the amount,
 * because the history is what a vendor asks for and what an agent needs
 * when a commission is disputed six months on.
 */
/**
 * The route segment is a **listing** id, and the folder now says so.
 *
 * It was `offers/[id]`, which reads as an offer id and is not one —
 * this screen ranks every offer on one property against each other, so
 * the property is the thing it is keyed by. Nothing linked here at all,
 * so nobody had ever found out the hard way.
 *
 * What did link somewhere was the offers list, whose rows pointed at
 * `/listings/<id>` — a route that does not exist and returned a 404 on
 * every click. Both were fixed by the same change: the rows point here.
 */
export default function OfferThread({ params }: { params: Promise<{ listingId: string }> }) {
  // Next 15 hands `params` to a page as a Promise. This component is
  // a client component, so `use()` is how it is unwrapped — reading
  // `id` straight off it yields undefined, and the query
  // below would have run against nothing.
  const { listingId } = use(params);
  const { data, isLoading, isError, refetch, error } =
    api.offers.onListing.useQuery({ listingId });
  const presented = api.offers.presented.useMutation({ onSuccess: () => void refetch() });
  const counter   = api.offers.counter.useMutation({ onSuccess: () => { setAmt(""); void refetch(); } });
  const accept    = api.offers.accept.useMutation({ onSuccess: () => void refetch() });

  const [open, setOpen]   = useState<string | null>(null);
  const [amt, setAmt]     = useState("");
  const [by, setBy]       = useState<"BUYER"|"VENDOR"|"AGENT">("VENDOR");
  const [confirming, setConfirming] = useState<string | null>(null);

  if (isError) return <QueryError retry={() => void refetch()} what="the offers" error={error} />;
  if (isLoading) return <div className="max-w-[1180px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>;

  const offers = [...(data?.offers ?? [])].sort((a, b) => b.strength - a.strength);
  const property = data?.property;

  return (
    <div className="max-w-[1180px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        {/* Which property, which is what this screen could not say.
        
            The heading was "3 offers" and nothing else. This page is
            keyed by a listing and ranks every bid on it — so an agent
            arriving from a link, or a manager sent one, had no way to
            tell which of sixteen properties it was about. The reference
            is what they quote on the phone, so it leads. */}
        <span className="t-label text-ink-3 block mb-3">
          {property ? `On the table · ${property.reference}` : "On the table"}
        </span>
        <h1 className="font-sans font-semibold text-page text-ink">
          {offers.length} offer{offers.length === 1 ? "" : "s"}
        </h1>
        {property && (
          <p className="text-ui text-ink-2 mt-2">
            {property.title}
          </p>
        )}
        {offers.length > 1 && (
          <p className="text-sm text-ink-2 mt-3 max-w-[48ch]">
            Ordered by whether the buyer can actually complete, not by the number. Cash with
            no conditions beats a higher offer subject to a mortgage nobody applied for.
          </p>
        )}

        {/* "0 offers" and nothing else was the whole screen for a
            property with none — twenty-one characters, which reads as a
            page that failed to load rather than a property nobody has
            bid on. It only became reachable when the offers list was
            pointed here, so nobody had seen it. */}
        {offers.length === 0 && (
          <p className="text-sm text-ink-2 mt-3 max-w-[48ch]">
            Nothing has been offered on this property yet. When something is, it appears
            here ranked by whether the buyer can actually complete — not by the number.
          </p>
        )}
      </header>

      {accept.data?.toTell?.length ? (
        // Returned rather than auto-notified. A buyer whose offer just
        // lost hears it from their agent, not a push notification.
        <div className="bg-sunk rounded-xl p-5 border-s-[3px] border-s-accent-edge mb-8">
          <p className="text-control text-ink font-medium">
            {accept.data.toTell.length} {accept.data.toTell.length === 1 ? "buyer needs" : "buyers need"} a call
          </p>
          <p className="text-sm text-ink-2 mt-1.5 max-w-[46ch] leading-snug">
            Their offers closed when you accepted. Ring them today — they'll find out from the
            portal otherwise.
          </p>
        </div>
      ) : null}

      {/* The offers left, the property they are on to the right.
      
          Widened from 680px, which left half of a 1440px screen empty
          on the screen carrying this product's central argument — that
          strength beats price. The rail is the context a manager opening
          a link needs and had no way to get: what is being asked, who
          owns it, and how many bids are in. */}
      <div className="grid gap-x-12 gap-y-8 min-[1100px]:grid-cols-[minmax(0,1fr)_300px] items-start">
      <div className="min-w-0">
      <div className="border-t border-ink">
        {offers.map((o, i) => (
          <article key={o.id} className="py-5 border-b border-rule">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="font-sans font-semibold text-title text-ink tabular">
                {o.current}
              </span>
              {o.current !== o.opened && (
                <span className="font-mono text-label text-ink-3">
                  opened {o.opened} · moved {o.moves}×
                </span>
              )}
              {i === 0 && offers.length > 1 && (
                <span className="ms-auto t-label text-accent-deep font-semibold">
                  Strongest, not highest
                </span>
              )}
            </div>

            <div className="flex gap-2 mt-2.5 flex-wrap">
              <Tag good={o.financing === "CASH"}>{o.financing.toLowerCase()}</Tag>
              {o.financing === "MORTGAGE" && (
                <Tag good={o.preApproved}>{o.preApproved ? "pre-approved" : "not pre-approved"}</Tag>
              )}
              {o.conditions && <Tag>conditional</Tag>}
              {o.expiresAt && <Expiry at={o.expiresAt} />}
            </div>

            {o.history.length > 0 && (
              <ol className="mt-3 space-y-1.5">
                {o.history.map((h, j) => (
                  <li key={j} className="text-sm text-ink-2">
                    <span className="t-label text-ink-3 me-2">
                      {sentence(h.by)}
                    </span>
                    {h.amount ?? h.kind.toLowerCase()}
                    {h.note && <span className="text-ink-3"> — {h.note}</span>}
                  </li>
                ))}
              </ol>
            )}

            <div className="flex gap-2 mt-4 flex-wrap">
              <button className="btn-inline" onClick={() => presented.mutate({ offerId: o.id })}>
                Shown to the vendor
              </button>
              <button className="btn-inline" onClick={() => setOpen(open === o.id ? null : o.id)}>
                Counter
              </button>
              <button className="btn-inline" onClick={() => setConfirming(o.id)}>Accept</button>
            </div>

            {open === o.id && (
              <div className="mt-4 bg-sunk rounded-xl p-4">
                <div className="flex gap-2 mb-3 flex-wrap">
                  {(["VENDOR","BUYER","AGENT"] as const).map((k) => (
                    <button key={k} onClick={() => setBy(k)} aria-pressed={by === k}
                      className={cn("min-h-11 px-3 rounded-lg border text-ui",
                        by === k ? "bg-accent text-on-accent border-accent-edge font-medium"
                                 : "border-rule text-ink")}>
                      {sentence(k)} came back
                    </button>
                  ))}
                </div>
                <label htmlFor={`c-${o.id}`} className="sr-only">Counter amount in dirhams</label>
                <input id={`c-${o.id}`} type="number" inputMode="decimal" value={amt}
                  onChange={(e) => setAmt(e.target.value)} placeholder="Amount in dirhams"
                  className="w-full min-h-11 px-4 text-control text-ink bg-raised border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
                <Button variant="primary" className="mt-3" loading={counter.isPending}
                  disabled={!Number(amt)}
                  onClick={() => counter.mutate({ offerId: o.id, by, amountAed: Number(amt) })}>
                  Record the counter
                </Button>
              </div>
            )}

            {/* Accepting closes every other live offer. That is
                irreversible enough to be worth a sentence, not a
                yes/no dialog nobody reads. */}
            {confirming === o.id && (
              <div className="mt-4 bg-sunk rounded-xl p-4 border-s-[3px] border-s-accent-edge">
                <p className="text-ui text-ink">
                  Accepting {o.current} closes {offers.length - 1} other
                  {offers.length === 2 ? " offer" : " offers"} on this listing and starts the
                  deal.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button variant="primary" loading={accept.isPending}
                    onClick={() => { accept.mutate({ offerId: o.id }); setConfirming(null); }}>
                    Accept it
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirming(null)}>Not yet</Button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
      </div>

      {property && (
        <aside
          aria-label="The property"
          className="rounded-xl border border-rule bg-sunk p-5
                     min-[1100px]:sticky min-[1100px]:top-6"
        >
          <span className="t-label text-ink-3">Asking</span>
          <p className="mt-1.5 font-sans text-title font-semibold leading-none text-ink tabular">
            {property.asking}
          </p>
          <p className="mt-2 text-note leading-snug text-ink-3">
            {property.community}
            {property.bedrooms != null && ` · ${property.bedrooms} bed`}
          </p>

          <dl className="mt-5 border-t border-rule">
            {([
              ["Reference", property.reference],
              ["Status", sentence(property.status)],
              ["Offers in", String(offers.length)],
            ] as const).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 border-b border-rule py-2.5">
                <dt className="text-sm text-ink-3">{k}</dt>
                <dd className="font-mono text-control tabular text-ink">{v}</dd>
              </div>
            ))}
          </dl>

          {/* The owner, because the next thing an agent does after
              reading this page is ring them. */}
          {property.vendor ? (
            <a href={`/vendors/${property.vendor.id}`}
               className="mt-4 inline-block text-sm text-accent-deep no-underline">
              {property.vendor.name} &rarr;
            </a>
          ) : (
            <p className="mt-4 text-sm text-ink-3 leading-snug">
              No owner on file. Nobody can sign the Form F until there is.
            </p>
          )}
        </aside>
      )}
      </div>
    </div>
  );
}

function Tag({ children, good }: { children: React.ReactNode; good?: boolean }) {
  return (
    <span className={cn("t-label px-2 py-0.5 border rounded-[3px]",
      good ? "border-accent-edge text-accent-deep font-semibold" : "border-rule text-ink-3")}>
      {children}
    </span>
  );
}

function Expiry({ at }: { at: Date | string }) {
  const h = Math.round((new Date(at).getTime() - Date.now()) / 3_600_000);
  return (
    <span className={cn("t-label px-2 py-0.5 border rounded-[3px]",
      h <= 24 ? "border-danger text-danger font-semibold" : "border-rule text-ink-3")}>
      {h <= 0 ? "expired" : `${h}h left`}
    </span>
  );
}
