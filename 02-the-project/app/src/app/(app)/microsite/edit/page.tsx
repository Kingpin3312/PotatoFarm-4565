"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { Button, buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { MicrositeView } from "@/components/microsite/microsite-view";
import { assembleView } from "@/lib/microsite/assemble";
import { LIMITS, LANGUAGES, SPECIALISMS, SOCIAL, SOCIAL_KEYS, type EditableContent } from "@/lib/microsite/content";

/**
 * The microsite editor.
 *
 * Built for an agent who has never edited a website: one topic per tab,
 * plain labels, a counter wherever there is a limit, and **the page
 * itself beside the form**, redrawn on every keystroke from the same
 * component the public page uses — so there is never a question of what
 * a client will see. On a phone the preview is its own tab.
 *
 * Saving keeps a draft; nothing public changes until Publish (or, where
 * the brokerage approves microsites, until an admin approves). An admin
 * edits an agent's site here with `?user=`.
 */
export default function EditMicrositePage() {
  return <Suspense><Editor /></Suspense>;
}

const TABS = [
  ["profile", "Profile"], ["about", "About"], ["properties", "Properties"], ["areas", "Areas"],
  ["social", "Social"], ["branding", "Branding"], ["seo", "Search & sharing"],
] as const;
type Tab = (typeof TABS)[number][0] | "preview";

const field = "w-full min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink placeholder:text-ink-3";

function Field({ label, hint, error, count, max, children, id }: {
  label: string; hint?: ReactNode; error?: string | null; count?: number; max?: number; children: ReactNode; id?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5" data-field={id}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ui text-ink font-medium">{label}</span>
        {max !== undefined && <span className={cn("text-note tabular", (count ?? 0) > max ? "text-danger" : "text-ink-3")}>{count ?? 0}/{max}</span>}
      </div>
      {children}
      {hint && <span className="text-note text-ink-3">{hint}</span>}
      {error && <span role="alert" className="text-note text-danger">{error}</span>}
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 py-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 accent-[var(--accent)] shrink-0" />
      <span className="grid grid-cols-[minmax(0,1fr)] gap-0.5"><span className="text-ui text-ink">{label}</span>{hint && <span className="text-note text-ink-3">{hint}</span>}</span>
    </label>
  );
}

