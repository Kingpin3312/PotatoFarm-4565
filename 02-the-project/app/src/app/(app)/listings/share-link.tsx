"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";

/**
 * The property's own page, in the agent's hands.
 *
 * On a phone it opens the phone's share sheet — WhatsApp is one tap
 * away and the buyer sees the brokerage's preview card. At a desk it
 * copies the link. Either way the page's own gate has already decided:
 * a property that cannot be advertised says why instead of handing out
 * a link to "not available".
 */
export function ShareLink({ listingId }: { listingId: string }) {
  const utils = api.useUtils();
  const [said, setSaid] = useState<{ text: string; href?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    setSaid(null);
    try {
      const r = await utils.listings.share.fetch({ id: listingId });
      if (!r.ok) { setSaid({ text: r.reason }); return; }
      const url = `${location.origin}${r.path}`;
      const touch = window.matchMedia("(pointer: coarse)").matches;
      if (touch && navigator.share) {
        // Only "Shared" if it was: closing the sheet is not sharing.
        const sent = await navigator.share({ title: r.title, url }).then(() => true, () => false);
        if (sent) setSaid({ text: "Shared", href: url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setSaid({ text: "Link copied", href: url });
    } catch {
      setSaid({ text: "Could not reach the page. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={share} disabled={busy}
        className="min-h-11 px-1.5 text-sm text-ink-2 hover:text-ink hover:underline underline-offset-4 disabled:opacity-60 focus-visible:outline-none focus-visible:shadow-[var(--ring)] rounded-sm">
        Share link
      </button>
      {said && (
        <span role="status" className="text-note text-ink-3">
          {said.text}
          {said.href && (
            <>{" · "}<a href={said.href} target="_blank" rel="noopener" className="text-ink-2">Open page</a></>
          )}
        </span>
      )}
    </span>
  );
}
