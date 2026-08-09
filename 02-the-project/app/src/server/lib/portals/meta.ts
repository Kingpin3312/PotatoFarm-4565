import type { PortalAdapter, RawEnquiry } from "./types";
import { log } from "@/lib/log";
import crypto from "node:crypto";

/**
 * Facebook and Instagram lead ads.
 *
 * The one lead source with a documented, permitted API — unlike the
 * property portals, where the only public "APIs" are scrapers that get
 * your customer's account suspended. Here the brokerage connects their
 * own Page and Meta sends us a webhook.
 *
 * Two things make this different from a portal feed and both matter.
 */

/**
 * 1. The webhook carries an id, not the lead.
 *
 * Meta sends `leadgen_id` and nothing else — no name, no phone, no
 * answers. Everything has to be fetched back with the Page's own token
 * within the retention window.
 *
 * So a webhook that arrives while our token is expired is a lead we can
 * never recover. It is not like a portal payload we can replay from a
 * log. **The token failing is the failure**, and it is silent — which is
 * the exact shape this whole product is built to catch.
 */
export async function fetchLead(leadgenId: string, pageToken: string): Promise<RawEnquiry | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${leadgenId}?fields=created_time,field_data,ad_id,campaign_name,form_name,platform`,
      { headers: { Authorization: `Bearer ${pageToken}` }, signal: AbortSignal.timeout(12_000) }
    );

    if (res.status === 401 || res.status === 403) {
      // Distinguished from a transient failure on purpose. A retry will
      // not fix a dead token and the retention window is finite — this
      // has to reach a person today, not sit in a queue.
      log.error("meta token rejected — leads are being lost now", {}, { leadgenId, status: res.status });
      throw new TokenExpired();
    }
    if (!res.ok) {
      log.warn("meta lead fetch failed", {}, { leadgenId, status: res.status });
      return null;
    }

    const body = (await res.json()) as {
      created_time: string;
      platform?: string;
      form_name?: string;
      campaign_name?: string;
      ad_id?: string;
      field_data: { name: string; values: string[] }[];
    };

    return normalise(leadgenId, body);
  } catch (err) {
    if (err instanceof TokenExpired) throw err;
    log.warn("meta lead fetch threw", {}, { leadgenId, err: String(err).slice(0, 120) });
    return null;
  }
}

export class TokenExpired extends Error {
  constructor() { super("meta_token_expired"); }
}

/**
 * 2. The field names are whatever the brokerage typed into the form.
 *
 * A portal has a schema. Meta gives you the questions somebody wrote in
 * Ads Manager on a Tuesday — `full_name`, `Your Name`, `الاسم`,
 * `name_1`. There is no contract to code against.
 *
 * So this matches by pattern and keeps everything it did not recognise,
 * rather than dropping it. An unmatched answer is still what the buyer
 * told us, and losing "what's your budget?" because the brokerage
 * labelled it `budget_aed_range` would be worse than storing it plainly.
 */
const PATTERNS: [RegExp, keyof RawEnquiry][] = [
  [/^(full[_ ]?name|name|your[_ ]?name|الاسم)/i, "name"],
  [/(phone|mobile|whats|number|رقم|هاتف)/i, "phone"],
  [/(email|e-?mail|بريد)/i, "email"],
  [/(message|comment|question|enquiry|inquiry)/i, "message"],
];

function normalise(leadgenId: string, body: {
  created_time: string; platform?: string; form_name?: string;
  campaign_name?: string; ad_id?: string;
  field_data: { name: string; values: string[] }[];
}): RawEnquiry {
  const out: RawEnquiry = {
    externalId: leadgenId,
    receivedAt: new Date(body.created_time),
    // Required by the contract. Set up front rather than at the end, so
    // an early return can never produce an enquiry without it.
    raw: body,
  };
  const extra: Record<string, string> = {};

  for (const f of body.field_data) {
    const value = (f.values?.[0] ?? "").trim();
    if (!value) continue;
    const hit = PATTERNS.find(([re]) => re.test(f.name));
    if (hit && !out[hit[1]]) {
      (out as Record<string, unknown>)[hit[1]] = value;
    } else {
      // Kept, not dropped. This is where "budget", "timeframe" and
      // "which community" end up, and they are the most useful answers
      // on the form.
      extra[f.name] = value;
    }
  }

  if (Object.keys(extra).length) {
    // Appended to the message so an agent sees it in the thread rather
    // than in a field nobody opens.
    const lines = Object.entries(extra).map(([k, v]) => `${humanise(k)}: ${v}`);
    out.message = [out.message, ...lines].filter(Boolean).join("\n");
  }

  /**
   * Which advert this came from, carried through.
   *
   * A brokerage spending on Meta needs to know which campaign produced
   * the buyer who completed — that is the difference between doubling
   * the spend and stopping it. Nobody else in this market passes it
   * through to the deal.
   */
  out.source = [body.platform, body.campaign_name, body.form_name]
    .filter(Boolean).join(" · ") || "Meta lead ad";
  out.raw = { ad_id: body.ad_id, platform: body.platform, form: body.form_name };

  return out;
}

const humanise = (k: string) =>
  k.replace(/[_-]+/g, " ").replace(/\?$/, "").trim()
   .replace(/^./, (c) => c.toUpperCase());

/**
 * Meta's webhook signature.
 *
 * SHA-256 HMAC over the raw body, compared in constant time. The same
 * rule as every other webhook here: verify against the bytes received,
 * never against a re-serialised object, because `JSON.parse` then
 * `JSON.stringify` changes key order and whitespace and the signature
 * stops matching for reasons nobody can debug at eleven at night.
 */
export function verifySignature(rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto
    .createHmac("sha256", process.env.META_APP_SECRET ?? "")
    .update(rawBody, "utf8")
    .digest("hex");
  const given = header.slice(7);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export const metaAdapter: PortalAdapter = {
  key: "META_LEAD_ADS",
  label: "Facebook & Instagram",
  /**
   * Meta delivers within seconds and retries for up to 36 hours. Silence
   * for a day is a real problem rather than a quiet period — brokerages
   * do not switch their ads off overnight.
   */
  silenceAfterHours: 24,
};
