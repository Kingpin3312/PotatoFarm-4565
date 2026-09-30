"use client";

import { useState } from "react";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/lib/trpc";
import { Button, buttonStyles } from "@/components/ui/button";
import { aedWhole } from "@/lib/money";
import { sentence } from "@/lib/sentence";

/**
 * Who this person is, and the one place to correct it.
 *
 * This page showed a note and a history and never said who the person
 * was, and nothing anywhere could change what the product held about
 * them — a misheard name, a revised budget and a visa renewal date were
 * all fixed at whatever was first written.
 *
 * The phone number is shown and not editable. It is their WhatsApp
 * identity; `leads.update` says why a new number is a new lead.
 */
const INTENTS = [
  ["BUY_TO_LIVE", "Buy to live in"],
  ["BUY_TO_INVEST", "Buy to invest"],
  ["RENT", "Rent"],
  ["SELL", "Sell"],
  ["LIST", "List with us"],
] as const;
const FINANCING = [["CASH", "Cash"], ["MORTGAGE", "Mortgage"], ["UNKNOWN", "Not sure yet"]] as const;

const input = "w-full min-h-11 px-3 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]";

export function Details({ leadId }: { leadId: string }) {
  const utils = api.useUtils();
  const { data } = api.leads.detail.useQuery({ leadId });
  const [editing, setEditing] = useState(false);
  const save = api.leads.update.useMutation({
    onSuccess: () => {
      setEditing(false);
      void utils.leads.detail.invalidate({ leadId });
    },
  });

  if (!data) return <div className="h-40 bg-sunk rounded-sm mb-8" aria-busy />;

  const budget =
    data.budgetMinFils !== null && data.budgetMaxFils !== null ? `${aedWhole(data.budgetMinFils)} – ${aedWhole(data.budgetMaxFils)}`
    : data.budgetMaxFils !== null ? `up to ${aedWhole(data.budgetMaxFils)}`
    : data.budgetMinFils !== null ? `from ${aedWhole(data.budgetMinFils)}`
    : null;

  if (!editing) {
    const rows: [string, string | null][] = [
      ["Phone", data.phone],
      ["Email", data.email],
      ["Language", data.language === "ar" ? "Arabic" : "English"],
      ["Budget", budget],
      ["Looking to", INTENTS.find(([v]) => v === data.intent)?.[1] ?? null],
      ["When", data.timeframe],
      ["Paying by", FINANCING.find(([v]) => v === data.financing)?.[1] ?? null],
      ["Visa renews", data.visaExpiresAt ? new Date(data.visaExpiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null],
      ["With", data.agent ?? "Nobody yet"],
    ];
    return (
      <section className="mb-10" aria-labelledby="who-heading">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 id="who-heading" className="font-sans font-semibold text-page text-ink">
            {data.name ?? data.phone}
          </h1>
          <span className="t-label text-ink-3">{sentence(data.status)}</span>
          {data.canEdit && (
            <button type="button" className="ms-auto btn-inline" onClick={() => { save.reset(); setEditing(true); }}>
              Edit
            </button>
          )}
        </div>
        {/* One tap from the person to talking to them (the audit's B8).
            On a phone this is the first thing under the name: an agent
            opening somebody in a car park wants to ring or write, not to
            scroll past their budget to find the number. The thread is
            the brokerage's WhatsApp, not the agent's own, so it stays on
            the record. */}
        <nav aria-label="Get in touch" data-quick-actions
          className="mt-4 grid grid-cols-3 gap-2 min-[640px]:flex min-[640px]:gap-3">
          <a href={`tel:${data.phone}`} className={buttonStyles({ size: "sm" })}>Call</a>
          {data.conversationId ? (
            <a href={`/inbox/${data.conversationId}`} className={buttonStyles({ size: "sm" })}>Message</a>
          ) : (
            <span className={buttonStyles({ size: "sm", variant: "quiet" })} title="They have not written to the brokerage's number yet">
              No thread yet
            </span>
          )}
          <a href="#task-heading" className={buttonStyles({ size: "sm" })}>Next step</a>
        </nav>
        {data.optedOutOfOutreach && (
          // Said at the top, in words: this is an instruction from the
          // person, and the next thing an agent does here is often message them.
          <p className="mt-3 text-sm text-ink bg-sunk rounded-lg px-3 py-2 border-s-[3px] border-s-accent-edge">
            Asked not to be messaged
            {data.optedOutAt ? ` on ${new Date(data.optedOutAt).toLocaleDateString("en-GB")}` : ""}.
            No marketing is prepared for them; reply if they write first.
          </p>
        )}
        <dl className="mt-5 grid grid-cols-[140px_minmax(0,1fr)] max-[480px]:grid-cols-1 gap-x-4 gap-y-2 border-t border-rule pt-4">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="t-label text-ink-3 pt-0.5">{k}</dt>
              <dd className={v ? "text-ui text-ink" : "text-ui text-ink-3"}>{v ?? "—"}</dd>
            </div>
          ))}
        </dl>
        {data.notes && <p className="mt-4 text-sm text-ink-2 max-w-[60ch]">{data.notes}</p>}
      </section>
    );
  }

  return <EditForm data={data} busy={save.isPending} error={save.error?.message ?? null}
    onCancel={() => setEditing(false)} onSave={(v) => save.mutate({ leadId, ...v })} />;
}

