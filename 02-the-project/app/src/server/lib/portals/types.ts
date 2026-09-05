/**
 * Portal adapter contract.
 *
 * Everything portal-specific lives behind this interface. The ingestion
 * pipeline, deduplication, lead matching and first-response trigger are
 * written once and know nothing about Property Finder or Bayut.
 *
 * A warning that belongs at the top of this file rather than buried in a
 * README: the only publicly documented "APIs" for these portals are
 * third-party scrapers. Do not build on them. They breach the portals'
 * terms, and the account they get suspended is your customer's portal
 * account — the one their entire lead flow depends on. Official lead
 * delivery comes through a partner agreement with each portal. Get the
 * agreement, then fill in the adapter.
 */

export type PortalKey =
  | "PROPERTY_FINDER"
  | "BAYUT"
  | "DUBIZZLE"
  | "WEBSITE_FORM"
  /**
   * Meta Lead Ads — Facebook and Instagram.
   *
   * Added last and it should have been first. A large share of Dubai
   * brokerage lead spend goes to Instagram lead forms, and for some
   * firms it is the majority. Ingesting only the portals meant our
   * entire argument — that we answer faster than anyone — did not apply
   * to the channel a brokerage spends most on.
   *
   * Unlike the property portals, this one has a real, documented,
   * permitted API. No scraping, no partner agreement, no grey area: the
   * brokerage connects their own Page and we receive a webhook.
   */
  | "META_LEAD_ADS";

/** What every portal gives us, once the differences are stripped away. */
export type RawEnquiry = {
  /** The portal's own id for this enquiry. The deduplication key. */
  externalId: string;
  receivedAt: Date;
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
  /** The portal's reference for the property, matched to our own listing. */
  listingRef?: string;
  language?: string;
  /** Anything the adapter could not map. Kept for debugging, never parsed. */
  /**
   * Which advert or form this came from.
   *
   * Portals have one source; Meta has a campaign, an ad set and a form,
   * and a brokerage spending on ads needs to know which produced the
   * buyer who completed. That is the difference between doubling the
   * spend and stopping it, and nobody else in this market carries it
   * through to the deal.
   */
  source?: string;
  raw: unknown;
};

export type Adapter = {
  key: PortalKey;
  label: string;

  /**
   * How enquiries arrive. Push is always preferable — the product promise
   * is a reply in seconds, and a five-minute poll makes that impossible
   * for four minutes and fifty-nine of every five minutes.
   */
  delivery: "push" | "poll";

  /** Push adapters only. Reject anything unsigned. */
  verify?(rawBody: string, headers: Headers, secret: string): boolean;

  /** Turn one delivery into zero or more enquiries. */
  parse(payload: unknown): RawEnquiry[];

  /** Poll adapters only. `since` is the last successful watermark. */
  fetchSince?(credentials: Record<string, string>, since: Date): Promise<RawEnquiry[]>;
};
