import { pageEnquiry, type EnquiryOutcome } from "@/server/lib/listings/enquiry";
import { loadLive } from "./public";

/**
 * An enquiry from an agent's microsite, or from a property page opened
 * from it. The site must be live for this brokerage — otherwise the
 * answer is the same 404 as an unknown page — and then it is the
 * brokerage's own enquiry path (`pageEnquiry`) with the lead directed to
 * that agent.
 */
export async function micrositeEnquiry(
  slug: string, agentSlug: string, data: Record<string, string | undefined>, ip: string | null,
): Promise<EnquiryOutcome> {
  const l = await loadLive(slug, agentSlug);
  if (!l) return { ok: false, status: 404, problem: "Not found." };
  return pageEnquiry(slug, data, ip, { micrositeId: l.site.id, userId: l.site.userId, name: l.content.name });
}
