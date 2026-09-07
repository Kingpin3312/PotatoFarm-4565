"use client";

import { useEffect } from "react";

/**
 * Registers the service worker.
 *
 * A component rather than an inline `<script>`, and that is not a style
 * preference: `script-src` is `'nonce-…' 'strict-dynamic'`, so an inline
 * registration snippet would need the request nonce threaded into the
 * layout. A client component is already a nonce-stamped chunk, so it
 * registers with nothing extra and nothing to keep in step.
 *
 * Failure is swallowed on purpose. A worker that will not register — an
 * insecure origin, a browser that refuses, private mode — costs the
 * agent nothing except the fast cold start. Throwing here would take a
 * working page down for a performance feature.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Not in development: the worker caches build output that changes on
    // every save, and a stale chunk served from disk is an afternoon lost
    // to a bug that does not exist.
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    };
    // After load, so registration never competes with the first paint.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
