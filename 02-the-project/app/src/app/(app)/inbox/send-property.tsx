"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/trpc";
import { aedWhole } from "@/lib/money";

/**
 * Put a property into the reply, as its page.
 *
 * The agent picks one of the brokerage's available properties and the
 * reply box fills with its name, its price and the link to its page —
 * which WhatsApp shows as the brokerage's preview card. It goes into the
 * box rather than straight out: a person reads it and presses Send, the
 * same rule as every other message to a client.
 */
export function SendProperty({ onInsert }: { onInsert: (text: string) => void }) {
  const utils = api.useUtils();
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // A pause before asking, so each keystroke is not a query.
  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 250);
    return () => clearTimeout(t);
  }, [typed]);

  const { data, isLoading } = api.listings.list.useQuery({
    status: "AVAILABLE", search: search || undefined, limit: 6, sort: "updated",
  });

  async function pick(id: string) {
    setBusy(id);
    setProblem(null);
    try {
      const r = await utils.listings.share.fetch({ id });
      if (!r.ok) { setProblem(r.reason); return; }
      const price = r.priceFils === null ? null : aedWhole(r.priceFils);
      const line = price ? `${r.title}, ${price}${r.purpose === "RENT" ? " a year" : ""}.` : `${r.title}.`;
      onInsert(`${line}\n${location.origin}${r.path}`);
    } catch {
      setProblem("Could not reach the property. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border border-rule rounded-[3px] p-3 max-w-[560px]">
      <label htmlFor="property-search" className="t-label text-ink-3 block mb-1.5">Which property?</label>
      <input
        id="property-search"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Reference, name or building"
        className="w-full min-h-11 px-3 text-control bg-transparent border border-rule rounded-[3px] text-ink focus:outline-none focus:border-accent"
      />
      <ul className="mt-2">
        {isLoading && <li className="py-2 text-sm text-ink-3">Looking…</li>}
        {data?.rows.length === 0 && <li className="py-2 text-sm text-ink-3">No available property matches.</li>}
        {data?.rows.map((l) => (
          <li key={l.id}>
            <button type="button" onClick={() => pick(l.id)} disabled={busy !== null}
              className="w-full min-h-11 flex items-baseline gap-3 px-2 py-2 text-start rounded-[3px] hover:bg-sunk disabled:opacity-60 focus-visible:outline-none focus-visible:shadow-[var(--ring)]">
              <span className="font-mono text-label text-ink-3 shrink-0">{l.reference}</span>
              <span className="text-sm text-ink flex-1 min-w-0 truncate">{l.title}</span>
              <span className="text-note text-ink-3 tabular shrink-0">
                {busy === l.id ? "Adding…" : l.priceFils === null ? "" : aedWhole(l.priceFils)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {problem && <p role="alert" className="mt-2 text-sm text-ink-2">{problem}</p>}
    </div>
  );
}
