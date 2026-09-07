# Response to the design audit

The audit was right. Six inconsistencies, all measurable, all now
closed. Below is what was wrong, what it is now, and the one finding I
want to push back on.

---

## What was actually wrong

Nobody had ever compared the surfaces to each other. Every check in this
project examined **one surface at a time** — the website's contrast, the
CRM's structure, the mobile drift. None of them asked the question a
client asks in the first ten seconds: *does it look like one company
made this?*

So each surface was internally correct and collectively wasn't.

| | Before | Now |
|---|---|---|
| Brand mark | 32px site · 26px CRM · 26px mobile | **28px** |
| Page width | 1040 · 1060 · 1120 | **1120px** |
| Gutters | `clamp(20,5vw,40)` · 26px · `clamp(20,4vw,32)` · 20px | **`clamp(20,4vw,32)`** |
| Button height | 44 · 48 · 44 | **48px** |
| Header height | 48 · none · 66 | **64px** |
| Ground | `--ground` · **`--panel`** · `--ground` · `--ground` | **`--ground`** |

**The ground is the one the audit felt first.** The dashboard painted
`--panel` where every other surface paints `--ground` — two different
creams, side by side. Nobody can name it and everybody sees it.

Four gutters is the one that produced the alignment complaint. The
dashboard's 26px against the website's 40px means a logo and a headline
that should sit on the same line don't, and no single screen looks wrong.

## Two things underneath, worth naming

**The dashboard header had `background:var(--leather-ink)`** — the *text*
colour for a leather ground, used as a background. It looked right by
accident, because that token happens to be a near-cream. It would have
broken the day anyone adjusted it.

**The dashboard header had no declared height at all.** It was whatever
its padding produced. That is not a 66px header that disagrees with a
48px one; it is a header nobody decided.

## The gap that let it happen

There is now a **cross-surface consistency check**. It reads all four
surfaces and compares the values a person actually perceives — mark
size, page width, gutter, button height, header height, ground, type
steps. It found all six in one run and it fails the build on any
divergence.

The absence of that check is the honest root cause. Not carelessness on
any given day — an assurance process that could only ever see one
surface at a time.

---

## The sidebar

I argued for keeping it leather — a dark rail separates navigation from
content and an agent is in this screen for eight hours, not ninety
seconds.

The client overruled it, and on reflection they were right for a reason I
had not weighted properly: **a dark rail is the single most visible
element in the product, and it appears on exactly one of four surfaces.**
Whatever it buys in usability, it costs more in the first ten seconds of
looking at the three screens side by side.

It is cream now, with a hairline separator doing the work the rail was
doing. A panel tint would have been easier and would have reintroduced
the two-creams defect this audit raised, so it is a border and nothing
else. Hover uses the panel tint — a transient state rather than a second
permanent ground, which is the distinction that matters.

## What reversing it exposed

Five card, stat and button backgrounds in the dashboard were set to
**`--leather-ink`** — the *text* colour for a leather ground, used as a
surface.

They rendered correctly because that token happens to be a near-cream.
They would have broken entirely the day anyone adjusted the leather type
scale, and nothing in the file would have explained why the cards went
dark. All five now use `--raised`, which is what a card surface is for.

That is the same defect as the header, in five more places, and it came
from the same mechanical remap. It only surfaced because the sidebar was
reversed — which is a fair argument that the client's instinct was
better than my justification.

---

## Re-audit

    consistency        0
    contrast           0   across site, mockups and mobile
    markup             0   across all three
    responsive         0
    design tokens      0
    claims             0
    CRM structure      0
    mobile drift       0

Fourteen checks. Ready for you to re-run independently — every script is
in `/tests`.
