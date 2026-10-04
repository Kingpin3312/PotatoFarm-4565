import { NextResponse } from "next/server";
import { micrositeMedia } from "@/server/lib/microsite/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The agent's profile photograph, for their live microsite only.
 *
 * A redirect to an address signed for a few minutes, never the bucket's
 * own: the bucket stays private, and a site that is unpublished or taken
 * down takes its photographs with it. One 404 for every kind of miss.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; agent: string }> }) {
  const { slug, agent } = await params;
  const url = await micrositeMedia(slug, agent, "photo").catch(() => null);
  if (!url) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "public, max-age=300", "Referrer-Policy": "no-referrer" },
  });
}
