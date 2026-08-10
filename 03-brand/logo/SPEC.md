# PotatoFarm.io — logo specification

## Stacked lockup

    300 x 162
    mark      108px, centred, top at 12
    gap       26px
    wordmark  30px / weight 500 / tracking -0.4 / baseline 146

## Colour

| | Hex | |
|---|---|---|
| Ground | `#F4F3F0` | soft grey off-white |
| Potato | `#FF6600` | warm solid orange |
| Highlight | `#FF8533` | upper portion |
| Shade | `#E55C00` | lower right |
| Eyes | `#3B2416` | Dark brown, not black |
| Wordmark | `#1A1A1A` | 15.68:1 |
| `.io` in the lockup | `#FF6600` | as briefed |
| `.io` in an interface | `#FF6600` | 5.23:1 |

## Three things chosen by rendering, not by assuming

**Eye height.** The form runs y=3.2 to 60.6, so its centre is ~32. The eyes
were at 30 — dead centre. They now sit at **25**, in the upper half as
briefed. Three positions were compared; moving them up and keeping them
full size reads friendly, moving them up *and* shrinking them reads
timid.

**Mark-to-wordmark balance.** Rendered at 88, 100 and 108px. At 88 the
mark reads as an afterthought above the wordmark; at **108** it is the
hero and the wordmark supports it, which is what a stacked lockup is
for.

**Highlight strength.** 10%, 15% and 20% were compared. At 20% it reads
as a blob; at 10% it does nothing. **15% at 7px blur, clipped to the
form.**

## Construction

**No outline.** The silhouette carries itself. Every earlier version had
a rim, and the rim is what made them read as stickers rather than
objects.

**Soft dimensional shading, not a heavy gradient.** A single linear pass
from `#FF8533` at the top-left to `#E55C00` at the bottom-right, plus
the clipped white highlight.

**A soft drop shadow for lift.** `dy 2, blur 2.2, 18%`. Enough to seat
it, not enough to be noticed as a shadow.

**Two eyes, a cheek crease and three surface marks.** The second
artwork adds the marks a potato actually has. They are all drawn at
lower opacity than the eyes, so the face still reads first and the
detail dissolves rather than muddles at sixteen pixels.

The eyes are **capsules, not ellipses** — flat-sided with round ends.
At favicon size that shape is the whole character.

## The one place the brief and accessibility disagree

`#FF6600` at wordmark size is **2.66:1** on this ground. That is fine
inside a logo — artwork, reproduced as a unit, and exempt under WCAG.
It is not fine for live interface text a broker reads in a bright
office.

So both exist: **the lockup exactly as briefed**, and `#FF6600` for UI
text at 5.23:1. If they ever have to match, the lockup wins and the
interface value moves.

## What not to change

- **The eyes are not symmetrical.** The left is a fraction larger and
  lower. That offset is the character.
- **The highlight is clipped to the form.** Unclipped it spills past the
  silhouette.
- **Four unique ids per instance** — gradient, blur, shadow, clip. Two
  marks on one page sharing any of them means the second inherits the
  first, and a mismatched clip renders the mark invisible.
