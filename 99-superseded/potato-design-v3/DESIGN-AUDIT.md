# Visual audit — the honest version

You asked whether the team is happy. **Not with what I built two turns
ago**, and the numbers say so more usefully than an opinion would.

## What we measured

A design system is only a system while everything uses it, and it decays
one hardcoded value at a time. Nobody sees a single 13px where the scale
says 14. Everybody feels twenty of them.

`design-audit.py` counts the drift.

## What it found in the new v3 work

| | Before | After |
|---|---|---|
| Hardcoded colours outside the tokens | **31** | 3 |
| Distinct font sizes (scale defines 7) | **20** | 3 |
| Distinct border radii (scale defined 3) | **6** | 0 |
| Long inline styles | 20 | 6 |
| Odd-numbered spacing | 9px, 11px, 13px | none |

**Two failures, both mine, both from building the dashboard fast.**

Twenty font sizes is the one I would be most embarrassed by. Every card
got whatever size looked right in the moment — 15px here, 13.5px there,
12.5px on the activity feed. None of them is wrong on its own. Together
they mean the scale has stopped being a scale, and the next person to
add a card will pick a twenty-first number.

## What changed, and what I refused to change

**The interface needed two scale steps the marketing scale did not
have.** A dashboard has denser type than a homepage and pretending one
scale serves both is exactly how twenty ad-hoc sizes appear. So
`--small`, `--micro`, `--stat` and `--h2-sm` are now real steps rather
than improvised ones.

**Radii went from three defined to five defined**, because chips, inputs,
cards, panels and pills genuinely are five different jobs. Five named is
a system; six unnamed was not.

**`#fff` is now `var(--white)`.** It appeared 22 times. It is a colour
and it belongs in the palette like every other one — the day somebody
decides pure white is too harsh against midnight, that should be one
edit.

**Four font weights stay, and I would argue for it.** 700 appears once,
in the logo mark, at 10px — where 600 reads thin. Everywhere else
hierarchy is carried by size and space rather than weight, which is the
rule that matters. One deliberate exception is not drift.

**Three colour literals stay**, in the SVG charts. An inline SVG fill
does not reliably inherit a custom property across browsers. Documented
in the file rather than quietly left.

## The older work, for comparison

    potato-launch     11 hardcoded colours · 8 font sizes · 42 inline styles
    potato-crm         0 hardcoded colours · 0 font sizes · uses Tailwind tokens

The CRM is clean because it was built against tokens from the start.
**The marketing site has 42 long inline styles** — more than v3 had — and
that is real debt. It has survived two palette changes and each one left
values behind that nobody has found since.

Worth fixing before the third palette change, not after.

## So: are we happy?

**With the direction, yes.** The midnight-to-steel palette is stronger
than what it replaced, the temperature system gives the brand a job
rather than an apology, and the two surfaces now read as one product —
same mark, same cards, same radii, same rhythm.

**With the execution, we are now.** We were not an hour ago, and no
amount of looking at it would have told us. Twenty font sizes is
invisible to the eye and obvious to a script.

**The one thing still open:** the marketing site's 42 inline styles.
Say the word and it is an hour.
