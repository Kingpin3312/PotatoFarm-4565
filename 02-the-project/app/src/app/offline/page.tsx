/**
 * What an agent sees with no connection.
 *
 * Reachable two ways: the service worker serves it when a page request
 * fails, and it is a real route so it can be precached in the first
 * place. It takes no session and asks for no data, so the cached copy
 * stays correct for anybody.
 *
 * **No `force-static` here, and that is not an oversight.** The root
 * layout is `force-dynamic` — the CSP nonce requires per-request
 * rendering — and that wins over a child page. Declaring `force-static`
 * would have been a claim the build quietly ignores, which is worse than
 * not declaring it. It costs nothing: the worker caches the response at
 * install time and serves that copy when the network is gone.
 *
 * It is also listed as public in `middleware.ts`. Without that, fetching
 * it to precache while signed out returns a redirect to sign-in, and the
 * offline fallback becomes a cached 307.
 */
import { Logo } from "@/components/brand/logo";

export const metadata = { title: "No connection — PotatoFarm.io" };

export default function Offline() {
  return (
    <main id="main" className="mx-auto max-w-[520px] px-6 pt-16 pb-24">
      {/* The offline page is served by the service worker with no shell
          around it, so it was the one screen in the product with no
          logo — a bare sentence on a cream page, which reads as a
          browser error rather than as this product telling you
          something. */}
      <Logo className="mb-10" />
      <h1 className="font-sans text-page font-semibold text-ink">
        No connection.
      </h1>
      <p className="mt-4 text-ink-2 leading-snug">
        PotatoFarm needs a signal to show your leads — they are not kept on
        this phone, deliberately.
      </p>
      <p className="mt-3 text-ink-2 leading-snug">
        Anything you send while offline is not saved. Try again once you have a
        bar or two.
      </p>
      <p className="mt-6 text-note text-ink-3 leading-snug">
        If you are in a basement car park, one floor up is usually enough.
      </p>
    </main>
  );
}
