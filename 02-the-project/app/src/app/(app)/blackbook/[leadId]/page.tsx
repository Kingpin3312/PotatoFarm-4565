"use client";

import { use, useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";

/**
 * One person, everything said to them.
 *
 * WhatsApp, email, viewings and offers on one line each, newest first.
 * The competing product's whole pitch is putting these in one place —
 * the hard part is that they are different shapes, and interleaving
 * them raw produces a list nobody can read.
 */
export default function Person({ params }: { params: Promise<{ leadId: string }> }) {
  // Next 15 hands `params` to a page as a Promise. This component is
  // a client component, so `use()` is how it is unwrapped — reading
  // `leadId` straight off it yields undefined, and the query
  // below would have run against nothing.
  const { leadId } = use(params);
  const { data, isLoading, isError, refetch, error } =
    api.blackbook.person.useQuery({ leadId: leadId });
  const note = api.blackbook.note.useMutation();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  if (isError) return <QueryError retry={() => void refetch()} what="this person" error={error} />;
  if (isLoading) return <div className="max-w-[680px] mx-auto px-6 pt-10"><div className="h-72 bg-sunk rounded-sm" aria-busy /></div>;

  const w = data?.replyWindow;

  return (
    <div className="max-w-[680px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-5">
        <a href="/blackbook" className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3 no-underline">
          ← Blackbook
        </a>
      </header>

      {/* The reply window, on the person rather than the thread. This is
          the moment it matters — an agent looking at somebody's history
          is usually about to message them, and after 24 hours a normal
          message does not arrive and nothing says so. */}
      {w && !w.open && (
        <div className="bg-sunk rounded-xl p-4 border-l-[3px] border-l-accent-edge mb-6">
          <p className="text-[15px] text-ink font-semibold">The reply window has closed</p>
          <p className="text-sm text-ink-2 mt-1 max-w-[46ch] leading-snug">
            A normal message won't arrive — WhatsApp accepts it and never delivers it. Use an
            approved template, or ring them.
          </p>
        </div>
      )}
      {w?.open && w.hoursLeft <= 4 && (
        <div className="bg-sunk rounded-xl p-4 border-l-[3px] border-l-accent-edge mb-6">
          <p className="text-[15px] text-ink">
            <strong>{w.hoursLeft}h left</strong> to reply normally.
          </p>
        </div>
      )}

      <h2 className="font-sans font-semibold text-[17px] text-accent-deep mb-1">Your note</h2>
      <p className="text-sm text-ink-3 mb-3">Yours alone. No manager sees this.</p>
      {editing ? (
        <>
          <label htmlFor="pnote" className="sr-only">Your private note</label>
          <textarea id="pnote" rows={4} value={draft} onChange={(e) => setDraft(e.target.value)}
            className="w-full px-4 py-2.5 text-[16px] text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
          <Button variant="primary" className="mt-3" loading={note.isPending}
            onClick={() => note.mutate({ id: leadId, privateNote: draft },
                                       { onSuccess: () => setEditing(false) })}>
            Save
          </Button>
        </>
      ) : (
        <button className="btn-inline" onClick={() => setEditing(true)}>Write a note</button>
      )}

      <h2 className="font-sans font-semibold text-[17px] text-accent-deep mt-10 mb-3">Everything</h2>
      <div className="border-t border-ink">
        {(data?.entries ?? []).map((e, i) => (
          <div key={i} className="flex items-baseline gap-3 py-3 border-b border-rule">
            <span className={cn("font-mono text-[10px] uppercase tracking-[0.1em] w-16 shrink-0",
              e.channel === "email" ? "text-ink-3"
              : e.channel === "whatsapp" ? "text-ink-3"
              : "text-accent-deep")}>
              {e.channel === "whatsapp" ? "wa" : e.channel}
            </span>
            <span className="text-[15px] text-ink flex-1 leading-snug">
              {e.direction === "out" && <span className="text-ink-3 mr-1.5">you</span>}
              {e.summary}
            </span>
            {e.link && (
              <a href={e.link} target="_blank" rel="noreferrer"
                 className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent-deep no-underline shrink-0">
                open
              </a>
            )}
            <span className="font-mono text-[11px] text-ink-3 shrink-0 tabular">
              {new Date(e.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
