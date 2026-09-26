"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { aedShort, filsToAed } from "@/lib/money";

/**
 * What they are looking for.
 *
 * Matching, "who wants this property" and search all read this, and
 * until it existed an agent had nowhere to write "3-bed in the Marina,
 * up to 3m" except a free-text note none of them can read. So a buyer
 * who told their agent exactly what they wanted was never offered it.
 */
type Row = {
  id: string;
  active: boolean;
  purpose: "SALE" | "RENT";
  intent: "BUY_TO_LIVE" | "BUY_TO_INVEST" | "RENT" | "SELL" | null;
  budgetMinFils: bigint | null;
  budgetMaxFils: bigint | null;
  bedroomsMin: number | null;
  communities: string[];
  preferences: string[];
  propertyTypes: string[];
  completion: "READY" | "OFF_PLAN" | null;
  source: string;
  unsure: boolean;
};

/** "Buying to invest · 3+ bed · Dubai Marina or JBR · up to AED 3.0M" */
function summary(r: Row): string {
  const why =
    r.purpose === "RENT" ? "Renting"
    : r.intent === "BUY_TO_INVEST" ? "Buying to invest"
    : r.intent === "BUY_TO_LIVE" ? "Buying to live in"
    : "Buying";
  const beds = r.bedroomsMin === null ? null : r.bedroomsMin === 0 ? "studio or bigger" : `${r.bedroomsMin}+ bed`;
  const where = r.communities.length ? r.communities.join(" or ") : null;
  const kind = [
    r.completion === "OFF_PLAN" ? "off-plan" : r.completion === "READY" ? "ready" : null,
    r.propertyTypes.length ? r.propertyTypes.map((t) => TYPE_LABEL[t] ?? t).join(" or ").toLowerCase() : null,
  ].filter(Boolean).join(" ") || null;
  const money =
    r.budgetMinFils !== null && r.budgetMaxFils !== null ? `${aedShort(r.budgetMinFils)}–${aedShort(r.budgetMaxFils).replace("AED ", "")}`
    : r.budgetMaxFils !== null ? `up to ${aedShort(r.budgetMaxFils)}`
    : r.budgetMinFils !== null ? `from ${aedShort(r.budgetMinFils)}`
    : null;
  return [why, kind, beds, where, money].filter(Boolean).join(" · ");
}

export const TYPE_LABEL: Record<string, string> = {
  APARTMENT: "Apartment", VILLA: "Villa", TOWNHOUSE: "Townhouse", PENTHOUSE: "Penthouse", DUPLEX: "Duplex",
  PLOT: "Plot", OFFICE: "Office", RETAIL: "Retail", WAREHOUSE: "Warehouse", OTHER: "Other",
};

/** "3,000,000", "3m", "2.5 million", "800k" → dirhams. Blank is none. */
export function readAed(text: string): number | null | "bad" {
  const t = text.trim().toLowerCase().replace(/,/g, "").replace(/^aed\s*/, "");
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(m|mn|million|k|thousand)?$/);
  if (!m) return "bad";
  const n = Number(m[1]);
  const unit = m[2] ?? "";
  const v = unit.startsWith("m") ? n * 1_000_000 : unit.startsWith("k") || unit === "thousand" ? n * 1_000 : n;
  return Math.round(v);
}

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const plain = (fils: bigint | null) => (fils === null ? "" : filsToAed(fils).toLocaleString("en-GB"));

