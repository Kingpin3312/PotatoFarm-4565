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
> | accent | `#E86A17` | **`#E87A2E`** |
> | accent-type | `#A84A16` | **`#A84900`** |
> | accent-edge | `#B8500F` | **`#C4621D`** |
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

## One accent, two steps

The Hermès-family orange measures **3.12:1** on the ground. Enough for a
fill, nowhere near enough for type. So there are two, and merging them is
the single easiest way to ship something unreadable:

    --accent       fills only
    --accent-type  every word. 5.56:1 on ground, 5.15:1 on panel
    --accent-edge  the hairline on a fill

**Three rules fell out of measurement rather than taste:**

**Labels on orange are ink, never white.** White measures 3.23:1 and
fails; ink is 5.42:1. An orange button with near-black type is also the
more Hermès answer, so the measurement and the reference agreed — which
does not always happen.

**Every fill carries an edge.** The orange is 3.12:1 on the ground and
**2.9:1 on the cream panel** — the same button passing on one surface
and failing on the other. Rather than forbid orange on panels or lighten
the panel until it works, the hairline defines the boundary regardless
of what is behind it.

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
