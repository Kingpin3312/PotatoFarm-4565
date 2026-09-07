import { propertyFinder } from "./property-finder";
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
};
