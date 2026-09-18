# v4 — warm white, Hermès orange

> **The numbers in this file are historical. Do not build against them.**
>
> The only source of truth for the palette is
> `02-the-project/app/src/styles/tokens.css`. The website's
> `assets/site.css` and the two reference pages in this folder carry the
> same values, and `consistency.py` compares all four hex-by-hex and
> fails on any drift.
>
> This document was written during the v4 design pass and its three
> headline hexes were later adjusted:
>
> | | This document | **Shipped** |
> |---|---|---|
> | ground | `#FDFBF7` | **`#F4F3F0`** |
> | accent | `#FF6600` | **`#FF6B35`** |
> | accent-type | `#A84A16` | **`#FF6B35`** |
> | accent-edge | `#B8500F` | **`#CC4E1D`** |
> | accent-deep | — | **`#A84015`** |
> | success | `#1F7A4C` | **`#1A1A1A`** — state is not a hue any more |
> | danger | `#B3261E` | **`#A84015`** |
>
> A stale fourth copy of the palette used to sit beside this file as
> `tokens.css`, carrying ground `#F8F7F4` and accent `#FF6E00` — a
> visibly different orange, in the folder a designer opens first. Nothing
> imported it, so nothing caught it. It has been deleted and the
> hex-by-hex check added.
>
> **The reasoning below is still correct and is why the palette is shaped
> the way it is.** It is kept for that, not for the numbers.

## The one change to the brief

**The white is not pure white.**

Hermès does not put orange on `#FFFFFF`. It puts it on a warm cream,
anchored by deep brown leather. Pure white plus orange reads as a budget
airline; cream plus orange plus brown reads as the reference.

The ground is warm by about 2%, and that 2% is the whole effect. The
near-black has brown in it for the same reason: a neutral grey next to
orange looks like a spreadsheet.

## One accent, and a deeper step for small type

The brand orange is **#FF6B35**, by owner decision, on every heading,
every tab, every link and every `.io`. It measures **2.56:1** on the
ground —
below the 4.5:1 AA floor for text and below the 3:1 floor for large
text. That is the cost, stated rather than buried.

    --accent       fills, and the brand colour itself
    --accent-type  headings, tabs, links, .io — the same #FF6B35
    --accent-edge  #CC4E1D, the hairline on every fill
    --accent-deep  #A84015 at 5.55:1 — captions and inline links only

There used to be two oranges on the rule that a fill and a word need
different contrast. The brand decision merged them; `--accent-deep`
survives because the decision was about **headings**, and applying it to
a 13px caption as well would have been collateral rather than compliance.

**Three rules keep it usable, and all three came from measurement:**

**Labels on orange are ink, never white.** White measures 2.84:1 and
fails; ink is **6.14:1** and passes. An orange button with near-black
type is also the more Hermès answer, so the measurement and the
reference agreed — which does not always happen.

**Every fill carries an edge.** The orange is 2.56:1 on the ground and
**2.36:1 on the cream panel** — failing on both, harder on one. The
hairline is what defines the boundary regardless of what is behind it,
and with the brand orange it is load-bearing rather than a nicety.

**On charcoal it passes.** #FF6B35 measures **5.18:1** on the dark
surface, the one place the brand colour is both correct and legible.
That surface is `#2A2825` — charcoal rather than the near-black it was,
because a pure black band under a warm cream page reads as a hole in it
rather than as a material.

**Hot is the only thing wearing the accent.** With one orange, every
other lead state is deliberately neutral. That is a stronger signal than
two oranges competing, and the eye lands on hot without being told.

## What the port turned up

Bringing the dashboard across from v3 left **110 lines of dead token
definitions** — a complete second `:root` plus `.on-dark` and
`.on-light` blocks, half of them self-referential (`--accent:
var(--accent)`) and half pointing at tokens v4 does not define.

Nothing used them. Dead CSS referencing dead tokens is worse than
untidy: the next person reads it as the theme system and edits the wrong
thing. Which is exactly what the stale `tokens.css` beside this file went
on to be.

The undefined-token check found the dead blocks. It did not find the
stale file, because it had no reason to open something nothing imported —
comparing the declared values across surfaces is what does that, and that
check exists now.
