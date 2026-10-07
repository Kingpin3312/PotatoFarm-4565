"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { Button, buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The brokerage's control over its agents' microsites.
 *
 * Every one of these pages carries the brokerage's name, so the
 * brokerage decides the rules — whether they exist at all, whether an
 * admin approves them, whether an agent may use their own WhatsApp
 * number, which accent colours are on offer — and can take any one down
 * at once, with a reason the agent sees. What it cannot do is remove its
 * own name, "Powered by" or the legal links: those are not settings.
 */
const STATUS: Record<string, string> = {
  LIVE: "Live", DRAFT: "Draft", AWAITING_APPROVAL: "Waiting for approval", TAKEN_DOWN: "Taken down", NOT_STARTED: "Not started",
};

export default function MicrositeSettingsPage() {
  const utils = api.useUtils();
  const settings = api.microsite.settings.useQuery();
  const all = api.microsite.all.useQuery();
  const update = api.microsite.updateSettings.useMutation({ onSuccess: () => { void utils.microsite.invalidate(); setSaid("Saved."); } });
  const approve = api.microsite.approve.useMutation({ onSuccess: () => void utils.microsite.all.invalidate() });
  const disable = api.microsite.disable.useMutation({ onSuccess: () => void utils.microsite.all.invalidate() });
  const enable = api.microsite.enable.useMutation({ onSuccess: () => void utils.microsite.all.invalidate() });
  const [form, setForm] = useState<{ enabled: boolean; approval: boolean; ownWhatsapp: boolean; accents: string[] } | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data && !form) setForm({ enabled: settings.data.enabled, approval: settings.data.approval, ownWhatsapp: settings.data.ownWhatsapp, accents: settings.data.accents });
  }, [settings.data, form]);

  if (settings.isError) return <QueryError retry={() => void settings.refetch()} what="microsite settings" error={settings.error} />;
  if (!settings.data || !form) return <div className="max-w-[960px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>;
  const failure = update.error ?? approve.error ?? disable.error ?? enable.error;

  return (
    <div className="max-w-[960px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="t-label text-ink-3 block mb-3">Microsites</span>
        <h1 className="font-sans font-semibold text-page text-ink">Your agents&apos; websites.</h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[60ch]">
          Every agent can have a personal microsite, built from the CRM, under your brokerage&apos;s name. Enquiries from them come into the CRM, assigned to that agent.
          {" "}<a href={settings.data.teamPage} target="_blank" rel="noopener" className="text-ink">Your team page</a> lists every live one.
        </p>
      </header>

      {failure && <p role="alert" className="mb-4 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">{failure.message}</p>}

      <form className="rounded-md border border-rule p-5 grid gap-3"
        onSubmit={(e) => { e.preventDefault(); setSaid(null); update.mutate(form); }}>
        <h2 className="text-sub font-semibold text-ink">Rules</h2>
        {([
          ["enabled", "Agents can have microsites", "Off takes every agent's site down at once. What they wrote is kept."],
          ["approval", "An admin approves each site before it goes live", "Publishing sends it to you; it goes live when you approve it here."],
          ["ownWhatsapp", "Agents may use their own WhatsApp number", "Off sends every WhatsApp enquiry to the brokerage's line, where the assistant answers and the conversation stays in the CRM."],
        ] as const).map(([k, label, hint]) => (
          <label key={k} className="flex items-start gap-3 py-1 cursor-pointer">
            <input type="checkbox" checked={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} className="mt-0.5 size-5 accent-[var(--accent)] shrink-0" />
            <span className="grid gap-0.5"><span className="text-ui text-ink">{label}</span><span className="text-note text-ink-3">{hint}</span></span>
          </label>
        ))}
        <fieldset className="mt-2">
          <legend className="text-ui text-ink">Accent colours agents may choose</legend>
          <p className="text-note text-ink-3">For their own details only. Buttons always stay the brand colour.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {settings.data.palette.map((a) => {
              const on = form.accents.includes(a.key);
              return (
                <label key={a.key} className={cn("min-h-11 inline-flex items-center gap-2 rounded-full border px-3 text-sm cursor-pointer", on ? "border-ink text-ink" : "border-rule text-ink-3")}>
                  <input type="checkbox" className="sr-only" checked={on}
                    onChange={(e) => setForm({ ...form, accents: e.target.checked ? [...form.accents, a.key] : form.accents.filter((x) => x !== a.key) })} />
                  <span aria-hidden="true" className="size-5 rounded-full" style={{ background: a.hex }} />{a.label}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="flex items-center gap-3 mt-2">
          <Button type="submit" variant="primary" loading={update.isPending} disabled={!form.accents.length}>Save rules</Button>
          {said && <span role="status" className="text-note text-ink-2">{said}</span>}
          {!form.accents.length && <span className="text-note text-ink-3">Allow at least one colour.</span>}
        </div>
      </form>

      <section className="mt-10" aria-labelledby="agents-h">
        <h2 id="agents-h" className="text-sub font-semibold text-ink">Agents</h2>
        {all.isError && <p className="mt-3 text-sm text-ink-2">Couldn&apos;t load the list. <button type="button" className="underline" onClick={() => void all.refetch()}>Try again</button></p>}
        <ul className="mt-3 border-t border-rule" data-agents>
          {all.data?.map((a) => (
            <li key={a.userId} className="py-4 border-b border-rule grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" data-agent-row={a.status}>
              <div className="min-w-0">
                <p className="text-ui text-ink">{a.name} <span className="text-note text-ink-3">· {a.role.toLowerCase()}</span></p>
                <p className="mt-0.5 text-note text-ink-2">
                  <span className={cn("me-2", a.status === "LIVE" ? "text-ink" : a.status === "AWAITING_APPROVAL" ? "text-ink font-medium" : "text-ink-3")}>{STATUS[a.status]}</span>
                  {a.siteId && <span className="tabular">{a.views} views · {a.leads} leads in 30 days</span>}
                </p>
                {a.disabledReason && <p className="mt-0.5 text-note text-ink-3">Reason: {a.disabledReason}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {a.status === "LIVE" && a.path && <a href={a.path} target="_blank" rel="noopener" className={buttonStyles({ size: "sm", variant: "quiet" })}>View</a>}
                <a href={`/microsite?user=${a.userId}`} className={buttonStyles({ size: "sm", variant: "quiet" })}>Analytics</a>
                <a href={`/microsite/edit?user=${a.userId}`} className={buttonStyles({ size: "sm" })}>Edit</a>
                {a.status === "AWAITING_APPROVAL" && a.siteId && (
                  <>
                    <a href={`/microsite/preview?user=${a.userId}`} className={buttonStyles({ size: "sm" })}>Review</a>
                    <Button type="button" size="sm" variant="primary" loading={approve.isPending} onClick={() => approve.mutate({ siteId: a.siteId! })}>Approve</Button>
                  </>
                )}
                {a.siteId && a.status !== "TAKEN_DOWN" && (
                  <Button type="button" size="sm" variant="danger" loading={disable.isPending}
                    onClick={() => {
                      const reason = prompt(`Why is ${a.name}'s microsite coming down? They will see this.`);
                      if (reason && reason.trim().length >= 3) disable.mutate({ siteId: a.siteId!, reason: reason.trim() });
                    }}>Take down</Button>
                )}
                {a.status === "TAKEN_DOWN" && a.siteId && (
                  <Button type="button" size="sm" loading={enable.isPending} onClick={() => enable.mutate({ siteId: a.siteId! })}>Turn back on</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
