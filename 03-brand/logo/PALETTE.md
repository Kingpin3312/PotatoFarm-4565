# The orange

**`#FF6E00`.** Hue 26°, fully saturated — which is why every derived step
comes down in **lightness** rather than chroma. Desaturating would have
given six different oranges; this gives one colour at six weights.

| Role | Hex | On off-white | Why it exists |
|---|---|---|---|
| Gradient high | `#FF9C52` | 1.94:1 | The lit core of the mark. Also the accent on a charcoal ground, where it measures **8.39:1** |
| Gradient core | `#FF8529` | 2.27:1 | |
| **Brand / fill** | **`#FF6E00`** | **2.62:1** | The logo, and every orange fill |
| Rim / edge | `#CC5800` | 3.95:1 | The mark's outline, and the border on every fill |
| Type | `#A84900` | 5.42:1 | The `.io`, prices, accent figures |
| Eye | `#703000` | 9.28:1 | |

## The one rule that matters

**`#FF6E00` is never type.** It measures **2.62:1** on off-white — below
even the 3:1 that a non-text component needs, let alone the 4.5:1 for
text.

That is fine for the logo: WCAG exempts brand marks, and the mark is the
one place the pure brand colour appears untouched.

Everywhere else:

- **A fill carries `#CC5800` as a 1px rim.** The fill itself does not
  clear 3:1 against the page, so the border is what makes the button's
  edge discernible. It is not decoration and it is not optional.
- **A label on orange is charcoal, never white.** White measures 2.81:1
  and fails; charcoal is **6.2:1**.
- **Orange text uses `#A84900`.** Same hue, 5.42:1.

## Where it is

25 files. The website, both design surfaces, the CRM shell, the mobile
theme, and every logo asset — SVG masters and rendered PNGs at 16, 32,
48, 180, 192, 512 and 1024.

`contrast.py` fails the build if `#FF6E00` is ever used as `color:`.

---

## Hierarchy is one hex

**Every heading, title, price and button label is `#1A1A1A`.**

Buttons already were — `--on-accent` resolves to the same value as
`--ink`, which is why a charcoal label on orange and a charcoal heading
on off-white are the same colour under two names.

Twelve things were not. Seven were hierarchy wearing an accent — the
`$70` display, the pricing column, the step numerals, a running total, a
hover heading. All now ink.

### The rule underneath it

**Colour carries state, not hierarchy.**

Hierarchy is size, weight and space. If a heading needs colour to be
read as a heading, the type scale is not doing its job and adding hue
hides that rather than fixing it.

State is different. Take the colour off a green delta or an amber
allowance figure and you have removed the meaning, not the decoration.

So four things stay coloured, and they are named so an exception is a
decision rather than a miss:

| | | |
|---|---|---|
| `.delta` `.stat .d` | green | performance up on last month |
| `.allow-pct` | amber | near the conversation allowance |
| `.tight` | orange | the gap between two viewings is tight |
| `.tabs a.on` | orange | which tab is selected |

`consistency.py` fails the build on any heading-shaped rule wearing an
accent colour, with those four exempted by name. Verified by reverting
one and confirming it is caught.
