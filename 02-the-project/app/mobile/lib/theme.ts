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
  ground: "#F4F3F0",   // warm white, not pure — the whole effect
  sunk:   "#EBEAE6",
  raised: "#FFFFFF",   // cards lift by being whiter than the ground

  ink:  "#1A1A1A",     // 16.94:1 — near-black with brown in it
  ink2: "#4A4A4A",     //  8.34:1
  ink3: "#6B6B6B",     //  5.86:1 on ground, 5.43:1 on panel
  rule: "#E2E0DA",

  /** Fill only. 3.12:1 on the ground — a non-text component, never type. */
  accent:      "#FF6600",
  accentHover: "#E55C00",
  /** The hairline on a fill. The orange is 2.9:1 on the panel, so the
   *  edge is what defines the button there. */
  accentEdge:  "#E55C00",
  /** Every word. 5.56:1 on ground, 5.15:1 on panel. */
  accentType:  "#FF6600",
  /** Labels on orange are ink. White is 3.23:1 and fails. */
  onAccent:    "#1A1A1A",

  /** The wordmark extension. Type, so it takes the deeper orange. */
  tld: "#FF6600",
  /** The two eyes in the mark. Darker than the rim so they read as
   *  holes rather than as shading. */
  markEye: "#3B2416",
  markBody: "#F0A03A",
  markRim:  "#D9761C",

  leather:     "#2E2E2E",
  leatherDeep: "#1A1A1A",

  danger:  "#B3261E",
  success: "#1F7A4C",
  warning: "#FF6600",
} as const;

export const dark = {
  ground: "#1A1A1A",
  sunk:   "#2E2E2E",
  raised: "#2E2E2E",

  ink:  "#EBEAE6",   // 14.49:1
  ink2: "#B5B5B5",   //  8.02:1
  ink3: "#8A8A8A",   //  4.74:1
  rule: "#2E2E2E",

  accent:      "#FF6600",   // 5.0:1 on leather — works as type here
  accentHover: "#FF6600",
  accentEdge:  "#E55C00",
  accentType:  "#FF6600",   // 6.96:1
  onAccent:    "#1A1A1A",

  tld: "#FF6600",
  markEye: "#3B2416",
  markBody: "#F0A03A",
  markRim:  "#D9761C",

  leather:     "#2E2E2E",
  leatherDeep: "#1A1A1A",

  danger:  "#F08076",
  success: "#5CBE86",
  warning: "#FF6600",
} as const;

/** Default is light. Dark is opt-in, not system-following — an agent
 *  who chose light does not want it flipping at sunset. */
export const t = light;
