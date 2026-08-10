# The orange

**`#FF6600`.** One colour, set by the owner. It goes on **every heading,
every button and every `.io`**, and the mark is built from it.

Before this, the palette carried two oranges — a fill at `#E87A2E` and a
darker type step at `#A84900` — on the rule that a fill and a word need
different contrast. That rule was replaced by a brand decision. This
document records what the decision costs, because the previous version
of this file described a `#FF6E00` family that existed in no asset
anywhere, and a palette document nobody can trust is worse than none.

Every figure below was measured, not estimated.

**Two families, and the split is deliberate.** The interface takes one
orange; the mark keeps its own warmer amber, because a logo is exempt
from contrast rules and a button is not.

### The interface

| Role | Hex | On ground `#F4F3F0` | On leather `#2E2E2E` | Where |
|---|---|---|---|---|
| **Brand** | **`#FF6600`** | **2.65:1** | **4.63:1** | Headings, buttons, `.io` |
| Hover / shade | `#E55C00` | 3.23:1 | 3.79:1 | Hover states |
| Edge | `#CC5200` | 3.96:1 | 3.09:1 | The hairline on every orange fill |
| Deep | `#A84900` | 5.23:1 | — | Captions and body links **only** |

### The mark

| Role | Hex | Where |
|---|---|---|
| Gradient high | `#F8BA5E` | The lit top-left of the body |
| Gradient mid | `#F0A03A` | The body |
| Gradient low | `#E5842A` | The lower right |
| Rim | `#D9761C` | The darker edge, all the way round |
| Crease | `#DD8A2E` | The cheek line and the surface marks |
| Eye | `#3B2416` | Dark brown, not black |

## What this costs, plainly

`#FF6600` as **text** on the cream ground is **2.65:1**. WCAG AA asks
4.5:1 for normal text and 3:1 for large. It clears neither.

That is a decision, not an oversight, and it is taken with the number in
front of us. What it means in practice: a person with reduced vision, or
anybody reading a phone in Dubai sunlight, will find orange type harder
than the near-black it replaced.

## The four rules that keep it usable

- **A label on orange is ink, never white.** `#1A1A1A` on `#FF6600` is
  **5.93:1** and passes. White is **2.94:1** and does not. Every button
  in the product takes `--on-accent`, which is ink.
- **Every orange fill carries a `#CC5200` hairline.** The fill is 2.65:1
  against the page, so the border is what makes the button's edge
  discernible. Not decoration, not optional.
- **Small orange type uses `--accent-deep` (`#A84900`, 5.23:1).**
  Captions, body links and the ten-pixel state labels in the interface.
  A 40px heading somebody scans and a 13px caption somebody reads word by
  word are not the same problem, and the brand decision was about
  headings.
- **Orange is never the only signal for a state.** Every place colour
  carries meaning also carries a word.

## On the dark surface it passes

`#FF6600` measures **4.63:1** on leather, which clears AA. The inverted
sections are the one place the brand colour is both correct and legible,
and worth using more if the palette is ever revisited.

## Where it lives

One source per surface, four surfaces: `app/src/styles/tokens.css`,
`website/assets/site.css`, and inline in each of the two design-system
pages. `consistency.py` compares the hexes across all four and fails the
build when one drifts.

`contrast.py` still measures every colour pair. The three brand
exceptions — `h1,h2,h3`, `.display` and `.brand .tld` — are listed by
name in `BRAND_EXCEPTIONS` with their measured value, printed on every
run, and **the check fails again if the ratio ever drops below the
recorded 2.65:1**. An exception that cannot detect its own drift is a
hole, not an exception.
