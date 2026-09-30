"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * A task about this person, from their page.
 *
 * The follow-up a conversation ends with — "send her the floor plan
 * Thursday" — written where the agent is when they agree to it, linked
 * to the person so it opens back here from the list.
 */
export function PersonTask({ leadId, name }: { leadId: string; name: string | null }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const utils = api.useUtils();
  const create = api.tasks.create.useMutation({
    onSuccess: () => { setOpen(false); void utils.today.followUps.invalidate(); void utils.tasks.list.invalidate(); },
  });
  const today = new Date().toISOString().slice(0, 10);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title") || "").trim();
    create.mutate({ title, leadId, dueAt: new Date(`${f.get("date")}T${f.get("time") || "09:00"}`).toISOString() },
      { onSuccess: () => setDone(title) });
  }

  return (
    <section className="mb-10" aria-labelledby="task-heading">
      <h2 id="task-heading" className="font-sans font-medium text-sub text-ink mb-1">Next step</h2>
      {done && !open && <p className="text-sm text-ink-2" role="status">On your list: {done}</p>}
      {open ? (
        <form onSubmit={submit} className="grid grid-cols-2 gap-3 mt-2 max-w-[520px]">
          <label className="flex flex-col gap-1.5 col-span-2">
            <span className="t-label text-ink-3">What</span>
            <input name="title" required minLength={2} placeholder={`Send ${name?.split(" ")[0] ?? "them"} the floor plan`} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="t-label text-ink-3">Day</span>
            <input name="date" type="date" required defaultValue={today} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="t-label text-ink-3">Time</span>
            <input name="time" type="time" defaultValue="09:00" className={INPUT} />
          </label>
          <div className="col-span-2 flex gap-3 items-center">
            <Button type="submit" variant="primary" size="sm" loading={create.isPending}>Add to my list</Button>
            <button type="button" className="btn-inline min-h-11" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          {create.error && <p role="alert" className="col-span-2 text-sm text-danger">{create.error.message}</p>}
        </form>
      ) : (
        <button type="button" className="btn-inline min-h-11" onClick={() => { setDone(null); setOpen(true); }}>Add a task</button>
      )}
    </section>
  );
}

/** 16px on every input — below that iOS zooms the page on focus. */
const INPUT = "min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink";
