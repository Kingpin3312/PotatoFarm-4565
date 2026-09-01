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
  /** Labels on orange are ink — 5.73:1, against 3.13:1 for white.
   *  Reverses "no black on orange", which was set when the two were
   *  level. It matters more on this platform than on the web: a phone
   *  held up outside a building in Dubai is the whole case. */
  onAccent:    "#171717",

  /** The word "PotatoFarm" itself. The supplied logo sets it in a deep
   *  navy rather than the neutral ink beside it — 16.51:1 on the ground,
   *  and it dresses the wordmark and nothing else. Mirrors
   *  --brand-navy in tokens.css. */
  brandNavy: "#12202E",
  /** The wordmark extension. Type, so it takes the deeper orange. */
  tld: "#FF5A00",
  /** The mark's own brown — eyes, mouth, brow and cheek. It is the one
   *  warm colour in the product that is deliberately *not* the accent,
   *  because a flat orange body needs something dark to keep a face in
   *  it. `palette.py` carries it as the single exception. */
  markEye: "#3B2416",
  /** The body and its rim were #F0A03A over #D9761C — a gradient, and
   *  at hue 35.8 and 28.6 it was a visibly different orange from the
   *  interface at 19.8. That two-brands-on-one-screen effect is the
   *  thing the branding review actually reported. Flat, now, and the
   *  same value as everything else. */
  markBody: "#FF5A00",
  markRim:  "#FF5A00",

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
  onAccent:    "#171717",

  /** Navy on charcoal is 1.3:1, so the wordmark reverses out here for
   *  the same reason `ink` does. */
  brandNavy: "#F5F3F0",
  tld: "#FF5A00",
  markEye: "#3B2416",
  markBody: "#FF5A00",
  markRim:  "#FF5A00",

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
