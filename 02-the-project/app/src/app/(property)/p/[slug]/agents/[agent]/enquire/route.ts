import { NextResponse } from "next/server";
import { micrositeEnquiry } from "@/server/lib/microsite/enquiry";
import { callerIp } from "@/server/lib/website/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The enquiry form on an agent's microsite, and on a property page opened
 * from it. Posted as a plain form, so it works with no script; the lead
 * goes to this agent (`micrositeEnquiry`).
 *
 * Answered with a redirect back to the page it came from, which must be
 * one of this brokerage's own pages — so the route is never a way to send
 * somebody elsewhere. A property page keeps its `?agent=` on the way back,
 * so the buyer is still on the agent's version of it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string; agent: string }> }) {
  const { slug, agent } = await params;
  const form = await req.formData().catch(() => null);
  const data: Record<string, string | undefined> = {};
  for (const [k, v] of form?.entries() ?? []) if (typeof v === "string") data[k] = v.slice(0, 4000);

  const home = `/p/${encodeURIComponent(slug)}`;
  const site = `${home}/agents/${encodeURIComponent(agent)}`;
  const raw = typeof data.back === "string" ? data.back : "";
  const back = raw.startsWith(`${home}/`) && !raw.includes("//") && !raw.includes("\\")
    ? raw.split("?")[0]!.split("#")[0]!
    : site;
  const keep = back === site ? "" : `agent=${encodeURIComponent(agent)}&`;

  const r = await micrositeEnquiry(slug, agent, data, callerIp(req));
  if (!r.ok && r.status === 404) return new NextResponse("Not found", { status: 404 });
  const q = r.ok ? "sent=1" : `problem=${encodeURIComponent(r.problem)}`;
  return NextResponse.redirect(new URL(`${back}?${keep}${q}#enquire`, req.url), 303);
}
