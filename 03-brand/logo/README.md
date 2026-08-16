# The brand assets

Two commands rebuild every file in this directory and every copy of the
mark anywhere in the repository:

    python3 03-brand/logo/mark.py --apply   # the 41 inlined copies
    node    03-brand/logo/build.mjs         # the bitmaps and the favicon

Run them in that order. `build.mjs` shells out to `mark.py` for the
geometry, so the second is always drawing what the first has just
written.

## Nothing here is edited by hand

`mark.py` is the definition — the silhouette, the gradient stops, the
face, the wordmark navy. Everything else in this directory is output.
Editing an SVG here works until the next `--apply`, at which point it is
silently overwritten and the change is gone.

`consistency.py` fingerprints the potato's body path across every
surface and fails the build if one of them drifts, which is how a
redraw that lands on six surfaces and misses the seventh gets caught. It
has caught exactly that, twice.

## Most of these files are not referenced by code, and that is correct

A sweep for "brand assets nothing links to" reports eighteen files, all
of them in this directory. They are **masters** — the things a deck, a
press kit, an app-store submission or a designer pulls from by hand. The
files the product actually serves are copied out to
`02-the-project/app/public/` and `02-the-project/website/assets/` at the
end of `build.mjs`, and those are all referenced.

Do not delete anything here on the strength of a reference count.

| File | What it is for |
|---|---|
| `mark.svg`, `favicon.svg` | The potato alone. The favicon is the mark, never the lockup — a wordmark at 16px is a grey smear |
| `lockup.svg` / `.png` | Horizontal. Nav bars, email headers, anywhere wide |
| `lockup-stacked.svg` / `.png` | Vertical. The default when there is room |
| `lockup-*-reversed.*` | The same, reversed out for a dark ground. Their wordmark is deliberately **not** navy — navy on charcoal is 1.3:1 |
| `lockup-stacked-2400.png` | 8x, for print and slides |
| `icon-16 … icon-512`, `icon-1024` | The ladder. Each size is a real slot: 180 Apple touch, 192/512 the manifest, 152/120/76/60 older iOS, 48/32/16 browser chrome |
| `icon-maskable-512.png` | Inset to the middle 62%. Android crops a maskable icon to the launcher's shape, and the standard mark shipped as maskable loses the potato's head |
| `icon-glow-*.png` | The dark treatment from the second reference — three blur passes at 22/11/4 |
| `og-image.png`, `og-image-dark.png` | 1200x630 social previews for the **app**. The website's three cards are built by `website/og.mjs`, one per page with that page's own headline |
| `favicon.ico` | 16, 32 and 48 in one container, written by hand in `build.mjs` — the format is a header, a directory entry per size, then the PNGs verbatim |
| `logo-sheet.png` | The contact sheet. The one file somebody opens to ask what the brand looks like, so it is regenerated with everything else |

## The wordmark is live text, not outlines

The SVG lockups set "PotatoFarm.io" in a font stack rather than as
paths. Outlining would freeze the letterforms into whichever font
happened to be installed on the machine that ran the build, which is a
weaker guarantee than it sounds.

**Where a font cannot be assumed — email, Open Graph, app icons, the
favicon — use the PNGs, never the SVG.** That rule is what makes the
choice safe rather than merely convenient, and `build.mjs` renders every
one of those cases to a bitmap for exactly this reason.

## Colour

`PALETTE.md` is a reader's copy. `mark.py` and
`02-the-project/app/src/styles/tokens.css` are the two files that are
actually true; if any of the three disagree, the doc is the one that is
wrong.

| | Hex | |
|---|---|---|
| Wordmark | `#12202E` | Deep navy, sampled off the supplied artwork. 14.88:1 on the ground |
| Wordmark, reversed | `#F5F3F0` | Navy on charcoal is 1.3:1 and vanishes |
| `.io` | `#E86A2C` | The brand orange, on every ground |
| Body | `#F8BA5E` → `#F0A03A` → `#E5842A` | The mark's own amber gradient |
| Rim | `#D9761C` | The darker edge |
| Eyes | `#3B2416` | Dark brown, not black |

The mark keeps an amber gradient while the `.io` takes the interface
orange. That is deliberate and it is the only exception in the palette:
a logo is exempt from contrast rules, and the `.io` beside it is type.
