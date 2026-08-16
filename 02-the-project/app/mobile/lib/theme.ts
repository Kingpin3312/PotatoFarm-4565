/**
 * The palette, native side.
 *
 * The same values as the web tokens. Duplicated because React Native
 * has no CSS custom properties — not because there are two palettes.
 * `_check.py` compares the two, and it is what caught this file still
 * being entirely on the previous navy palette after the web had moved.
 *
 * The app is cream by default. So is the website now — a palette ago
 * the site was dark-first and the app light-first, and keeping two
 * opposite polarities inside one product was a seam nobody wanted.
 */
export const light = {
  ground: "#FFFFFF",   // warm white, not pure — the whole effect
  sunk:   "#F5F3F0",
  raised: "#FFFFFF",   // cards lift by being whiter than the ground

  ink:  "#171717",     // 16.94:1 — near-black with brown in it
  ink2: "#4A4A4A",     //  8.34:1
  ink3: "#6B6B6B",     //  5.86:1 on ground, 5.43:1 on panel
  rule: "#E7E5E2",

  /** Fill only. 3.12:1 on the ground — a non-text component, never type. */
  accent:      "#E86A2C",
  accentHover: "#CF5A22",
  /** The hairline on a fill. The orange is 2.9:1 on the panel, so the
   *  edge is what defines the button there. */
  accentEdge:  "#CF5A22",
  /** Every word. 5.56:1 on ground, 5.15:1 on panel. */
  accentType:  "#E86A2C",
  /** Labels on orange are ink. White is 3.23:1 and fails. */
  onAccent:    "#171717",

  /** The word "PotatoFarm" itself. The supplied logo sets it in a deep
   *  navy rather than the neutral ink beside it — 14.88:1 on the ground,
   *  and it dresses the wordmark and nothing else. Mirrors
   *  --brand-navy in tokens.css. */
  brandNavy: "#12202E",
  /** The wordmark extension. Type, so it takes the deeper orange. */
  tld: "#E86A2C",
  /** The two eyes in the mark. Darker than the rim so they read as
   *  holes rather than as shading. */
  markEye: "#3B2416",
  markBody: "#F0A03A",
  markRim:  "#D9761C",

  /* The inverted band inside the light theme. Charcoal, matching
     --leather / --leather-deep in tokens.css. */
  leather:     "#34322F",
  leatherDeep: "#2A2825",

  danger:  "#A0431B",
  success: "#171717",
  warning: "#E86A2C",
} as const;

export const dark = {
  /* Charcoal, not black — the same surfaces as the web app's dark band,
     and the same reason: a pure black ground under a warm palette reads
     as a hole rather than a material. Kept in step with
     --leather-deep / --leather in tokens.css; 03-brand/charcoal.py has
     the measurements and the ceiling that sets them. */
  ground: "#2A2825",
  sunk:   "#34322F",
  raised: "#34322F",

  ink:  "#F5F3F0",   // 12.21:1
  ink2: "#B5B5B5",   //  7.17:1
  ink3: "#9A9A96",   //  5.21:1 — #8A8A8A fell to 4.03 on charcoal
  rule: "#42403D",

  accent:      "#E86A2C",   // 5.18:1 on this ground — works as type here
  accentHover: "#E86A2C",
  accentEdge:  "#CF5A22",
  accentType:  "#E86A2C",   // 5.18:1
  /* The label on an orange button. It is the ground colour, so it moved
     with it — and 5.18:1 on the orange is why the ground could not go
     any lighter than this. */
  onAccent:    "#2A2825",

  /** Navy on charcoal is 1.3:1, so the wordmark reverses out here for
   *  the same reason `ink` does. */
  brandNavy: "#F5F3F0",
  tld: "#E86A2C",
  markEye: "#3B2416",
  markBody: "#F0A03A",
  markRim:  "#D9761C",

  leather:     "#34322F",
  leatherDeep: "#2A2825",

  /* Two colours here as well. On this ground the brand orange measures
     5.18:1, so danger needs no darker step — the light theme's
     #A0431B exists only because cream is a bright surface. Success is
     ink, as it is in the light theme: the word carries it. */
  danger:  "#E86A2C",
  success: "#F5F3F0",
  warning: "#E86A2C",
} as const;

/** Default is light. Dark is opt-in, not system-following — an agent
 *  who chose light does not want it flipping at sunset. */
export const t = light;
