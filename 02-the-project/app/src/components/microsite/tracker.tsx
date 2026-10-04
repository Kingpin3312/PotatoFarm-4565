"use client";

import { useEffect } from "react";

/**
 * Tells the agent's numbers what happened on their page: one view on
 * load (or a property view, on a property page opened from it), then each
 * tap on something marked `data-track` — WhatsApp, a call, an email, a
 * property.
 *
 * A beacon, so it never delays the WhatsApp or the phone call the tap
 * opens, and nothing at all when the browser has no `sendBeacon`. Counted
 * here rather than when the server draws the page, because link previews
 * fetch the page too and nobody looked at those.
 */
export function MicrositeTracker({ endpoint, onLoad }: { endpoint: string; onLoad: { k: "view" | "property"; ref?: string } }) {
  useEffect(() => {
    const send = (k: string, ref?: string | null) => {
      try {
        navigator.sendBeacon?.(endpoint, new Blob([JSON.stringify({ k, ref: ref ?? undefined })], { type: "text/plain" }));
      } catch { /* counting is never worth an error */ }
    };
    send(onLoad.k, onLoad.ref);
    const click = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-track]");
      if (el) send(el.getAttribute("data-track") ?? "", el.getAttribute("data-ref"));
    };
    document.addEventListener("click", click, { capture: true });
    return () => document.removeEventListener("click", click, { capture: true });
  }, [endpoint, onLoad.k, onLoad.ref]);
  return null;
}
