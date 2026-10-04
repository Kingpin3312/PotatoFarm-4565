import { ImageResponse } from "next/og";
import { readObject } from "@/server/lib/files/storage";
import { micrositePhotoKey } from "@/server/lib/microsite/public";
import { accentFor, MONOGRAM_INK } from "@/lib/microsite/palette";

/**
 * The card WhatsApp, LinkedIn and Facebook show when an agent shares
 * their microsite: their photograph (or monogram in their accent), name,
 * title and the brokerage. A site that is not live gets a card that
 * names nobody — the same one answer the page gives.
 *
 * Colours are the agreed scheme written out, because this renders
 * outside the stylesheet: ground #292C32, accent #FF1493, ink #F3F4F6,
 * ink-3 #A0A5AE.
 */
export const alt = "An agent's name, title and brokerage";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string; agent: string }> }) {
  const { slug, agent } = await params;
  const found = await micrositePhotoKey(slug, agent).catch(() => null);
  const frame = { width: "100%", height: "100%", display: "flex", background: "#292C32", color: "#F3F4F6", fontFamily: "sans-serif" };
  if (!found) {
    return new ImageResponse(
      <div style={{ ...frame, padding: "64px 72px", alignItems: "center" }}>
        <div style={{ fontSize: 44, color: "#A0A5AE" }}>This page is not available.</div>
      </div>,
      size,
    );
  }
  const c = found.loaded.content;
  const accent = accentFor(c.accent, found.loaded.org.micrositeAccents);
  let photo: string | null = null;
  if (found.key) {
    const bytes = await readObject(found.key).catch(() => null);
    if (bytes) photo = `data:${bytes[0] === 0x89 ? "image/png" : "image/jpeg"};base64,${Buffer.from(bytes).toString("base64")}`;
  }
  const parts = c.name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();

  return new ImageResponse(
    <div style={frame}>
      <div style={{ display: "flex", width: 470, height: 630, background: accent, alignItems: "center", justifyContent: "center" }}>
        {photo
          ? <img src={photo} alt="" width={470} height={630} style={{ width: 470, height: 630, objectFit: "cover" }} />
          : <div style={{ fontSize: 200, color: MONOGRAM_INK, letterSpacing: -6 }}>{initials}</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: "64px 64px", justifyContent: "space-between" }}>
        <div style={{ fontSize: 22, letterSpacing: 5, textTransform: "uppercase" }}>{found.loaded.org.name}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: c.name.length > 22 ? 58 : 72, lineHeight: 1.05 }}>{c.name}</div>
          <div style={{ display: "flex", width: 72, height: 3, background: accent, marginTop: 28 }} />
          <div style={{ fontSize: 30, color: "#A0A5AE", marginTop: 26 }}>{c.title}</div>
        </div>
        <div style={{ fontSize: 22, color: "#A0A5AE" }}>{c.brn ? `RERA broker card ${c.brn}` : " "}</div>
      </div>
    </div>,
    size,
  );
}
