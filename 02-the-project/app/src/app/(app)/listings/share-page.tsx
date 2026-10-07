"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";

/**
 * The brokerage's own page — every property it may advertise, and a form
 * — in the agent's hands. Same behaviour as a property's Share link: the
 * phone's share sheet on a phone, the clipboard at a desk, and a plain
 * reason instead of a link when there is nothing to show yet.
 */
export function SharePage() {
  const utils = api.useUtils();
  const [said, setSaid] = useState<{ text: string; href?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    setSaid(null);
    try {
      const r = await utils.listings.sharePage.fetch();
      if (!r.ok) { setSaid({ text: r.reason }); return; }
      const url = `${location.origin}${r.path}`;
      const touch = window.matchMedia("(pointer: coarse)").matches;
      if (touch && navigator.share) {
        const sent = await navigator.share({ title: `Properties from ${r.brokerage}`, url }).then(() => true, () => false);
        if (sent) setSaid({ text: "Shared", href: url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setSaid({ text: `Link copied — ${r.count} propert${r.count === 1 ? "y" : "ies"} on it`, href: url });
    } catch {
      setSaid({ text: "Could not reach the page. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <button type="button" onClick={share} disabled={busy} data-share-page
        className="min-h-11 px-1.5 text-sm text-ink-2 hover:text-ink hover:underline underline-offset-4 disabled:opacity-60 focus-visible:outline-none focus-visible:shadow-[var(--ring)] rounded-sm">
        Share your listings page
      </button>
      {said && (
        <span role="status" className="text-note text-ink-3">
          {said.text}
          {said.href && <>{" · "}<a href={said.href} target="_blank" rel="noopener" className="text-ink-2">Open page</a></>}
        </span>
      )}
    </span>
  );
}
