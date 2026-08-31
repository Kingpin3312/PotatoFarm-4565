# The palette

**Three colours: `#E86A2C`, `#12202E` and charcoal.** The orange was
set by the owner. The navy arrived with the supplied logo artwork and
dresses the wordmark only — it is not an interface colour, and `--ink`
stays neutral. There is no fourth hue anywhere in the product.

**Where the orange goes, and where it stopped going.** Primary actions,
the active navigation state, selected rows, focus, the assistant's own
output, and the `.io`. Roughly 2% of any screen.

It used to go on every heading as well, and that is the one line of
this file worth reading twice, because it was wrong in two separate
ways and both were invisible until something measured them.

*The arithmetic.* Option 1 sets the surface at roughly 70% white, 20%
warm grey, 8% charcoal and 2% orange. A 68px hero headline is not 2% of
anything. On a 390px phone the marketing front page came out majority
orange, and "Book a call" — the only thing on that page with a job —
competed with the sentence above it instead of standing out from it.

*The contrast.* `h3` is 20px at weight 500. WCAG large text starts at
24px, or 18.66px bold, so an orange h3 needed 4.5:1 and had 3.22:1.
`contrast.py` allowed it, because the exception was written against the
whole `h1,h2,h3` selector on the grounds that "every heading these
selectors cover is display-sized" — true of two of the three. An
exception written per-selector cannot see that one element in the group
is a different size from the others.

Headings are `#171717` now, at 17.93:1, and the exception is deleted
rather than narrowed. Everything that is not orange is ink.

Two palettes ago this file described a `#FF6E00` family that existed in
no asset anywhere, so the rule now is that every figure below is
measured against the shipped token, not estimated and not carried
forward. `03-brand/repalette.py` is what moves all the surfaces at once,
and `consistency.py` fails the build if one of them drifts.

**The mark is the exception, and it is the only one.** A logo is exempt
from contrast rules; a button is not. The illustration keeps its warmer
accent gradient. The `.io` beside it does not — that is type.

### The interface

Every figure re-measured against the shipped tokens under Option 1.
The previous version of this table carried the cream-ground numbers
forward — `#E86A2C` was recorded at 2.56:1 and is 3.22:1 on white, and
the navy at 14.88:1 is 16.51:1 — which is precisely the drift the
paragraph above says this file exists to prevent.

| Role | Hex | On ground `#FFFFFF` | On panel `#F5F3F0` | Where |
|---|---|---|---|---|
| **Brand** | **`#E86A2C`** | **3.22:1** | 2.90:1 | Fills, focus, active state, selected, `.io` — **never type** |
| **Wordmark navy** | **`#12202E`** | **16.51:1** | 14.91:1 | "PotatoFarm", and nothing else |
| Hover / shade | `#CF5A22` | 4.09:1 | 3.69:1 | Hover on a fill — never type |
| Edge | `#B94E1F` | 5.03:1 | **4.54:1** | The hairline on every orange fill |
| Deep | `#A0431B` | **6.34:1** | 5.72:1 | Orange type at any size — captions, links, labels |
| Soft | `#FFF1E8` | — | — | The tint on machine-written text and selected rows |
| Ink | `#171717` | **17.93:1** | 16.19:1 | Headings, body, button labels, figures, tables |
| Ink-2 | `#4A4A4A` | 8.86:1 | 8.00:1 | Secondary body |
| Ink-3 | `#6B6B6B` | 5.33:1 | 4.81:1 | Captions and 10px labels |
| Rule | `#E7E5E2` | 1.26:1 | — | Separators — decorative only |
| Rule-strong | `#918A82` | 3.41:1 | 3.08:1 | Form-control boundaries (WCAG 1.4.11) |

`#171717` on `#E86A2C` is **5.57:1**; white on it is **3.22:1** and
fails. Every label on a fill takes `--on-accent`, which is charcoal.

### The dark surfaces are charcoal, not black

| Role | Hex | Where |
|---|---|---|
| Charcoal ground | `#2A2825` | The inverted band, and the mobile dark theme |
| Charcoal raised | `#34322F` | Cards lifted inside that band |
| Rule | `#42403D` | Borders on the dark surface |
| Type | `#F5F3F0` · `#B5B5B5` · `#9A9A96` | 12.21 · 7.17 · 5.21 on the ground |

On charcoal the brand orange measures **5.18:1** and clears AA
comfortably. The inverted sections are the one place it is both correct
and fully legible.

**Charcoal has a ceiling, and it is lower than it looks.** Two pairs set
it: the accent has to work as type on the *raised* step inside the band,
and `.on-leather` sets `--on-accent: var(--leather-deep)`, so the ground
colour is also the label on every orange button there. Both must clear
4.5:1, which stops the ground going much past `#2A2825`. It is a real
charcoal, not a mid grey, and it cannot be a mid grey while the orange
is doing work on top of it.

The muted grey had to move with it: `--leather-ink-3` was `#8A8A8A` at
4.74:1 on black and falls to 4.03:1 on charcoal. It is `#9A9A96` now.
Raising the floor of a surface raises everything standing on it, and
that is the step a palette change usually forgets.