function Chips<T extends string>({ all, chosen, onChange, max, name }: { all: readonly T[]; chosen: T[]; onChange: (v: T[]) => void; max: number; name: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={name}>
      {all.map((x) => {
        const on = chosen.includes(x);
        return (
          <button key={x} type="button" aria-pressed={on}
            disabled={!on && chosen.length >= max}
            onClick={() => onChange(on ? chosen.filter((c) => c !== x) : [...chosen, x])}
            className={cn("min-h-11 px-4 rounded-full border text-sm disabled:opacity-40",
              on ? "bg-accent text-on-accent border-accent" : "border-rule-strong text-ink hover:border-ink")}>
            {x}
          </button>
        );
      })}
    </div>
  );
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function Editor() {
  const sp = useSearchParams();
  const userId = sp.get("user") ?? undefined;
  const q = userId ? { userId } : undefined;
  const utils = api.useUtils();
  const mine = api.microsite.mine.useQuery(q, { refetchOnWindowFocus: false });
  const options = api.microsite.options.useQuery();
  const listings = api.microsite.listings.useQuery(q);

  const [tab, setTab] = useState<Tab>(() => (TABS.some(([k]) => k === sp.get("tab")) ? (sp.get("tab") as Tab) : "profile"));
  const [form, setForm] = useState<EditableContent | null>(null);
  const [slug, setSlug] = useState("");
  const [saved, setSaved] = useState("");
  const [problem, setProblem] = useState<{ field: string; text: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (mine.data && !form) {
      const { photo: _p, cover: _c, ...rest } = mine.data.content;
      setForm(rest);
      setSlug(mine.data.site.slug);
      setSaved(JSON.stringify([rest, mine.data.site.slug]));
    }
  }, [mine.data, form]);

  const dirty = !!form && JSON.stringify([form, slug]) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const chosen = useDebounced({ featured: form?.featured ?? [], areas: form?.areas ?? [] }, 400);
  const parts = api.microsite.previewParts.useQuery({ userId, ...chosen }, { enabled: !!form, placeholderData: (prev) => prev });

  const save = api.microsite.save.useMutation();
  const publish = api.microsite.publish.useMutation();
  const unpublish = api.microsite.unpublish.useMutation();

  const view = useMemo(() => {
    const p = parts.data ?? mine.data?.parts;
    if (!form || !p) return null;
    return assembleView(form, { ...p, slug, photo: mine.data?.parts.photo ?? null, cover: mine.data?.parts.cover ?? null });
  }, [form, parts.data, mine.data, slug]);

  if (mine.isError) return <QueryError retry={() => void mine.refetch()} what="your microsite" error={mine.error} />;
  if (!mine.data || !form || !options.data) return <div className="max-w-[1440px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>;

  const m = mine.data;
  const o = options.data;
  const set = (patch: Partial<EditableContent>) => { setForm((f) => (f ? { ...f, ...patch } : f)); setNote(null); };
  const err = (f: string) => (problem && (problem.field === f || problem.field.startsWith(`${f}.`)) ? problem.text : null);

  async function doSave(): Promise<boolean> {
    setProblem(null); setNote(null);
    try {
      const r = await save.mutateAsync({ userId, slug, content: form! });
      if (!r.ok) {
        setProblem({ field: r.field, text: r.problem });
        const where: Record<string, Tab> = { slug: "profile", name: "profile", title: "profile", headline: "profile", phone: "profile", email: "profile", whatsapp: "profile", whatsappNumber: "profile", brn: "profile", credentials: "profile", languages: "profile", intro: "about", bio: "about", specialisms: "about", featured: "properties", areas: "areas", accent: "branding", seoTitle: "seo", seoDescription: "seo" };
        setTab(r.field.startsWith("social") ? "social" : where[r.field] ?? tab);
        return false;
      }
      setSaved(JSON.stringify([form, slug]));
      await utils.microsite.invalidate();
      setNote("Draft saved. Nothing public has changed.");
      return true;
    } catch (e) {
      setProblem({ field: "", text: e instanceof Error ? e.message : "Couldn't save. Try again." });
      return false;
    }
  }

  async function doPublish() {
    if (dirty && !(await doSave())) return;
    try {
      const r = await publish.mutateAsync(q);
      await utils.microsite.invalidate();
      setNote(r.status === "LIVE" ? "Published — your microsite is live." : "Sent for approval. It goes live when an admin approves it.");
    } catch (e) {
      setProblem({ field: "", text: e instanceof Error ? e.message : "Couldn't publish. Try again." });
    }
  }

  const status = m.site.status;
  const approval = m.rules.approval && !m.acting;
  const publishLabel = approval ? "Send for approval" : status === "LIVE" ? "Publish changes" : "Publish";
  const base = typeof window === "undefined" ? "" : window.location.origin;

  const panel = (() => {
    switch (tab) {
      case "profile": return (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
          <Field label="Your name" id="name" error={err("name")} count={form.name.length} max={LIMITS.name}>
            <input className={field} value={form.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" />
          </Field>
          <Field label="Professional title" id="title" hint="As it appears on your business card — Senior property consultant, Leasing manager." error={err("title")} count={form.title.length} max={LIMITS.title}>
            <input className={field} value={form.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Headline" id="headline" hint="One sentence under your name: what you do, and where." error={err("headline")} count={form.headline.length} max={LIMITS.headline}>
            <textarea className={`${field} py-2.5`} rows={2} value={form.headline} onChange={(e) => set({ headline: e.target.value })} placeholder="Dubai Marina and JBR, bought and let with the whole market in view." />
          </Field>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 sm:grid-cols-2">
            <Field label="Phone" id="phone" hint="Shown with a Call button. Leave empty to hide it." error={err("phone")}>
              <input className={field} type="tel" inputMode="tel" value={form.phone ?? ""} onChange={(e) => set({ phone: e.target.value || null })} placeholder="050 123 4567" />
            </Field>
            <Field label="Email" id="email" hint="Leave empty to hide it." error={err("email")}>
              <input className={field} type="email" value={form.email ?? ""} onChange={(e) => set({ email: e.target.value || null })} />
            </Field>
          </div>
          <fieldset className="grid grid-cols-[minmax(0,1fr)] gap-1" data-field="whatsapp">
            <legend className="text-ui text-ink font-medium mb-1">WhatsApp</legend>
            {m.rules.companyWhatsapp ? (
              <label className="flex items-start gap-3 py-1.5"><input type="radio" name="wa" className="mt-1 size-4 accent-[var(--accent)]" checked={form.whatsapp === "COMPANY"} onChange={() => set({ whatsapp: "COMPANY" })} />
                <span className="grid"><span className="text-ui text-ink">The {m.brokerage} WhatsApp line <span className="text-ink-3">(recommended)</span></span>
                  <span className="text-note text-ink-3">Messages land in your CRM inbox, assigned to you, with the assistant answering at night.</span></span></label>
            ) : (
              <p className="text-note text-ink-3 py-1.5">{m.brokerage} hasn&apos;t connected a WhatsApp line yet, so the company option will appear once it has.</p>
            )}
            {m.rules.ownWhatsapp && (
              <label className="flex items-start gap-3 py-1.5"><input type="radio" name="wa" className="mt-1 size-4 accent-[var(--accent)]" checked={form.whatsapp === "OWN"} onChange={() => set({ whatsapp: "OWN" })} />
                <span className="text-ui text-ink">My own WhatsApp number</span></label>
            )}
            <label className="flex items-start gap-3 py-1.5"><input type="radio" name="wa" className="mt-1 size-4 accent-[var(--accent)]" checked={form.whatsapp === "NONE"} onChange={() => set({ whatsapp: "NONE" })} />
              <span className="text-ui text-ink">Don&apos;t show WhatsApp</span></label>
            {form.whatsapp === "OWN" && (
              <input className={`${field} mt-1`} type="tel" value={form.whatsappNumber ?? ""} onChange={(e) => set({ whatsappNumber: e.target.value || null })} placeholder="055 987 6543" aria-label="Your WhatsApp number" />
            )}
            {(err("whatsapp") || err("whatsappNumber")) && <span role="alert" className="text-note text-danger">{err("whatsapp") ?? err("whatsappNumber")}</span>}
          </fieldset>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 sm:grid-cols-2">
            <Field label="Years of experience" id="yearsExperience" hint="Leave empty to hide it.">
              <input className={field} type="number" min={0} max={60} inputMode="numeric" value={form.yearsExperience ?? ""}
                onChange={(e) => set({ yearsExperience: e.target.value === "" ? null : Math.max(0, Math.min(60, Math.round(Number(e.target.value)))) })} />
            </Field>
            <Field label="RERA broker card (BRN)" id="brn" error={err("brn")} hint="Shown as part of your credentials.">
              <input className={field} value={form.brn ?? ""} onChange={(e) => set({ brn: e.target.value || null })} />
            </Field>
          </div>
          <Field label="Languages" id="languages" hint={`Up to ${LIMITS.languages}.`}>
            <Chips all={o.languages} chosen={form.languages} onChange={(languages) => set({ languages })} max={LIMITS.languages} name="Languages" />
          </Field>
          <Field label="Credentials" id="credentials" error={err("credentials")} hint="Qualifications and memberships, one per line — RERA certified, CILT, and so on.">
            <textarea className={`${field} py-2.5`} rows={3} value={form.credentials.join("\n")}
              onChange={(e) => set({ credentials: e.target.value.split("\n").map((x) => x.trimStart()).filter((x, i, all) => x || i === all.length - 1).slice(0, LIMITS.credentials) })} />
          </Field>
          <Field label="Your address" id="slug" error={err("slug")} hint="Lower-case letters, numbers and hyphens. Changing it breaks links you've already shared.">
            <div className="flex items-stretch min-w-0">
              <span className="hidden sm:flex items-center px-3 border border-e-0 border-rule rounded-s-[3px] text-note text-ink-3 bg-sunk truncate max-w-[50%]">{m.site.path.replace(/[^/]+$/, "")}</span>
              <input className={cn(field, "sm:rounded-s-none min-w-0")} value={slug} onChange={(e) => { setSlug(e.target.value.toLowerCase()); setNote(null); }} spellCheck={false} />
            </div>
          </Field>
        </div>
      );
      case "about": return (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
          <Field label="Introduction" id="intro" hint="Two or three sentences, the first thing people read about you." error={err("intro")} count={form.intro.length} max={LIMITS.intro}>
            <textarea className={`${field} py-2.5`} rows={3} value={form.intro} onChange={(e) => set({ intro: e.target.value })} />
          </Field>
          <BioEditor value={form.bio} onChange={(bio) => set({ bio })} error={err("bio")} />
          <Field label="Specialisms" id="specialisms" hint={`Up to ${LIMITS.specialisms}.`}>
            <Chips all={o.specialisms} chosen={form.specialisms} onChange={(specialisms) => set({ specialisms })} max={LIMITS.specialisms} name="Specialisms" />
          </Field>
        </div>
      );
      case "properties": return (
        <PropertiesTab form={form} set={set} rows={listings.data} error={err("featured")} loading={listings.isLoading} />
      );
      case "areas": return <AreasTab chosen={form.areas} all={o.areas} onChange={(areas) => set({ areas })} error={err("areas")} />;
      case "social": return (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
          <p className="text-sm text-ink-2">Only the networks you fill in appear on your page.</p>
          {SOCIAL_KEYS.map((k) => (
            <Field key={k} label={SOCIAL[k].label} id={`social.${k}`} error={err(`social.${k}`)}>
              <input className={field} inputMode="url" value={form.social[k] ?? ""} placeholder={`${SOCIAL[k].hosts[0]}/your-profile`}
                onChange={(e) => set({ social: { ...form.social, [k]: e.target.value || null } })} />
            </Field>
          ))}
        </div>
      );
      case "branding": return (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
          <PhotoField which="photo" label="Profile photo" hint="A head-and-shoulders photo, portrait way up. JPEG or PNG." url={m.parts.photo} userId={userId} storage={m.rules.storage} />
          <PhotoField which="cover" label="Cover photo" hint="A wide photo — your favourite skyline, a community you cover. Shown under your introduction." url={m.parts.cover} userId={userId} storage={m.rules.storage} />
          <Field label="Accent colour" id="accent" error={err("accent")} hint={`Used on your own details — the line under your name, your monogram. Buttons stay ${m.brokerage}'s colour.`}>
            <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Accent colour">
              {m.rules.accents.map((a) => (
                <button key={a.key} type="button" role="radio" aria-checked={form.accent === a.key} onClick={() => set({ accent: a.key })}
                  className={cn("min-h-11 inline-flex items-center gap-2 rounded-full border px-3 text-sm", form.accent === a.key ? "border-ink text-ink" : "border-rule text-ink-2 hover:border-ink-2")}>
                  <span aria-hidden="true" className="size-5 rounded-full" style={{ background: a.hex }} />{a.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      );
      case "seo": return (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
          <Field label="Search title" id="seoTitle" error={err("seoTitle")} count={(form.seoTitle ?? "").length} max={LIMITS.seoTitle} hint={`Leave empty to use “${form.name} | ${m.brokerage}”.`}>
            <input className={field} value={form.seoTitle ?? ""} onChange={(e) => set({ seoTitle: e.target.value || null })} />
          </Field>
          <Field label="Search description" id="seoDescription" error={err("seoDescription")} count={(form.seoDescription ?? "").length} max={LIMITS.seoDescription} hint="Leave empty to use your headline.">
            <textarea className={`${field} py-2.5`} rows={3} value={form.seoDescription ?? ""} onChange={(e) => set({ seoDescription: e.target.value || null })} />
          </Field>
          <div className="rounded-md border border-rule p-4">
            <p className="text-note text-ink-3">How a search result could look</p>
            <p className="mt-2 text-note text-ink-3 break-all">{base}{m.site.path.replace(/[^/]+$/, "")}{slug}</p>
            <p className="mt-1 text-sub text-ink">{form.seoTitle || `${form.name} | ${m.brokerage}`}</p>
            <p className="mt-1 text-sm text-ink-2">{(form.seoDescription || form.headline || form.intro || "Add a headline so search engines and link previews have something to say.").slice(0, 170)}</p>
          </div>
          <p className="text-note text-ink-3">When the link is shared on WhatsApp, LinkedIn or Facebook, the preview shows your photo (or monogram), your name, your title and {m.brokerage}.</p>
        </div>
      );
      case "preview": return view ? (
        <div className="rounded-md border border-rule overflow-hidden max-h-[75dvh] overflow-y-auto" data-preview>
          <MicrositeView view={view} preview />
        </div>
      ) : null;
    }
  })();

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pb-44 sm:pb-32">
      <header className="pt-8 pb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <a href={`/microsite${userId ? `?user=${userId}` : ""}`} className="t-label text-ink-3 no-underline hover:underline">← {m.acting ? `${m.agentName}'s microsite` : "My microsite"}</a>
          <h1 className="mt-3 font-sans font-semibold text-page text-ink">Edit microsite</h1>
        </div>
        <a href={`/microsite/preview${userId ? `?user=${userId}` : ""}`} className={buttonStyles({ variant: "quiet", size: "sm" })}>Open full preview</a>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(0,1fr)_400px] items-start">
        <div className="min-w-0">
          <nav aria-label="Sections" className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
            <ul className="flex gap-1 border-b border-rule min-w-max" role="tablist">
              {[...TABS, ["preview", "Preview"] as const].map(([k, label]) => (
                <li key={k} className={k === "preview" ? "xl:hidden" : ""}>
                  <button type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-tab={k}
                    className={cn("min-h-11 px-3.5 text-ui border-b-2 -mb-px whitespace-nowrap", tab === k ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink")}>
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {problem && !problem.field && <p role="alert" className="mt-5 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">{problem.text}</p>}
          <div className="mt-6 max-w-[680px]" role="tabpanel">{panel}</div>
        </div>

        <aside className="hidden xl:block sticky top-4" aria-label="Live preview">
          <div className="flex items-baseline justify-between">
            <p className="t-label text-ink-3">Live preview · as a phone sees it</p>
            {parts.isFetching && <span className="text-note text-ink-3">Updating…</span>}
          </div>
          <div className="mt-3 rounded-[14px] border border-rule-strong overflow-hidden h-[calc(100dvh-180px)] overflow-y-auto" data-preview>
            {view && <MicrositeView view={view} preview />}
          </div>
        </aside>
      </div>

      {/* The two things to do, always in reach. */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] lg:bottom-0 z-40 border-t border-rule bg-ground/95 backdrop-blur lg:pb-[env(safe-area-inset-bottom)]" data-editor-bar>
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p role="status" className="text-note text-ink-2 min-w-0 basis-full sm:basis-auto sm:flex-1">
            {note ?? (dirty ? "Unsaved changes" : status === "LIVE" ? (m.site.unpublishedChanges ? "Saved — not live yet" : "Live and up to date") : status === "AWAITING_APPROVAL" ? (m.site.isLive ? "Changes waiting for approval — the live version stays up" : "Waiting for approval") : status === "TAKEN_DOWN" ? "Taken down by your brokerage" : "Draft — only you can see it")}
          </p>
          <div className="flex flex-wrap gap-2">
            {m.site.isLive && (
              <Button type="button" variant="quiet" size="sm" loading={unpublish.isPending}
                onClick={() => { if (confirm("Take your microsite off the web? Links you've shared will stop working until you publish again.")) unpublish.mutate(q, { onSuccess: () => { void utils.microsite.invalidate(); setNote("Unpublished. Your draft is kept."); } }); }}>
                Unpublish
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => void doSave()} loading={save.isPending} disabled={!dirty} data-save>Save draft</Button>
            <Button type="button" variant="primary" size="sm" onClick={() => void doPublish()} loading={publish.isPending}
              disabled={status === "TAKEN_DOWN" || (!dirty && status === "LIVE" && !m.site.unpublishedChanges) || status === "AWAITING_APPROVAL" && !dirty} data-publish>
              {publishLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BioEditor({ value, onChange, error }: { value: string; onChange: (v: string) => void; error: string | null }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrap = (kind: "heading" | "list" | "bold") => {
    const t = ref.current;
    if (!t) return;
    const [a, b] = [t.selectionStart, t.selectionEnd];
    const picked = value.slice(a, b);
    const lineStart = value.lastIndexOf("\n", a - 1) + 1;
    let next = value;
    if (kind === "bold") next = `${value.slice(0, a)}**${picked || "bold text"}**${value.slice(b)}`;
    else {
      const mark = kind === "heading" ? "## " : "- ";
      next = `${value.slice(0, lineStart)}${mark}${value.slice(lineStart)}`;
    }
    onChange(next);
    requestAnimationFrame(() => t.focus());
  };
  return (
    <Field label="Biography" id="bio" error={error} count={value.length} max={LIMITS.bio}
      hint={<>Start a line with <code>##</code> for a heading or <code>-</code> for a bullet; wrap words in <code>**</code> for bold. A good shape: About me, Experience, How I work, Areas.</>}>
      <div className="flex gap-1">
        {([["heading", "Heading"], ["list", "Bullet"], ["bold", "Bold"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => wrap(k)} className="min-h-9 px-3 rounded-[3px] border border-rule text-note text-ink-2 hover:text-ink hover:border-ink-2">{l}</button>
        ))}
      </div>
      <textarea ref={ref} className={`${field} py-2.5 leading-relaxed`} rows={12} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

type ListingRow = { id: string; reference: string; title: string; community: string | null; purpose: string; price: string | null; mine: boolean; offPlan: boolean; shown: boolean; why: string | null };

function PropertiesTab({ form, set, rows, error, loading }: {
  form: EditableContent; set: (p: Partial<EditableContent>) => void; rows: ListingRow[] | undefined; error: string | null; loading: boolean;
}) {
  const [search, setSearch] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const move = (i: number, d: number) => {
    const f = [...form.featured];
    const [x] = f.splice(i, 1);
    f.splice(i + d, 0, x!);
    set({ featured: f });
  };
  const s = search.trim().toLowerCase();
  const list = (rows ?? []).filter((r) => (!onlyMine || r.mine) && (!s || `${r.reference} ${r.title} ${r.community ?? ""}`.toLowerCase().includes(s)));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <section>
        <h2 className="text-ui text-ink font-medium">Featured <span className="text-ink-3 font-normal">· {form.featured.length}/{LIMITS.featured}</span></h2>
        <p className="mt-1 text-note text-ink-3">Shown first, in this order. Prices, photos and availability always come from the property&apos;s own record.</p>
        {error && <p role="alert" className="mt-2 text-note text-danger">{error}</p>}
        {form.featured.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">Nothing featured yet. Choose from the list below.</p>
        ) : (
          <ol className="mt-3 border-t border-rule" data-featured>
            {form.featured.map((id, i) => {
              const r = byId.get(id);
              return (
                <li key={id} className="flex items-center gap-2 py-2 border-b border-rule">
                  <span className="min-w-0 flex-1 text-sm text-ink truncate">{r ? `${r.title} · ${r.reference}` : "A property that's no longer listed"}
                    {r && !r.shown && <span className="block text-note text-ink-3 whitespace-normal">Not shown: {r.why}</span>}</span>
                  <button type="button" className="min-h-11 min-w-11 text-ink-2 hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                  <button type="button" className="min-h-11 min-w-11 text-ink-2 hover:text-ink disabled:opacity-30" disabled={i === form.featured.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                  <button type="button" className="min-h-11 px-2 text-note text-ink-2 hover:text-ink" onClick={() => set({ featured: form.featured.filter((x) => x !== id) })}>Remove</button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-1">
        <h2 className="text-ui text-ink font-medium">Also show</h2>
        <Toggle checked={form.showLatest} onChange={(showLatest) => set({ showLatest })} label="My other listings, newest first" hint="Everything you look after that can be advertised, added automatically as you list it." />
        <Toggle checked={form.showSold} onChange={(showSold) => set({ showSold })} label="Properties I've sold or let" hint="As a record — the type and community, never the price or the address." />
        <Toggle checked={form.showDeals} onChange={(showDeals) => set({ showDeals })} label="How many transactions I've completed here" hint="Counted from the completed deals in the CRM, never typed in. Hidden while it's zero." />
      </section>

      <section>
        <h2 className="text-ui text-ink font-medium">The brokerage&apos;s properties</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input className={cn(field, "flex-1 min-w-[200px]")} placeholder="Search by name, reference or community" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search properties" />
          <label className="flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="size-4 accent-[var(--accent)]" /> Only mine</label>
        </div>
        {loading && <div className="mt-3 h-24 bg-sunk rounded-sm" aria-busy />}
        <ul className="mt-3 border-t border-rule" data-listings>
          {list.slice(0, 80).map((r) => {
            const on = form.featured.includes(r.id);
            return (
              <li key={r.id} className="py-2.5 border-b border-rule">
                <label className={cn("flex items-start gap-3", !r.shown && !on && "opacity-60")}>
                  <input type="checkbox" className="mt-1 size-5 accent-[var(--accent)] shrink-0" checked={on}
                    disabled={!on && (!r.shown || form.featured.length >= LIMITS.featured)}
                    onChange={(e) => set({ featured: e.target.checked ? [...form.featured, r.id] : form.featured.filter((x) => x !== r.id) })} />
                  <span className="min-w-0 grid">
                    <span className="text-sm text-ink">{r.title} <span className="text-ink-3">· {r.reference}{r.mine ? " · yours" : ""}{r.offPlan ? " · off-plan" : ""}</span></span>
                    <span className="text-note text-ink-3">{[r.community, r.purpose === "RENT" ? "To let" : "For sale"].filter(Boolean).join(" · ")}</span>
                    {!r.shown && <span className="text-note text-ink-3">Can&apos;t be shown yet: {r.why}</span>}
                  </span>
                </label>
              </li>
            );
          })}
          {rows && list.length === 0 && <li className="py-3 text-sm text-ink-2">No properties match.</li>}
        </ul>
      </section>
    </div>
  );
}

function AreasTab({ chosen, all, onChange, error }: { chosen: string[]; all: { id: string; name: string; path: string }[]; onChange: (v: string[]) => void; error: string | null }) {
  const [search, setSearch] = useState("");
  const byId = new Map(all.map((a) => [a.id, a]));
  const s = search.trim().toLowerCase();
  const list = all.filter((a) => !s || a.path.toLowerCase().includes(s)).slice(0, 60);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div>
        <h2 className="text-ui text-ink font-medium">Areas you cover <span className="text-ink-3 font-normal">· {chosen.length}/{LIMITS.areas}</span></h2>
        <p className="mt-1 text-note text-ink-3">Shown large on your page, in this order. From the same list of places as your listings.</p>
        {error && <p role="alert" className="mt-2 text-note text-danger">{error}</p>}
        <ul className="mt-3 flex flex-wrap gap-2" data-areas>
          {chosen.map((id) => (
            <li key={id}>
              <button type="button" onClick={() => onChange(chosen.filter((x) => x !== id))}
                className="min-h-11 inline-flex items-center gap-2 rounded-full bg-accent text-on-accent px-4 text-sm" aria-label={`Remove ${byId.get(id)?.name ?? "area"}`}>
                {byId.get(id)?.name ?? "Unknown place"} <span aria-hidden="true">✕</span>
              </button>
            </li>
          ))}
          {chosen.length === 0 && <li className="text-sm text-ink-2">None yet.</li>}
        </ul>
      </div>
      <div>
        <input className={field} placeholder="Search — Marina, Business Bay, Arabian Ranches…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search places" />
        <ul className="mt-3 border-t border-rule max-h-[420px] overflow-y-auto">
          {list.map((a) => {
            const on = chosen.includes(a.id);
            return (
              <li key={a.id} className="border-b border-rule">
                <label className="flex items-center gap-3 py-2 min-h-11">
                  <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={on} disabled={!on && chosen.length >= LIMITS.areas}
                    onChange={(e) => onChange(e.target.checked ? [...chosen, a.id] : chosen.filter((x) => x !== a.id))} />
                  <span className="text-sm text-ink">{a.name} <span className="text-ink-3">· {a.path.split(" > ").slice(0, -1).join(" › ")}</span></span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function PhotoField({ which, label, hint, url, userId, storage }: { which: "photo" | "cover"; label: string; hint: string; url: string | null; userId?: string; storage: boolean }) {
  const utils = api.useUtils();
  const upload = api.microsite.photoUpload.useMutation();
  const confirm = api.microsite.photoConfirm.useMutation();
  const remove = api.microsite.photoRemove.useMutation({ onSuccess: () => void utils.microsite.mine.invalidate() });
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<string | null>(null);

  async function add(file: File) {
    setState("Uploading…");
    try {
      const t = await upload.mutateAsync({ userId, which, mimeType: file.type, sizeBytes: file.size });
      const put = await fetch(t.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!put.ok) throw new Error("The upload was refused. Try again.");
      await confirm.mutateAsync({ userId, which, key: t.key, mimeType: file.type, sizeBytes: file.size });
      await utils.microsite.mine.invalidate();
      setState("Added to your draft. Publish to show it.");
    } catch (e) {
      setState(e instanceof Error ? e.message : "Couldn't add that photo.");
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2" data-field={which}>
      <span className="text-ui text-ink font-medium">{label}</span>
      <div className="flex flex-wrap items-center gap-4">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className={cn("rounded-md object-cover bg-sunk", which === "photo" ? "w-24 aspect-[4/5]" : "w-48 aspect-[16/9]")} />
        ) : (
          <div className={cn("rounded-md bg-sunk grid place-items-center text-note text-ink-3", which === "photo" ? "w-24 aspect-[4/5]" : "w-48 aspect-[16/9]")}>None</div>
        )}
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/jpeg,image/png" className="sr-only" tabIndex={-1}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void add(f); e.target.value = ""; }} />
          <Button type="button" size="sm" disabled={!storage} loading={upload.isPending || confirm.isPending} onClick={() => input.current?.click()}>
            {url ? "Replace" : "Upload"}
          </Button>
          {url && <Button type="button" size="sm" variant="quiet" loading={remove.isPending} onClick={() => remove.mutate({ userId, which })}>Remove</Button>}
        </div>
      </div>
      <span className="text-note text-ink-3">{storage ? hint : "Photo storage isn't connected for this account yet, so photos can't be added. Your page shows your monogram instead."}</span>
      {state && <span role="status" className="text-note text-ink-2">{state}</span>}
    </div>
  );
}
