/**
 * The accent colours an agent may give their microsite — the company
 * palette and nothing else.
 *
 * The scheme is the owner's decision, pink #FF1493 on grey #292C32, and
 * "an accent within the approved company palette" means exactly that: the
 * pink, and the scheme's own white and silver. Not new hues, and not even
 * a lighter pink — `palette.py` refuses any saturated colour that is not
 * exactly the accent, and an agent's page is the brokerage's page.
 *
 * The accent marks the agent's own details (the rule under their name,
 * the monogram, the dots between their areas), never the buttons, which
 * stay the brand pink so every microsite reads as one company's. Every
 * value reads on the grey ground at 3:1 or better and carries dark
 * initials on the monogram tile at 4.5:1 or better — `content.test.ts`
 * measures both. An admin chooses which of these their agents may use
 * (`Organisation.micrositeAccents`); none chosen means all.
 */
export const ACCENTS = {
  brand: { label: "Pink", hex: "#FF1493" },
  pearl: { label: "Pearl", hex: "#F3F4F6" },
  silver: { label: "Silver", hex: "#A0A5AE" },
} as const;

export type AccentKey = keyof typeof ACCENTS;
export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[];
export const DEFAULT_ACCENT: AccentKey = "brand";

/** Dark initials on the monogram tile. */
export const MONOGRAM_INK = "#1D1F23";

export const isAccent = (k: unknown): k is AccentKey => typeof k === "string" && k in ACCENTS;

/** The colours this brokerage allows: its choice, or all of them. */
export function allowedAccents(chosen: readonly string[] | null | undefined): AccentKey[] {
  const ok = (chosen ?? []).filter(isAccent);
  return ok.length ? ok : ACCENT_KEYS;
}

/** The accent to draw: the agent's, if still allowed, else the first allowed. */
export function accentFor(key: string | null | undefined, chosen: readonly string[] | null | undefined) {
  const allowed = allowedAccents(chosen);
  const k = isAccent(key) && allowed.includes(key) ? key : allowed.includes(DEFAULT_ACCENT) ? DEFAULT_ACCENT : allowed[0] ?? DEFAULT_ACCENT;
  return ACCENTS[k].hex;
}

/** WCAG contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r = 0, g = 0, bl = 0] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
