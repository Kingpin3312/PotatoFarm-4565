# PotatoFarm.io — logo specification

## Stacked lockup

    300 x 162
    mark      108px, centred, top at 12
    gap       26px
    wordmark  30px / weight 500 / tracking -0.4 / baseline 146

## Colour

**The mark's colours are defined in `mark.py`, not here.** This table is
a reader's copy of that file; if the two disagree, `mark.py` is right.
It used to describe a flat `#FF6600` potato with an `#FF8533` highlight,
which was two artworks ago and matched nothing that shipped.

| | Hex | |
|---|---|---|
| Ground | `#FFFFFF` | white |
| Body, lit | `#FFD04A` | top-left of the gradient |
| Body, amber | `#FCA51B` | the body |
| Body, turning | `#F2760A` | the turn into shadow |
| Body, low | `#D24500` | lower right, in shadow |
| Rim, lit | `#E8620A` | the edge where the light falls |
| Rim, shadow | `#9E2A00` | the edge under the base |
| Crease | `#D2530C` | mouth, brow, cheek line, dots |
| Eyes | `#4A1E0C` | dark warm brown, not black |
| Wordmark | `#12202E` | 14.88:1 |
| `.io`, everywhere | `#FF5A00` | the brand orange |

The mark is lit — a gradient and a rim — while staying inside the hue
window the interface accent sits in. `PALETTE.md` carries why that is
not the two-oranges problem a flat fill was adopted to solve.

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
from `#F8BA5E` at the top-left through `#F0A03A` to `#E5842A` at the
bottom-right, plus the clipped white highlight.

**A soft drop shadow for lift.** `dy 2, blur 2.2, 18%`. Enough to seat
it, not enough to be noticed as a shadow.

**Two eyes, a cheek crease and three surface marks.** The second
artwork adds the marks a potato actually has. They are all drawn at
lower opacity than the eyes, so the face still reads first and the
detail dissolves rather than muddles at sixteen pixels.

The eyes are **ellipses, not capsules**. This paragraph said the
opposite for two generations after the artwork stopped being true, which
is exactly the drift `mark.py` exists to stop: at roughly 1.4 tall to
wide they stay oval at 16px, and pushed nearer the 2.2 the capsules had
they collapse into two dashes and the face loses its expression in the
favicon.

## The one place the brief and accessibility disagree

`#FF6B35` at wordmark size is **2.56:1** on this ground. That is fine
inside a logo — artwork, reproduced as a unit, and exempt under WCAG.
It is not fine for a 13px caption a broker reads in a bright office.

So the lockup is exactly as briefed, and small interface text takes
`--accent-deep` (`#A84015`, **5.55:1**) instead. Headings keep the brand
orange by decision, with the cost recorded in `PALETTE.md`. If the two
ever have to match, the lockup wins and the interface value moves.

## What not to change

- **The eyes are not symmetrical.** The left is a fraction larger and
  lower. That offset is the character.
- **The highlight is clipped to the form.** Unclipped it spills past the
  silhouette.
- **Four unique ids per instance** — gradient, blur, shadow, clip. Two
  marks on one page sharing any of them means the second inherits the
  first, and a mismatched clip renders the mark invisible.
