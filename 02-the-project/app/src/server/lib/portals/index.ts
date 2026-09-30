import { propertyFinder } from "./property-finder";
import { websiteForm } from "./website-form";
import type { Adapter } from "./types";

/**
 * Adapter registry. Adding a portal is one file plus one line here —
 * nothing downstream changes.
 *
 * Bayut and Dubizzle are both Dubizzle Group and, in practice, share a
 * delivery mechanism. Confirm that against the partner agreement before
 * assuming one adapter covers both; the assumption is reasonable and it
 * is still an assumption.
 */
export const adapters: Record<string, Adapter> = {
  PROPERTY_FINDER: propertyFinder,
  /**
   * The brokerage's own site, and the only one here that needed no
   * agreement from anybody — which is why its absence was the
   * expensive one. `channels.connect` accepted WEBSITE_FORM and the
   * settings screen printed a webhook URL, while a post to that URL
   * answered 404 "Unknown portal." for the life of the product.
   *
   * `04-audit-scripts/channels.py` now fails the build on a channel
   * type a brokerage can connect with nothing able to deliver to it.
   */
  WEBSITE_FORM: websiteForm,
};
