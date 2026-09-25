# The palette

**Two colours: neon pink `#FF1493` on grey `#292C32`.** Set by the
owner, and every other shade is derived from the grey — a darker step
for the navigation band, lighter steps for panels and cards, subtle
rules, near-white ink and a muted light grey. There is no second
accent anywhere in the product: no orange, blue, green, purple or gold.
**The authority is `tokens.css`, not this file**; `03-brand/repalette.py`
moves every surface at once and `consistency.py` fails the build if one
drifts.

**Where the pink goes.** Primary buttons, active navigation, selected
rows, links, key figures, focus, progress, the assistant's own output,
the states that must pull the eye, and the `.io`.

It replaced white, charcoal and one orange, and it is a recolour, not a
redesign: every token kept its name and its job, so no component changed
to take the new colours.

**The mark is the exception, and it is the only one.** The potato is
artwork and keeps its own lit gradient. The `.io` beside it is type, and
takes the pink.

### The interface

Every figure measured against the shipped tokens.

| Role | Hex | On ground `#292C32` | On panel `#2F3238` | Where |
|---|---|---|---|---|
| **Brand** | **`#FF1493`** | **3.85:1** | 3.53:1 | Fills, focus, active state, selected, links, `.io` |
| Hover / edge / type | `#FF1493` | 3.85:1 | 3.53:1 | The same pink — one value everywhere |
| Soft | `#472940` | — | — | The pink mixed 14% into the grey: selected rows, machine-written text |
| Ink | `#F3F4F6` | **12.72:1** | 11.68:1 | Headings, body, figures, tables, the wordmark |
| Ink-2 | `#C9CCD2` | 8.70:1 | 7.99:1 | Secondary body |
| Ink-3 | `#A0A5AE` | 5.66:1 | 5.19:1 | Captions and labels |
| Rule | `#3D4148` | 1.36:1 | — | Separators — decorative only |
| Rule-strong | `#7D828C` | 3.63:1 | 3.33:1 | Form-control boundaries (WCAG 1.4.11) |

Cards (`--raised`, `#33373E`) and the darker navigation band
(`--leather`, `#25282D`, and `--leather-deep`, `#1F2126`) are further
steps of the same grey.

**Every label on a fill takes `--on-accent`, which is white.**
`#FFFFFF` on `#FF1493` is 3.64:1 — below the 4.5:1 AA floor for small
text, chosen knowingly because white on neon pink is the direction's
look. Button labels are semibold.

## What this costs, plainly

`#FF1493` as text on the grey is **3.85:1**. WCAG AA asks 4.5:1 for
normal text and 3:1 for large. The pink clears the second and not the
first, so pink *links* in a sentence are below AA on contrast alone.
They are pink because the direction asks for pink links, and they keep
their underline, which is the non-colour signal that keeps them
findable. Everywhere else the pink is a fill, a border, an icon or a
focus ring, where 3:1 is the requirement and it passes.

### The mark

| Role | Hex | Where |
|---|---|---|
| Gradient, 0 | `#FFD04A` | The lit upper left — pale gold. Hue 44 |
| Gradient, 0.42 | `#FCA51B` | The amber body. Hue 37 |
| Gradient, 0.72 | `#F2760A` | The turn into shadow. Hue 28 |
| Gradient, 1 | `#D24500` | The lower right, in shadow. Hue 20 |
| Rim, lit | `#E8620A` | The edge where the light falls on it. Hue 24 |
| Rim, shadow | `#9E2A00` | The edge under the base. Hue 16 |
| Crease | `#D2530C` | Mouth, brow, cheek line, dots. Hue 21 |
| Shading | `#B23600` | The soft lobe over the lower right |
| Gloss | `#FFF3C4` | The specular crescent on the upper left edge |
| Eyes | `#4A1E0C` | Dark warm brown, not black. Hue 17 |

**The mark is lit again, on the owner's direction, and the paragraph
this replaces argued the opposite.** What was here: one flat `#FF5A00`
everywhere, adopted after a branding team twice objected that the logo
was a different orange from the product. It answered the objection and
it also flattened the artwork into a silhouette — no light direction,
no rim, no form.

The owner has since supplied the artwork as the definitive mark and
asked for it exactly. What replaces the flat fill is not "any colour":
every value above is sampled off that render, and **every one sits
inside the 8–45 hue window `palette.py` enforces**, so the mark is
still unambiguously the product's orange. It is now lit rather than
recoloured.

**The mark is artwork and keeps its own colours** through the move to
pink: a recolour of the interface is not a redesign of the logo. The
values here dress the potato and nothing else; the `.io` beside it is
type, so it takes the pink.

Drawn in one place — `03-brand/logo/mark.py` — and inlined into 47 copies
by `--apply`.

## State is no longer a colour

`--success` was once a green and `--danger` a red. Both are gone:
success is ink, and danger is the accent itself — the same pink as a
primary action, because an error still has to pull the eye and there is
only one colour to pull it with. A confirmation that has already
happened does not need to shout.

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

`contrast.py` still measures every colour pair, and `ratios.py` checks
every ratio written beside a colour in this file and the stylesheets.
