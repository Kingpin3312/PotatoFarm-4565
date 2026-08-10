"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Taking your book with you.
 *
 * The ownership split promises an agent can leave with their notes.
 * Until this existed the promise was a paragraph in a design document —
 * and a promise with no button is worse than not making it.
 *
 * Both halves are stated before the download, not discovered afterwards
 * by somebody who assumed they were taking the client list.
 */
export function ExportBlackbook() {
  const exportMine = api.blackbook.exportMine.useMutation();
  const [asked, setAsked] = useState(false);

  if (exportMine.isSuccess) {
    const d = exportMine.data;
    return (
      <div className="border-t border-rule pt-5 mt-10">
        <p className="text-[16px] text-ink font-semibold">
          {d.entries.length} entries ready.
        </p>
        <Button variant="primary" className="mt-3"
          onClick={() => {
            const blob = new Blob([JSON.stringify(d.entries, null, 2)],
                                  { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `blackbook-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}>
          Download
        </Button>
      </div>
    );
  }

  return (
    <div className="border-t border-rule pt-5 mt-10">
      <h2 className="font-sans font-semibold text-[17px] text-accent-type mb-2">Export your book</h2>
      {!asked ? (
        <>
          <p className="text-sm text-ink-2 max-w-[48ch] leading-snug">
            Your notes, nicknames and tags, in a file you keep. Yours whether you stay or go.
          </p>
          <Button variant="secondary" className="mt-3" onClick={() => setAsked(true)}>
            Export
          </Button>
        </>
      ) : (
        <div className="bg-sunk rounded-xl p-4">
          {/* Said plainly, before the download. Somebody discovering
              this afterwards feels tricked; reading it first does not. */}
          <p className="text-[15px] text-ink font-semibold">What you get</p>
          <p className="text-sm text-ink-2 mt-1 max-w-[46ch] leading-snug">
            Your notes, your nicknames, your tags — everything on this page.
          </p>
          <p className="text-[15px] text-ink font-semibold mt-4">What stays</p>
          <p className="text-sm text-ink-2 mt-1 max-w-[46ch] leading-snug">
            Client records, message history and the compliance file. The brokerage is legally
            required to keep those for five years, and no version of this lets them leave.
          </p>
          <div className="flex gap-2 mt-4">
            <Button variant="primary" loading={exportMine.isPending}
              onClick={() => exportMine.mutate()}>
              Build the file
            </Button>
            <Button variant="secondary" onClick={() => setAsked(false)}>Cancel</Button>
          </div>
          <p className="text-sm text-ink-3 mt-3 max-w-[46ch] leading-snug">
            A bulk export is recorded — not to stop you, but because any large read of
            personal data is a security event even when it is entirely legitimate.
          </p>
        </div>
      )}
    </div>
  );
}