`03-brand/charcoal.py` carries the measurements and makes the change.
It edits **named declarations, never hex values** — `#171717` was both
`--ink` and `--leather-deep`, so a value-level replace would have turned
every heading and every button label charcoal too.

### The mark

| Role | Hex | Where |
|---|---|---|
| Gradient high | `#F39263` | The lit top-left. A tint of the accent, hue 19.8 |
| Gradient mid | `#E86A2C` | The body — `--accent`, the `.io` orange itself |
| Gradient low | `#CF5A22` | The lower right — `--accent-hover` |
| Rim | `#B94E1F` | The darker edge — `--accent-edge` |
| Crease | `#CF5A22` | The cheek line and surface marks — `--accent-hover` |

**One orange.** Four of the five above are literally the interface
tokens; only the highlight is a tint, because the ramp does not go up
from the accent.

This table used to describe an amber gradient — hue 28.6 to 35.8 —
while the interface and the `.io` sat at 18.0 to 19.8. Up to sixteen
degrees apart is a different orange, not a shade of one, and on a screen
showing the logo beside an orange button it read as two brands. The
reversed lockups carried a third, `#FF8533`, on the `.io` of all things.

`palette.py` measures this now: any warm, saturated colour that ships
must be within six degrees of the accent.
| Eye | `#3B2416` | Dark brown, not black |

Drawn in one place — `03-brand/logo/mark.py` — and inlined into 34 copies
by `--apply`.

## What this costs, plainly

**Nothing, now.** That sentence used to read differently, and the
change is the point of this section.

`#E86A2C` as text on white is **3.22:1**. WCAG AA asks 4.5:1 for normal
text and 3:1 for large. It clears the second and not the first — so as
long as the orange is a *surface* colour, and orange type steps down
the same hue until it is readable, nothing in this product is below the
threshold for what it is.

That is only true because the headings moved. While the orange dressed
every heading, this file recorded a deliberate accessibility cost: a
person with reduced vision, or anybody reading a phone in Dubai
sunlight, would find an orange heading harder than the near-black it
replaced. That cost was accepted on the grounds that the brand was
worth it. It has now been removed instead, and the brand is not
diminished — the orange sits on the button, which is what a customer
perceives as the brand colour anyway.

## The four rules that keep it usable

- **A label on orange is ink, never white.** `#171717` on `#E86A2C` is
  **5.57:1** and passes. White is **3.22:1** and does not — a 16px
  semibold button label is not "large text", which starts at 18.66px
  bold. Every button takes `--on-accent`, which is ink.
- **Every orange fill carries a `#B94E1F` hairline.** The fill is
  2.90:1 against a panel, so the border is what makes the button's edge
  discernible against what is behind it. WCAG 1.4.11 asks 3:1 of a
  control boundary; the edge is 4.54:1 there. Not decoration, not
  optional.
- **Orange type is `--accent-deep` (`#A0431B`, 6.34:1) at every size.**
  Not "small orange type" — every size. That distinction used to carve
  out headings and it is what let a 20px h3 through at 3.22:1.
  `browser:option1` opens thirteen screens and measures computed colour
  against computed size, because reading eighty-nine call sites is not
  how the wrong ones get found.
- **Colour is never the only signal for a state.** This became load-
  bearing when the green and the red were removed — see below. It
  applies to the soft orange too: `#FFF1E8` on `#FFFFFF` is a 1.11:1
  tint, which is a reinforcement and not a signal, so every panel it
  marks carries a word as well.

## State is no longer a colour

`--success` was `#1F7A4C` and `--danger` was `#B3261E`. Both are gone:
success is now ink, danger is `--accent-deep`.

**This was checked before it was done.** All 32 places that used them
already carried the word beside the colour — "Sent.", "PAID", "Reply
window closed", or the error sentence itself inside a `role="alert"` —
so the hue was reinforcement and removing it removes nothing a person or
a screen reader relied on.

**Two places were the exception**, and they are the reason this section
exists rather than a line in a changelog:

| Component | Was | Now |
|---|---|---|
| `settings/kill-switch.tsx` | green dot / orange dot | hollow ring / filled dot |
| `ui/window-state.tsx` | cyan dot / red dot | hollow ring / filled dot |

In both, colour genuinely *was* the only difference between two states —
and one of them is the 24-hour reply window, the single piece of state in
this product whose failure is silent. Shape carries it now, which
survives this palette, the next one, and colour blindness.

## Where it lives

One source per surface, four surfaces: `app/src/styles/tokens.css`,
`website/assets/site.css`, and inline in each of the two design-system
pages. `consistency.py` compares the hexes across all four and fails when
one drifts.

`contrast.py` still measures every colour pair. The three brand
exceptions — `h1,h2,h3`, `.display` and `.brand .tld` — are listed by
name in `BRAND_EXCEPTIONS` with their measured value, printed on every
run, and **the check fails again if the ratio ever drops below the
recorded 2.56:1**. Proved by setting the orange to `#FF9977` and watching
all three fail at 1.88:1. An exception that cannot detect its own drift
is a hole, not an exception.
