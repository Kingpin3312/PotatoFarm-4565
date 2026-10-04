"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { buttonStyles } from "@/components/ui/button";
import { CopyLink, ShareMenu } from "./share";

/**
 * My microsite: the agent's own website, from the CRM side.
 *
 * Summary first — is it live, where is it, how is it doing — then what
 * would make it better. The numbers are the last 30 days and only what
 * was measured: visits are counted by the page itself, leads by the
 * enquiries that came through it. An admin opens the same screen for any
 * agent with `?user=`.
 */
export default function MicrositePage() {
  return <Suspense><Dashboard /></Suspense>;
}

const STATUS: Record<string, { label: string; say: string }> = {
  LIVE: { label: "Live", say: "Anyone with the link can see it." },
  DRAFT: { label: "Draft", say: "Only you can see it. Publish when you're ready." },
  AWAITING_APPROVAL: { label: "Waiting for approval", say: "Your brokerage approves microsites before they go live. You'll see it here when it's approved." },
  TAKEN_DOWN: { label: "Taken down", say: "Your brokerage has taken this microsite down." },
};

function Dashboard() {
  const userId = useSearchParams().get("user") ?? undefined;
  const q = userId ? { userId } : undefined;
  const mine = api.microsite.mine.useQuery(q);
  const stats = api.microsite.stats.useQuery({ userId, days: 30 });
  const utils = api.useUtils();
  const publish = api.microsite.publish.useMutation({ onSuccess: () => utils.microsite.invalidate() });

  if (mine.isError) return <QueryError retry={() => void mine.refetch()} what="your microsite" error={mine.error} />;
  if (!mine.data) return <div className="max-w-[1080px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>;

  const m = mine.data;
  const s = STATUS[m.site.status]!;
  const edit = `/microsite/edit${userId ? `?user=${userId}` : ""}`;
  const preview = `/microsite/preview${userId ? `?user=${userId}` : ""}`;
  const rate = stats.data && stats.data.visitors > 0 ? `${Math.round((stats.data.leads / stats.data.visitors) * 100)}%` : "—";
  const tiles: [string, number | string | undefined, string][] = [
    ["Microsite views", stats.data?.views, "views"],
    ["Visitors", stats.data?.visitors, "visitors"],
    ["Property views", stats.data?.propertyViews, "property"],
    ["WhatsApp taps", stats.data?.whatsapp, "whatsapp"],
    ["Calls", stats.data?.phone, "phone"],
    ["Emails", stats.data?.email, "email"],
    ["Leads", stats.data?.leads, "leads"],
    // Leads per visitor — shown only once there are visitors to divide by.
    ["Enquiry rate", stats.data ? rate : undefined, "rate"],
  ];

  return (
    <div className="max-w-[1080px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-8">
        <span className="t-label text-ink-3 block mb-3">{m.acting ? `${m.agentName}'s microsite` : "My microsite"}</span>
        <h1 className="font-sans font-semibold text-page text-ink">{m.acting ? m.agentName : "Your personal website."}</h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[60ch]">
          Your profile and the properties you choose, built from the CRM and always up to date. Enquiries from it come straight to you.
        </p>
      </header>

      {!m.rules.enabled && (
        <p role="alert" className="mb-6 px-4 py-3 border border-rule-strong rounded-md text-sm text-ink">
          Microsites are switched off for {m.brokerage}. Your page isn&apos;t visible until an admin switches them on.
        </p>
      )}

      {/* Where it is and what to do with it. */}
      <section aria-labelledby="status-h" className="rounded-md border border-rule bg-raised p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="status-h" className="sr-only">Status</h2>
          <span data-status={m.site.status}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-note ${m.site.status === "LIVE" ? "border-accent text-ink" : "border-rule-strong text-ink-2"}`}>
            <span aria-hidden="true" className={`size-2 rounded-full ${m.site.status === "LIVE" ? "bg-accent" : "bg-ink-3"}`} />
            {s.label}
          </span>
          <span className="text-sm text-ink-2">{s.say}</span>
        </div>
        {m.site.disabledReason && <p className="mt-3 text-sm text-ink">Reason given: {m.site.disabledReason}</p>}
        {m.site.unpublishedChanges && (
          <p className="mt-3 text-sm text-ink">
            You have changes that aren&apos;t live yet.{" "}
            <button type="button" className="underline underline-offset-4" disabled={publish.isPending} onClick={() => publish.mutate(q)}>
              {m.rules.approval && !m.acting ? "Send them for approval" : "Publish them"}
            </button>
          </p>
        )}
        {publish.error && <p role="alert" className="mt-2 text-sm text-danger">{publish.error.message}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-2 min-w-0">
          <code className="min-w-0 max-w-full truncate rounded-sm bg-sunk px-3 py-2 text-note text-ink" data-url>{m.site.url}</code>
          <CopyLink url={m.site.url} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={edit} className={buttonStyles({ variant: "primary" })}>Edit microsite</a>
          <a href={preview} className={buttonStyles({ variant: "secondary" })}>Preview</a>
          {m.site.status === "LIVE" && <a href={m.site.path} target="_blank" rel="noopener" className={buttonStyles({ variant: "secondary" })}>View live site</a>}
          <ShareMenu url={m.site.url} name={m.content.name} live={m.site.status === "LIVE"} userId={userId} />
        </div>
        {m.site.updatedAt && <p className="mt-4 text-note text-ink-3">Last updated {new Date(m.site.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" })}</p>}
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="perf-h">
          <h2 id="perf-h" className="t-label text-ink-3">Performance · last 30 days</h2>
          {stats.isError && <p className="mt-3 text-sm text-ink-2">Couldn&apos;t load the numbers. <button type="button" className="underline" onClick={() => void stats.refetch()}>Try again</button></p>}
          <dl className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-px bg-rule rounded-md overflow-hidden border border-rule">
            {tiles.map(([label, n, key]) => (
              <div key={key} className="bg-ground p-4" data-stat={key}>
                <dt className="text-note text-ink-3">{label}</dt>
                <dd className="mt-1 text-stat text-ink tabular">{n === undefined ? "—" : typeof n === "number" ? n.toLocaleString("en-GB") : n}</dd>
              </div>
            ))}
          </dl>
          {stats.data && stats.data.views === 0 && (
            <p className="mt-3 text-sm text-ink-2">
              {m.site.status === "LIVE"
                ? "Nothing yet. Share the link on WhatsApp, in your email signature or on Instagram, and visits will show here."
                : "Numbers start when the page is live."}
            </p>
          )}
          {stats.data && stats.data.topProperties.length > 0 && (
            <div className="mt-6">
              <h3 className="text-note text-ink-3">Most viewed properties</h3>
              <ol className="mt-2 border-t border-rule">
                {stats.data.topProperties.map((p) => (
                  <li key={p.reference} className="flex justify-between gap-4 py-2.5 border-b border-rule text-sm">
                    <span className="min-w-0 truncate text-ink">{p.title} <span className="text-ink-3">· {p.reference}</span></span>
                    <span className="tabular text-ink-2 shrink-0">{p.views}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        <section aria-labelledby="complete-h">
          <h2 id="complete-h" className="t-label text-ink-3">Profile completeness</h2>
          <p className="mt-3 text-stat text-ink tabular" data-completeness>{m.completeness.percent}%</p>
          <div className="mt-2 h-1.5 rounded-full bg-sunk overflow-hidden" role="progressbar" aria-valuenow={m.completeness.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
            <div className="h-full bg-accent" style={{ width: `${m.completeness.percent}%` }} />
          </div>
          <ul className="mt-4 grid gap-1">
            {m.completeness.steps.map((st) => (
              <li key={st.key}>
                <a href={`${edit}${edit.includes("?") ? "&" : "?"}tab=${st.tab}`}
                   className="min-h-11 flex items-center gap-3 text-sm no-underline text-ink hover:underline">
                  <span aria-hidden="true" className={`grid place-items-center size-5 rounded-full border text-[11px] ${st.done ? "bg-accent border-accent text-on-accent" : "border-rule-strong text-transparent"}`}>✓</span>
                  <span className={st.done ? "text-ink" : "text-ink-2"}>{st.label}</span>
                  <span className="sr-only">{st.done ? "done" : "to do"}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

