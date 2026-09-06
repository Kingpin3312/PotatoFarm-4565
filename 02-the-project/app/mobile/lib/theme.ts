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

  ink:  "#171717",     // 17.93:1 — near-black with brown in it
  ink2: "#4A4A4A",     //  8.86:1
  ink3: "#6B6B6B",     //  5.33:1 on ground, 4.81:1 on panel
  rule: "#E7E5E2",

  /**
   * One orange, and every name below is the same value.
   *
   * `accentHover` and `accentEdge` were #CF5A22 — a darker step for a
   * pressed state and for the hairline that defined an orange fill
   * against the panel. Both were real, and both are gone: the direction
   * is one orange rather than a family of them, so a state is carried
   * by opacity or by fill-versus-outline, never by a second orange.
   *
   * 3.22:1 on the ground and 2.90:1 on the panel — a non-text component
   * on both, and orange type is a brand decision taken with the number
   * known rather than a passing measurement.
   */
  accent:      "#FF5A00",
  accentHover: "#FF5A00",
  accentEdge:  "#FF5A00",
  accentType:  "#FF5A00",
  /** Labels on orange are white — 3.13:1, against 5.73:1 for ink.
   *  Below AA and chosen knowingly by the brand owner. It matters most
   *  on this platform: a phone held up outside a building in Dubai is
   *  the hardest case for a 3.13:1 label. See `tokens.css`. */
  onAccent:    "#FFFFFF",

  /** The word "PotatoFarm" itself. The supplied logo sets it in a deep
   *  navy rather than the neutral ink beside it — 16.51:1 on the ground,
   *  and it dresses the wordmark and nothing else. Mirrors
   *  --brand-navy in tokens.css. */
  brandNavy: "#12202E",
  /** The wordmark extension. Type, so it takes the deeper orange. */
  tld: "#FF5A00",
  /** The mark's own brown — the eyes, and only the eyes now that the
   *  creases are orange. Deliberately *not* the accent: a face needs
   *  something dark in it. Mirrors EYE in `03-brand/logo/mark.py`. */
  markEye: "#4A1E0C",
  /** The body, lit, on the owner's direction — mirrors G_HIGH, G_MID,
   *  G_WARM and G_LOW in `03-brand/logo/mark.py`, which is the file
   *  that defines the mark and the only one to change.
   *
   *  This block has been wrong twice in the same way and it is worth
   *  saying why rather than deleting the history. It first carried
   *  #F0A03A over #D9761C — hue 35.8 and 28.6 against an interface at
   *  19.8, which is the two-brands-on-one-screen effect a branding
   *  review reported. It was then flattened to a single #FF5A00, and
   *  when the artwork became a gradient again this file was not in
   *  `mark.py --apply`'s target list, so it kept the flat value and the
   *  old brown — caught by `palette.py`, months after the web moved.
   *
   *  Every value here is inside the 8-45 hue window, so the mark is the
   *  product's orange with light on it rather than a second orange. */
  markBody:    "#FCA51B",
  markBodyHi:  "#FFD04A",
  markBodyWarm:"#F2760A",
  markBodyLow: "#D24500",
  markRim:     "#E8620A",
  markRimLow:  "#9E2A00",
  markCrease:  "#D2530C",
  /** The soft lobe over the lower right. Mirrors SHADE. */
  markShade:   "#B23600",

  /* The inverted band inside the light theme. Charcoal, matching
     --leather / --leather-deep in tokens.css. */
  leather:     "#34322F",
  leatherDeep: "#2A2825",

  /* `danger` was #A0431B so an error did not look like a link. One
     orange means an error is told apart by its words and by shape —
     outlined where an everyday action is filled. Same argument as
     tokens.css. */
  danger:  "#FF5A00",
  success: "#171717",
  warning: "#FF5A00",
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

  ink:  "#F5F3F0",   // 13.27:1
  ink2: "#B5B5B5",   //  7.17:1
  ink3: "#9A9A96",   //  5.21:1 — #8A8A8A fell to 4.03 on charcoal
  rule: "#42403D",

  accent:      "#FF5A00",   // 4.57:1 on this ground — works as type here
  accentHover: "#FF5A00",
  accentEdge:  "#FF5A00",
  accentType:  "#FF5A00",   // 4.57:1
  /* The label on an orange button. It is the ground colour, so it moved
     with it — and 4.57:1 against the orange is why the ground cannot go
     any lighter at all.

     This said 5.18:1 in both places until it was measured. The
     conclusion was right and the margin was not: 0.07 above the 4.5:1
     floor, not 0.68. A number nobody rechecks is how a palette drifts
     one step past a threshold and still reads as comfortable. */
  onAccent:    "#FFFFFF",

  /** Navy on charcoal is 1.3:1, so the wordmark reverses out here for
   *  the same reason `ink` does. */
  brandNavy: "#F5F3F0",
  tld: "#FF5A00",
  /** The mark itself does not reverse. A logo is reproduced as a unit,
   *  so only the wordmark above takes a light fill on charcoal; every
   *  value below is the same one the light theme uses and mirrors
   *  `03-brand/logo/mark.py`.
   *
   *  This block was missed when the light theme was updated — it is the
   *  second copy of the same tokens in the same file, forty lines
   *  further down, and it kept the old brown and the flat body. Caught
   *  by `palette.py`, which is the only reason it is not still here. */
  markEye:      "#4A1E0C",
  markBody:     "#FCA51B",
  markBodyHi:   "#FFD04A",
  markBodyWarm: "#F2760A",
  markBodyLow:  "#D24500",
  markRim:      "#E8620A",
  markRimLow:   "#9E2A00",
  markCrease:   "#D2530C",
  markShade:    "#B23600",

  leather:     "#34322F",
  leatherDeep: "#2A2825",

  /* On this ground the brand orange measures 4.57:1, so danger needed
     no darker step here even before the ramp was collapsed. Success is
     ink, as it is in the light theme: the word carries it. */
  danger:  "#FF5A00",
  success: "#F5F3F0",
  warning: "#FF5A00",
} as const;

/** Default is light. Dark is opt-in, not system-following — an agent
 *  who chose light does not want it flipping at sunset. */
export const t = light;
