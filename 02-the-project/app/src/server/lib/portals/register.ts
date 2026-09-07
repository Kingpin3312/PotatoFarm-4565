import { registerPublisher, publishingConfigured } from "./publish";
import { log } from "@/lib/log";

/**
 * The one place a portal integration is switched on.
 *
 * ## Why this file exists
 *
 * `registerPublisher()` was written, exported, documented and **called
 * from nowhere**. `publisherFor()` therefore returned null for every
 * portal, for ever, and `portals/queue.ts` marked every queued listing
 * as having no integration. The structure was complete and the switch
 * had no wire behind it — the thirteenth instance of the shape this
 * codebase keeps producing, and the one that mattered most, because
 * advertising a property is what a brokerage buys the product to do.
 *
 * Writing an adapter would not have fixed it. Nothing would have called
 * that either. **The missing piece was a place for the call to live**,
 * reached on every boot, which is what this is.
 *
 * ## What it deliberately does not do
 *
 * It does not invent a portal. There is no adapter here for Property
 * Finder, Bayut or Dubizzle, because each needs a partner agreement and
 * the wire format that comes with it, and a stub that pretends to
 * publish is worse than an honest absence — it would tell a brokerage a
 * property is live when it is not. `queue.ts` says the same thing about
 * `PUBLISHED`.
 *
 * So on the day an agreement is signed the work is: write the adapter,
 * add one line below, set its credentials. Nothing else in the codebase
 * changes.
 */
export function registerPortalPublishers(): void {
  /* ------------------------------------------------------------------
   * Add a portal here.
   *
   *   import the publisher, then register it behind its own credential:
   *   read that portal's key from the environment, and call
   *   `registerPublisher(...)` only when the key is present.
   *
   *   Add the key to `.env.example` in the same commit — `crm-audit.py`
   *   fails the build on an environment variable the code reads and the
   *   example file does not name, because nobody deploying this would
   *   otherwise know to set it.
   *
   * Guard each one on its own credential rather than registering
   * unconditionally: a publisher with no key fails on the first send
   * and burns a retry, where an unregistered one is reported honestly
   * as not connected and keeps its retry budget for the day the key
   * arrives.
   * ------------------------------------------------------------------ */

  const live = publishingConfigured();

  if (live.length === 0) {
    /**
     * Said out loud at boot, in the same voice as the unconfigured
     * services in `instrumentation.ts`, and for the same reason: a
     * brokerage whose listings reach no portal should not have to
     * deduce that from an empty screen.
     */
    log.warn(
      "[portals] no publishing integration is registered — listings will queue as " +
        "NOT_CONNECTED and reach no portal. This is a commercial agreement, not a " +
        "setting. The listing feed at /api/feed/<token>/listings.xml works without one.",
    );
    return;
  }

  log.info("[portals] publishing is live", {}, { portals: live.join(", ") });
}
