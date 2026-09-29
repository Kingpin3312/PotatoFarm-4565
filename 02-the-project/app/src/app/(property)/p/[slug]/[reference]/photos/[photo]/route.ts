import { NextResponse } from "next/server";
import { publicPhoto } from "@/server/lib/listings/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One photo of a public property.
 *
 * A redirect to a URL signed for a few minutes, never the bucket's own
 * address: the bucket stays private, and a property the page withholds —
 * sold, unpermitted, deleted — takes its photos with it, because this
 * asks the page's own gate first. One 404 for every kind of miss, the
 * same rule the page keeps, so an id cannot be used to learn anything.
 *
 * The redirect is cached for less than the signature lives, so a browser
 * or portal that caches it never follows it after it has expired.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; reference: string; photo: string }> },
) {
  const { slug, reference, photo } = await params;
  if (!photo || photo.length > 40) return new NextResponse("Not found", { status: 404 });
  const url = await publicPhoto(slug, decodeURIComponent(reference), photo).catch(() => null);
  if (!url) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "public, max-age=300", "Referrer-Policy": "no-referrer" },
  });
}