type Detail = inferRouterOutputs<AppRouter>["leads"]["detail"];

function EditForm({ data, busy, error, onCancel, onSave }: {
  data: Detail; busy: boolean; error: string | null;
  onCancel: () => void;
  onSave: (v: Omit<inferRouterInputs<AppRouter>["leads"]["update"], "leadId">) => void;
}) {
  const [f, setF] = useState({
    name: data.name ?? "",
    email: data.email ?? "",
    language: data.language === "ar" ? "ar" : "en",
    budgetMin: data.budgetMinAed?.toString() ?? "",
    budgetMax: data.budgetMaxAed?.toString() ?? "",
    intent: data.intent ?? "",
    timeframe: data.timeframe ?? "",
    financing: data.financing ?? "",
    notes: data.notes ?? "",
    visa: data.visaExpiresAt ? new Date(data.visaExpiresAt).toISOString().slice(0, 10) : "",
    optedOut: data.optedOutOfOutreach,
  });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  // Whole dirhams, commas tolerated — agents type "2,500,000".
  const parseDirhams = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[,\s]/g, "")));
  const min = parseDirhams(f.budgetMin), max = parseDirhams(f.budgetMax);
  const bad =
    (min !== null && (!Number.isInteger(min) || min < 0)) || (max !== null && (!Number.isInteger(max) || max < 0))
      ? "Budgets are whole dirhams."
      : min !== null && max !== null && min > max ? "The lower budget is above the upper one." : null;

  return (
    <section className="mb-10" aria-labelledby="edit-heading">
      <h1 id="edit-heading" className="font-sans font-semibold text-section text-ink">Edit {data.name ?? data.phone}</h1>
      <p className="text-sm text-ink-3 mt-1">
        The phone number can&rsquo;t be changed — it is their WhatsApp. A new number is a new lead.
      </p>
      <div className="grid grid-cols-2 max-[560px]:grid-cols-1 gap-4 mt-5">
        <Field label="Name"><input className={input} value={f.name} onChange={up("name")} maxLength={120} /></Field>
        <Field label="Email"><input className={input} type="email" value={f.email} onChange={up("email")} /></Field>
        <Field label="Language">
          <select className={input} value={f.language} onChange={up("language")}>
            <option value="en">English</option><option value="ar">Arabic</option>
          </select>
        </Field>
        <Field label="Looking to">
          <select className={input} value={f.intent} onChange={up("intent")}>
            <option value="">Not known</option>
            {INTENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Budget from (AED)"><input className={input} inputMode="numeric" value={f.budgetMin} onChange={up("budgetMin")} placeholder="e.g. 1,500,000" /></Field>
        <Field label="Budget up to (AED)"><input className={input} inputMode="numeric" value={f.budgetMax} onChange={up("budgetMax")} placeholder="e.g. 2,500,000" /></Field>
        <Field label="When"><input className={input} value={f.timeframe} onChange={up("timeframe")} maxLength={60} placeholder="e.g. within 3 months" /></Field>
        <Field label="Paying by">
          <select className={input} value={f.financing} onChange={up("financing")}>
            <option value="">Not known</option>
            {FINANCING.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Visa renews" hint="Only if they mentioned it. Never ask for it.">
          <input className={input} type="date" value={f.visa} onChange={up("visa")} />
        </Field>
      </div>
      <Field label="Notes" className="mt-4">
        <textarea className={`${input} py-2`} rows={3} value={f.notes} onChange={up("notes")} maxLength={1000} />
      </Field>
      <label className="flex items-start gap-3 mt-5 max-w-[60ch] cursor-pointer">
        <input type="checkbox" className="mt-1 size-4" checked={f.optedOut}
          onChange={(e) => setF({ ...f, optedOut: e.target.checked })} />
        <span className="text-ui text-ink">
          They asked not to be messaged
          <span className="block text-sm text-ink-3">
            No property matches, nurture messages or renewal prompts are prepared for them. A reminder
            for a viewing they have booked still goes.
          </span>
        </span>
      </label>
      {(bad || error) && <p role="alert" className="text-sm text-danger mt-4">{bad ?? error}</p>}
      <div className="flex gap-2 mt-5">
        <Button variant="primary" loading={busy} disabled={!!bad}
          onClick={() => onSave({
            name: f.name.trim() || null,
            email: f.email.trim() || null,
            language: f.language as "en" | "ar",
            budgetMinAed: min,
            budgetMaxAed: max,
            intent: (f.intent || null) as never,
            timeframe: f.timeframe.trim() || null,
            financing: (f.financing || null) as never,
            notes: f.notes.trim() || null,
            visaExpiresAt: f.visa ? new Date(`${f.visa}T12:00:00Z`) : null,
            optedOut: f.optedOut,
          })}>
          Save
        </Button>
        <button type="button" className="btn-inline" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="t-label text-ink-3 block mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-note text-ink-3 mt-1">{hint}</span>}
    </label>
  );
}
