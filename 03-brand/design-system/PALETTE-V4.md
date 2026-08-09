# v4 — warm white, Hermès orange

## The one change to the brief

**The white is not pure white.**

Hermès does not put orange on `#FFFFFF`. It puts it on a warm cream,
anchored by deep brown leather. Pure white plus orange reads as a budget
airline; cream plus orange plus brown reads as the reference.

The ground is `#FDFBF7` — about 2% warmth, and that 2% is the whole
effect. The near-black has brown in it for the same reason: a neutral
grey next to orange looks like a spreadsheet.

## One accent, two steps

Hermès orange is `#E86A17` and it measures **3.12:1** on the ground.
Enough for a fill, nowhere near enough for type.

    --accent       #E86A17   fills only
    --accent-type  #A84A16   every word. 5.56:1 on ground, 5.15:1 on panel
    --accent-edge  #B8500F   the hairline on a fill

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
thing.

The undefined-token check found it. It has now caught three real
breakages in two days, which is a better hit rate than anything else in
the suite.
