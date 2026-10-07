import { NextResponse } from "next/server";
import { pageEnquiry } from "@/server/lib/listings/enquiry";
import { callerIp } from "@/server/lib/website/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The enquiry form on a brokerage's pages, posted as a plain form so it
 * works with no script at all. Answered with a redirect back to the page
 * it came from — "Thanks, we'll be in touch" or what to fix — never to
 * anywhere else: `back` must be this brokerage's own page.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await req.formData().catch(() => null);
  const data: Record<string, string | undefined> = {};
  for (const [k, v] of form?.entries() ?? []) if (typeof v === "string") data[k] = v.slice(0, 4000);

  const home = `/p/${encodeURIComponent(slug)}`;
  const back = typeof data.back === "string" && (data.back === home || data.back.startsWith(`${home}/`)) && !data.back.includes("//") && !data.back.includes("\\")
    ? data.back.split("?")[0]!.split("#")[0]!
    : home;

  const r = await pageEnquiry(slug, data, callerIp(req));
  if (!r.ok && r.status === 404) return new NextResponse("Not found", { status: 404 });
  const q = r.ok ? "sent=1" : `problem=${encodeURIComponent(r.problem)}`;
  return NextResponse.redirect(new URL(`${back}?${q}#enquire`, req.url), 303);
}
