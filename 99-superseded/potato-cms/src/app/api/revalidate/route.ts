import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "next-sanity/webhook";

/**
 * Sanity calls this whenever a document is published.
 *
 * The signature check is the whole security model here — without it,
 * anyone who finds the URL can flush your cache on a loop. parseBody
 * verifies it against the shared secret and rejects everything else.
 */
export async function POST(req: NextRequest) {
  try {
    const { isValidSignature, body } = await parseBody<{ _type: string; slug?: { current: string } }>(
      req,
      process.env.SANITY_REVALIDATE_SECRET
    );

    if (!isValidSignature) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }
    if (!body?._type) {
      return NextResponse.json({ error: "Nothing to revalidate." }, { status: 400 });
    }

    // Clear the type that changed, plus anything that embeds it. A
    // testimonial edit has to clear the homepage too, or the change
    // appears on one page and not the other — which is worse than it not
    // appearing at all, because nobody notices.
    const tags = new Set<string>([body._type]);
    if (["testimonial", "customerLogo", "faq"].includes(body._type)) tags.add("homePage");
    if (body._type === "faq") tags.add("plans");
    if (body._type === "siteSettings") tags.add("layout");

    tags.forEach(revalidateTag);

    return NextResponse.json({ revalidated: [...tags], at: Date.now() });
  } catch (err) {
    console.error("[revalidate]", err);
    return NextResponse.json({ error: "Revalidation failed." }, { status: 500 });
  }
}
