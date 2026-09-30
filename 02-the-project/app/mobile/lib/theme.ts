/**
 * The palette, native side.
 *
 * The same values as the web tokens. Duplicated because React Native
 * has no CSS custom properties — not because there are two palettes.
 * `_check.py` compares the two, and it is what caught this file still
 * being entirely on the previous navy palette after the web had moved.
 *
 * Neon pink on grey, like the web app and the website: `light` is the
 * default grey theme (the name is kept because screens import it) and
 * `dark` is the darker band of the same grey.
 */
export const light = {
  ground: "#292C32",   // the brief's grey — the dominant surface
  sunk:   "#2F3238",
  raised: "#33373E",   // cards lift by being a lighter grey

  ink:  "#F3F4F6",     // 12.72:1 — near-white, not pure white
  ink2: "#C9CCD2",     //  8.70:1
  ink3: "#A0A5AE",     //  5.66:1 on ground, 5.19:1 on panel
  rule: "#3D4148",

  /**
   * One pink, and every name below is the same value: fills, the
   * pressed state, the hairline and pink type. A state is carried by
   * opacity or by fill-versus-outline, never by a second shade.
   *
   * 3.85:1 on the ground — enough for a non-text component; pink words
   * are a direction taken with the number known.
   */
  accent:      "#FF1493",
  accentHover: "#FF1493",
  accentEdge:  "#FF1493",
  accentType:  "#FF1493",
  /** Labels on pink are white — 3.64:1. Below AA for small text and
   *  chosen knowingly; labels are semibold. See `tokens.css`. */
  onAccent:    "#FFFFFF",

  /** The word "PotatoFarm" itself. The logo's navy disappears on the
   *  grey, so the word reverses out to ink. Mirrors --brand-navy in
   *  tokens.css. */
  brandNavy: "#F3F4F6",
  /** The wordmark extension: the pink. */
  tld: "#FF1493",
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

  /* The darker band: a darker step of the same grey, matching
     --leather / --leather-deep in tokens.css. */
  leather:     "#25282D",
  leatherDeep: "#1F2126",

  /* One pink means an error is told apart by its words and by shape —
     outlined where an everyday action is filled. Same argument as
     tokens.css. */
  danger:  "#FF1493",
  success: "#F3F4F6",
  warning: "#FF1493",
} as const;

export const dark = {
  /* The darker grey, not black — the same surfaces as the web app's
     dark band, and the same reason: a black ground reads as a hole
     rather than a material. Kept in step with --leather-deep /
     --leather in tokens.css. */
  ground: "#1F2126",
  sunk:   "#25282D",
  raised: "#25282D",

  ink:  "#F3F4F6",   // 14.64:1
  ink2: "#C9CCD2",   // 10.01:1
  ink3: "#A0A5AE",   //  6.51:1
  rule: "#373A41",

  accent:      "#FF1493",   // 4.43:1 on this ground
  accentHover: "#FF1493",
  accentEdge:  "#FF1493",
  accentType:  "#FF1493",   // 4.43:1
  /* The label on a pink button: white, 3.64:1, as in the light theme. */
  onAccent:    "#FFFFFF",

  /** The wordmark reverses out to ink here, as it does on the grey. */
  brandNavy: "#F3F4F6",
  tld: "#FF1493",
  /** The mark itself does not reverse. A logo is reproduced as a unit,
   *  so only the wordmark above takes a light fill on the dark grey; every
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

  leather:     "#25282D",
  leatherDeep: "#1F2126",

  /* Danger is the pink, 4.43:1 on this ground. Success is ink, as it
     is in the grey theme: the word carries it. */
  danger:  "#FF1493",
  success: "#F3F4F6",
  warning: "#FF1493",
} as const;

/** Default is the grey theme. The darker one is opt-in, not
 *  system-following — an agent's choice should not flip at sunset. */
export const t = light;
