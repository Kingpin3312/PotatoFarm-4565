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