export function Requirements({ leadId }: { leadId: string }) {
  const utils = api.useUtils();
  const { data } = api.requirements.forLead.useQuery({ leadId });
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const done = () => { setEditing(null); setProblem(null); void utils.requirements.forLead.invalidate({ leadId }); };
  const save = api.requirements.save.useMutation({ onSuccess: done });
  const close = api.requirements.close.useMutation({ onSuccess: done });

  if (!data) return null;
  const live = (data as Row[]).filter((r) => r.active);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProblem(null);
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    const lo = readAed(get("budgetMin"));
    const hi = readAed(get("budgetMax"));
    if (lo === "bad" || hi === "bad") {
      setProblem("Budgets are in dirhams — 3,000,000 or 3m.");
      return;
    }
    const beds = get("bedrooms");
    const purpose = get("purpose") === "RENT" ? "RENT" : "SALE";
    save.mutate({
      leadId,
      id: editing && editing !== "new" ? editing.id : undefined,
      purpose,
      intent: purpose === "RENT" ? "RENT" : ((get("intent") || null) as "BUY_TO_LIVE" | "BUY_TO_INVEST" | null),
      budgetMinAed: lo,
      budgetMaxAed: hi,
      bedroomsMin: beds === "" ? null : Number(beds),
      communities: list(get("communities")),
      preferences: list(get("preferences")),
      propertyTypes: f.getAll("propertyTypes").map(String) as ("APARTMENT" | "VILLA")[],
      completion: (get("completion") || null) as "READY" | "OFF_PLAN" | null,
    });
  }

  const form = (r: Row | null) => (
    <form onSubmit={submit} className="mt-3 grid gap-4 sm:grid-cols-2" aria-label="What they're looking for">
      <Select name="purpose" label="Buying or renting" defaultValue={r?.purpose ?? "SALE"}
        options={[["SALE", "Buying"], ["RENT", "Renting"]]} />
      <Select name="intent" label="Buying to" defaultValue={r?.intent === "RENT" ? "" : (r?.intent ?? "")}
        options={[["", "Not said"], ["BUY_TO_LIVE", "Live in"], ["BUY_TO_INVEST", "Invest"]]} />
      <fieldset className="sm:col-span-2">
        <legend className="t-label text-ink-3 mb-1.5">Type (leave all clear for any)</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(TYPE_LABEL).map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-2 min-h-11 text-ui text-ink">
              <input type="checkbox" name="propertyTypes" value={v} defaultChecked={r?.propertyTypes.includes(v)}
                className="w-5 h-5 accent-[var(--accent)]" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <Select name="completion" label="Ready or off-plan" defaultValue={r?.completion ?? ""}
        options={[["", "Either"], ["READY", "Ready to move in"], ["OFF_PLAN", "Off-plan"]]} />
      <div className="hidden sm:block" />
      <Input name="communities" label="Areas, separated by commas" placeholder="Dubai Marina, JBR"
        defaultValue={r?.communities.join(", ") ?? ""} className="sm:col-span-2" />
      <Input name="bedrooms" label="Bedrooms, at least" type="number" min={0} max={12} inputMode="numeric"
        placeholder="0 for a studio" defaultValue={r?.bedroomsMin ?? ""} />
      <div className="hidden sm:block" />
      <Input name="budgetMin" label="Budget from (AED)" inputMode="decimal" placeholder="2,000,000"
        defaultValue={plain(r?.budgetMinFils ?? null)} />
      <Input name="budgetMax" label="Budget up to (AED)" inputMode="decimal" placeholder="3m"
        defaultValue={plain(r?.budgetMaxFils ?? null)} />
      <Input name="preferences" label="Must-haves, separated by commas" placeholder="Sea view, high floor"
        defaultValue={r?.preferences.join(", ") ?? ""} className="sm:col-span-2" />
      <div className="flex gap-3 items-center sm:col-span-2">
        <Button type="submit" variant="primary" loading={save.isPending}>Save</Button>
        <button type="button" className="btn-inline min-h-11" onClick={() => { setEditing(null); setProblem(null); }}>
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <section className="mb-10" aria-labelledby="req-heading">
      <h2 id="req-heading" className="font-sans font-medium text-sub text-ink mb-1">What they&rsquo;re looking for</h2>

      {live.length === 0 && editing === null && (
        <p className="text-sm text-ink-3 mt-1 max-w-[52ch]">
          Nothing recorded yet, so they won&rsquo;t be matched to any property. Add what they told you.
        </p>
      )}

      <ul className="mt-2 space-y-3">
        {live.map((r) =>
          editing !== "new" && editing?.id === r.id ? (
            <li key={r.id}>{form(r)}</li>
          ) : (
            <li key={r.id} data-requirement={r.id}>
              <p className="text-ui text-ink">{summary(r)}</p>
              {r.preferences.length > 0 && (
                <p className="text-sm text-ink-2 mt-0.5">Must have: {r.preferences.join(", ")}</p>
              )}
              {r.source === "ASSISTANT" && (
                <p className="text-sm text-ink-3 mt-0.5">
                  {r.unsure ? "From the chat, and the assistant wasn’t sure — check it with them." : "From the chat. Saving it makes it yours."}
                </p>
              )}
              <div className="flex gap-x-6 mt-1">
                <button type="button" className="btn-inline min-h-11" onClick={() => setEditing(r)}>Change</button>
                <button type="button" className="btn-inline min-h-11" disabled={close.isPending}
                  onClick={() => close.mutate({ id: r.id })}>
                  No longer looking for this
                </button>
              </div>
            </li>
          ),
        )}
      </ul>

      {editing === "new" ? form(null) : editing === null && (
        <button type="button" className="btn-inline min-h-11 mt-1" onClick={() => setEditing("new")}>
          {live.length ? "Add another search" : "Add what they’re looking for"}
        </button>
      )}

      {(problem || save.error || close.error) && (
        <p role="alert" className="text-sm text-danger mt-2 max-w-[52ch]">
          {problem ?? save.error?.message ?? close.error?.message}
        </p>
      )}
    </section>
  );
}

/** 16px on every input — below that iOS zooms the page on focus. */
function Input({ name, label, className, ...rest }:
  { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="t-label text-ink-3">{label}</span>
      <input name={name} autoComplete="off"
        className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
        {...rest} />
    </label>
  );
}

function Select({ name, label, options, defaultValue }:
  { name: string; label: string; options: [string, string][]; defaultValue: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="t-label text-ink-3">{label}</span>
      <select name={name} defaultValue={defaultValue}
        className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
