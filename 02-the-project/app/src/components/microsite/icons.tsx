/**
 * The handful of marks a microsite needs, drawn here rather than pulled
 * from an icon set the product does not otherwise use. Decorative: every
 * one sits beside a visible word or carries an `aria-label` on its link.
 */
type P = { className?: string };
const base = "shrink-0";

export function WhatsAppMark({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${base} ${className ?? "size-5"}`} fill="currentColor">
      <path d="M12 2.2a9.7 9.7 0 0 0-8.4 14.6L2.3 21.8l5.1-1.3A9.7 9.7 0 1 0 12 2.2Zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 19.9Zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.7 2.7 0 0 0-.9 2c0 1.2.9 2.4 1 2.5.1.2 1.7 2.7 4.2 3.8 1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.5-.3Z" />
    </svg>
  );
}

export function PhoneMark({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${base} ${className ?? "size-5"}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3.5h3.2l1.6 4-2 1.3a11 11 0 0 0 5.4 5.4l1.3-2 4 1.6V17a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 3 5.7 2 2 0 0 1 5 3.5Z" />
    </svg>
  );
}

export function MailMark({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${base} ${className ?? "size-5"}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3.8 7 8.2 6 8.2-6" />
    </svg>
  );
}

/** The networks, as their initial in a circle — recognisable, and not anybody's trademark artwork. */
const GLYPH: Record<string, string> = { instagram: "Ig", linkedin: "in", facebook: "f", tiktok: "Tk", x: "X", youtube: "Yt" };

export function SocialMark({ network, className }: P & { network: string }) {
  return (
    <span aria-hidden="true" className={`${base} inline-grid place-items-center rounded-full border border-current text-[11px] font-medium tracking-normal ${className ?? "size-8"}`}>
      {GLYPH[network] ?? "•"}
    </span>
  );
}

const line = (d: string) => function LineIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${base} ${className ?? "size-5"}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
};

export const BedMark = line("M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 15h18M6 9V6.5A1.5 1.5 0 0 1 7.5 5h3A1.5 1.5 0 0 1 12 6.5V9M3 18v2M21 18v2");
export const BathMark = line("M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3ZM6 12V6a2 2 0 0 1 3.5-1.3M7 19l-1 2M17 19l1 2");
export const SizeMark = line("M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6");
export const ArrowMark = line("M5 12h14M13 6l6 6-6 6");
export const KeyMark = line("M14.5 9.5a4 4 0 1 1-1.2 2.9L4 21.7V18h2.5v-2.5H9l1.6-1.6M16.5 7.5h.01");
export const TagMark = line("M3 12V4h8l10 10-8 8L3 12ZM7.5 7.5h.01");
export const BuildingMark = line("M4 21V5l8-3 8 3v16M4 21h16M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1");
export const ChartMark = line("M4 20V4M4 20h16M8 16l4-5 3 3 5-7");
export const PlaneMark = line("M10.5 13.5 3 11l1-2 8 1 5-6a1.5 1.5 0 0 1 2.2 2L14 11l1 8-2 1-2.5-6.5L7 17l.5 2.5L6 21l-1.5-3.5L1 16l1.5-1.5L5 15l3.5-3.5");
