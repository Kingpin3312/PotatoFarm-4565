"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Kept outside the component: opening the new thread moves from `/inbox`
 * to `/inbox/<id>`, which is another page, and the list — this panel with
 * it — mounts again. In state, "why was nothing drafted" was set and
 * thrown away in the same instant.
 */
let lastNote: string | null = null;

const INPUT = "min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink";

/**
 * "Try a live enquiry" — shown only in a demonstration brokerage.
 *
 * One press puts a realistic buyer's message through the real intake
 * (`demo.enquiry`): the room watches it arrive, the lead appear, and a
 * reply get drafted. "Type your own" lets a prospect in the meeting write
 * the message themselves, which is the more convincing version.
 */
export function LiveEnquiry({ onArrived }: { onArrived: (conversationId: string) => void }) {
  const utils = api.useUtils();
  const [own, setOwn] = useState(false);
  const [note, setNoteState] = useState<string | null>(lastNote);
  const setNote = (n: string | null) => { lastNote = n; setNoteState(n); };
  const send = api.demo.enquiry.useMutation({
    onSuccess: async (r) => {
      setNote(r.why);
      setOwn(false);
      await utils.conversations.list.invalidate();
      onArrived(r.conversationId);
    },
  });

  return (
    <div className="px-5 py-3 border-b border-rule flex flex-col gap-2.5">
      <div className="flex gap-2.5 flex-wrap">
        <Button size="sm" disabled={send.isPending} onClick={() => { setNote(null); send.mutate({}); }}>
          {send.isPending ? "A buyer is writing…" : "Try a live enquiry"}
        </Button>
        <Button size="sm" variant="quiet" aria-expanded={own} onClick={() => setOwn((v) => !v)}>
          Type your own
        </Button>
      </div>
      {own && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setNote(null);
            send.mutate({
              name: String(f.get("name") ?? "").trim() || undefined,
              body: String(f.get("body") ?? "").trim(),
            });
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="t-label text-ink-3">Their name</span>
            <input name="name" maxLength={60} placeholder="Any name" className={INPUT} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="t-label text-ink-3">What they write — English or Arabic</span>
            <textarea name="body" required maxLength={1000} rows={3}
              placeholder="Hi, is the 2 bed in Dubai Marina still available?"
              className={`${INPUT} py-2`} />
          </label>
          <Button size="sm" type="submit" disabled={send.isPending}>Send as the buyer</Button>
        </form>
      )}
      {send.error && <p role="alert" className="text-sm text-danger-deep">{send.error.message}</p>}
      {note && <p className="text-sm text-ink-2">{note}</p>}
    </div>
  );
}
