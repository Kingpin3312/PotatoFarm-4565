"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Tasks.
 *
 * Every follow-up, not just today's: what is overdue, what is due, what
 * is coming. An agent writes their own; a manager can hand one to a
 * colleague and see it through from "I asked" — the audit's C7, which
 * found tasks were only ever reminders the product wrote.
 */
type View = "mine" | "asked" | "team";
const MANAGERS = new Set(["MANAGER", "ADMIN", "OWNER"]);

export default function Tasks() {
  const [view, setView] = useState<View>("mine");
  const [state, setState] = useState<"open" | "done">("open");
  const [adding, setAdding] = useState(false);
  const utils = api.useUtils();
  const { data: mine } = api.org.mine.useQuery();
  const manager = MANAGERS.has(mine?.find((o) => o.active)?.role ?? "");
  const { data: team } = api.org.members.useQuery(undefined, { enabled: manager });
  const { data, isLoading } = api.tasks.list.useQuery({ view, state }, { placeholderData: (p) => p });
  const refresh = () => { void utils.tasks.list.invalidate(); void utils.today.followUps.invalidate(); void utils.today.brief.invalidate(); };
  const create = api.tasks.create.useMutation({ onSuccess: () => { setAdding(false); refresh(); } });
  const complete = api.tasks.complete.useMutation({ onSuccess: refresh });
  const reopen = api.tasks.reopen.useMutation({ onSuccess: refresh });

  const rows = data?.rows ?? [];
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday.getTime() + 86_400_000);
  const group = (d: Date) => (d < startOfToday ? "Overdue" : d < endOfToday ? "Today" : "Coming up");
  const groups = state === "open"
    ? (["Overdue", "Today", "Coming up"] as const).map((g) => [g, rows.filter((r) => group(new Date(r.dueAt)) === g)] as const)
    : ([["Done", rows]] as const);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const date = String(f.get("date") || "");
    const time = String(f.get("time") || "09:00");
    const who = String(f.get("agentId") || "");
    create.mutate({
      title: String(f.get("title") || "").trim(),
      body: String(f.get("body") || "").trim() || undefined,
      // Local wall-clock time, as the agent typed it.
      dueAt: new Date(`${date}T${time}`).toISOString(),
      ...(who ? { agentId: who } : {}),
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-[880px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-5 flex items-end gap-4 flex-wrap">
        <div>
          <span className="t-label text-ink-3 block mb-3">Tasks</span>
          <h1 className="font-sans font-semibold text-page text-ink tabular" data-count={rows.length}>
            {isLoading ? "—" : `${rows.length}${data?.nextCursor ? "+" : ""} ${state === "open" ? "to do" : "done"}`}
          </h1>
        </div>
        <div className="ms-auto">
          <Button size="sm" variant="primary" onClick={() => setAdding((a) => !a)}>{adding ? "Never mind" : "Add a task"}</Button>
        </div>
      </header>

      {adding && (
        <form onSubmit={submit} className="grid gap-3 grid-cols-2 bg-sunk rounded-xl p-4 mb-6" aria-label="Add a task">
          <In name="title" label="What" required placeholder="Send Sarah the Marina Gate floor plan" className="col-span-2" />
          <In name="date" label="Day" type="date" required defaultValue={today} />
          <In name="time" label="Time" type="time" defaultValue="09:00" />
          {manager && (
            <label className="flex flex-col gap-1.5 col-span-2">
              <span className="t-label text-ink-3">For</span>
              <select name="agentId" defaultValue="" className={INPUT}>
                <option value="">Me</option>
                {(team?.members ?? []).map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name ?? m.user.email}</option>)}
              </select>
            </label>
          )}
          <In name="body" label="Note (optional)" className="col-span-2" />
          <div className="col-span-2 flex items-center gap-3">
            <Button type="submit" variant="primary" loading={create.isPending}>Add it</Button>
            {create.error && <p role="alert" className="text-sm text-danger">{create.error.message}</p>}
          </div>
        </form>
      )}

      <div className="flex gap-2 flex-wrap mb-6">
        {([["mine", "Mine"], ["asked", "I asked others"], ...(manager ? [["team", "Whole team"] as const] : [])] as [View, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} aria-pressed={view === k}
            className={cn("min-h-11 px-4 rounded-lg border text-ui",
              view === k ? "bg-accent text-on-accent border-accent-edge font-medium" : "border-rule text-ink")}>{l}</button>
        ))}
        <button onClick={() => setState(state === "open" ? "done" : "open")} className="btn-inline min-h-11 ms-auto">
          {state === "open" ? "Show done" : "Show to do"}
        </button>
      </div>

      {!isLoading && rows.length === 0 && (
        <p className="text-sub text-ink-2 border-t border-rule pt-5 max-w-[46ch]">
          {state === "open" ? "Nothing to do here. Add a task, or they arrive from voice notes and overnight." : "Nothing finished yet."}
        </p>
      )}

      {groups.map(([g, items]) => items.length > 0 && (
        <section key={g} className="mb-8" aria-label={g}>
          <h2 className={cn("t-label mb-1", g === "Overdue" ? "text-accent-deep" : "text-ink-3")}>{g} · {items.length}</h2>
          <ul className="border-t border-rule">
            {items.map((t) => (
              <li key={t.id} data-task={t.id} className="py-3 border-b border-rule flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-ui text-ink">{t.title}</p>
                  <p className="text-sm text-ink-3 mt-0.5">
                    {new Date(t.dueAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {t.lead && <> · <Link href={`/blackbook/${t.lead.id}`} className="text-ink-2">{t.lead.name}</Link></>}
                    {t.listing && <> · <Link href={`/listings?q=${encodeURIComponent(t.listing.reference)}`} className="text-ink-2">{t.listing.reference}</Link></>}
                    {!t.mine && t.assignee && <> · for {t.assignee}</>}
                    {t.askedBy && <> · asked by {t.askedBy}</>}
                  </p>
                  {t.body && <p className="text-sm text-ink-2 mt-1 max-w-[64ch]">{t.body}</p>}
                </div>
                {state === "open" ? (
                  <button type="button" className="btn-inline min-h-11 shrink-0" disabled={complete.isPending} onClick={() => complete.mutate({ id: t.id })}>Done</button>
                ) : (
                  <button type="button" className="min-h-11 px-2 text-sm text-ink-3 hover:text-ink shrink-0" onClick={() => reopen.mutate({ id: t.id })}>Not done</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const INPUT = "min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink";

/** 16px on every input — below that iOS zooms the page on focus. */
function In({ name, label, className, ...rest }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="t-label text-ink-3">{label}</span>
      <input name={name} autoComplete="off" className={INPUT} {...rest} />
    </label>
  );
}
