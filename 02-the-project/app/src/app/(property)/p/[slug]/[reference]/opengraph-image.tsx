import { ImageResponse } from "next/og";
import { publicListing } from "@/server/lib/listings/public";
import { aedWhole } from "@/lib/money";

/**
 * The card WhatsApp shows when an agent pastes a property's link.
 *
 * It is what the buyer sees first, and usually all they see before
 * deciding whether to tap. Drawn from the listing rather than from a
 * photograph — photos are references until storage is wired for them —
 * in the page's own monochrome, under the brokerage's name.
 *
 * A property the page withholds gets a card that names nothing: not
 * the brokerage, not the title. The preview must give the same one
 * answer the page does, or a link becomes a way to learn what a
 * brokerage has taken off the market.
 *
 * Colours are the product's neutrals written out, because this renders
 * outside the stylesheet: ground #292C32, ink #F3F4F6, ink-3 #A0A5AE,
 * rule #3D4148.
 */
export const alt = "A property, with its price and main facts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string; reference: string }> }) {
  const { slug, reference } = await params;
  const l = await publicListing(slug, decodeURIComponent(reference));

  const frame = { width: "100%", height: "100%", display: "flex", flexDirection: "column" as const,
    background: "#292C32", color: "#F3F4F6", padding: "64px 72px", fontFamily: "sans-serif" };

  if (!l) {
    return new ImageResponse(
      <div style={{ ...frame, justifyContent: "center" }}>
        <div style={{ fontSize: 44, color: "#A0A5AE" }}>This property is no longer available.</div>
      </div>,
      size,
    );
  }

  const price = l.priceFils === null ? null : aedWhole(l.priceFils);
  const facts = [
    l.bedrooms !== null ? (l.bedrooms === 0 ? "Studio" : `${l.bedrooms} bed`) : null,
    l.bathrooms !== null ? `${l.bathrooms} bath` : null,
    l.areaSqft !== null ? `${l.areaSqft.toLocaleString("en-GB")} sq ft` : null,
    l.community,
  ].filter(Boolean).join("   ·   ");

  return new ImageResponse(
    <div style={frame}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, letterSpacing: 5, textTransform: "uppercase" }}>
        <span>{l.brokerage}</span>
        <span style={{ color: "#A0A5AE" }}>{l.purpose === "RENT" ? "To let" : "For sale"}</span>
      </div>
      <div style={{ display: "flex", height: 1, background: "#3D4148", marginTop: 28 }} />
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
        <div style={{ fontSize: 66, lineHeight: 1.1, maxWidth: 980 }}>{l.title}</div>
        {facts && <div style={{ fontSize: 28, color: "#A0A5AE", marginTop: 26 }}>{facts}</div>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        {/* One string: the renderer refuses a block with two text
            children unless it is laid out as flex. */}
        <div style={{ fontSize: 48 }}>{`${price ?? ""}${l.purpose === "RENT" && price ? " a year" : ""}`}</div>
        <div style={{ fontSize: 20, color: "#A0A5AE" }}>{`Ref ${l.reference}   ·   Permit ${l.permitNumber}`}</div>
      </div>
    </div>,
    size,
  );
}
