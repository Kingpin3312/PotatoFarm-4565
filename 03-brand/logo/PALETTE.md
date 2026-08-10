# The palette

**Two colours: `#FF6B35` and black.** Set by the owner. The orange goes
on **every heading, every tab, every link, every accent and the `.io`**.
Everything that is not orange is ink. There is no third hue anywhere in
the product.

Two palettes ago this file described a `#FF6E00` family that existed in
no asset anywhere, so the rule now is that every figure below is
measured against the shipped token, not estimated and not carried
forward. `03-brand/repalette.py` is what moves all the surfaces at once,
and `consistency.py` fails the build if one of them drifts.

**The mark is the exception, and it is the only one.** A logo is exempt
from contrast rules; a button is not. The illustration keeps its warmer
amber gradient. The `.io` beside it does not — that is type.

### The interface

| Role | Hex | On ground `#F4F3F0` | On panel `#EBEAE6` | Where |
|---|---|---|---|---|
| **Brand** | **`#FF6B35`** | **2.56:1** | 2.36:1 | Headings, tabs, links, accents, `.io` |
| Hover / shade | `#E85A25` | 3.20:1 | 2.95:1 | Hover on a fill — never type |
| Edge | `#CC4E1D` | 4.05:1 | **3.73:1** | The hairline on every orange fill |
| Deep | `#A84015` | **5.55:1** | 5.12:1 | Captions and inline links **only** |
| Ink | `#1A1A1A` | 16.94:1 | — | Body, button labels, figures, tables |

### The dark surfaces are charcoal, not black

| Role | Hex | Where |
|---|---|---|
| Charcoal ground | `#2A2825` | The inverted band, and the mobile dark theme |
| Charcoal raised | `#34322F` | Cards lifted inside that band |
| Rule | `#42403D` | Borders on the dark surface |
| Type | `#EBEAE6` · `#B5B5B5` · `#9A9A96` | 12.21 · 7.17 · 5.21 on the ground |

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
It edits **named declarations, never hex values** — `#1A1A1A` was both
`--ink` and `--leather-deep`, so a value-level replace would have turned
every heading and every button label charcoal too.

### The mark

| Role | Hex | Where |
|---|---|---|
| Gradient high | `#F8BA5E` | The lit top-left of the body |
| Gradient mid | `#F0A03A` | The body |
| Gradient low | `#E5842A` | The lower right |
| Rim | `#D9761C` | The darker edge, all the way round |
| Crease | `#DD8A2E` | The cheek line and the surface marks |
| Eye | `#3B2416` | Dark brown, not black |

Drawn in one place — `03-brand/logo/mark.py` — and inlined into 34 copies
by `--apply`.

## What this costs, plainly

`#FF6B35` as **text** on the cream ground is **2.56:1**. WCAG AA asks
4.5:1 for normal text and 3:1 for large. It clears neither.

That is a decision, taken with the number in front of us, not an
oversight. What it means in practice: a person with reduced vision, or
anybody reading a phone in Dubai sunlight, will find an orange heading
harder than the near-black it replaced. The four rules below are what
keep that confined to headings.

## The four rules that keep it usable

- **A label on orange is ink, never white.** `#1A1A1A` on `#FF6B35` is
  **6.14:1** and passes. White is **2.84:1** and does not. Every button
  takes `--on-accent`, which is ink.
- **Every orange fill carries a `#CC4E1D` hairline.** The fill is 2.36:1
  against a panel, so the border is what makes the button's edge
  discernible. Not decoration, not optional.
- **Small orange type uses `--accent-deep` (`#A84015`, 5.55:1).**
  Captions, inline links and the ten-pixel state labels. A 40px heading
  somebody scans and a 13px caption somebody reads word by word are not
  the same problem, and the brand decision was about headings.
- **Colour is never the only signal for a state.** This became load-
  bearing when the green and the red were removed — see below.

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
