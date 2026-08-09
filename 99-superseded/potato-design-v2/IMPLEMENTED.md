# Panel palette — implemented

`APPROVED-home.html` is it built. `tokens.css` is the source of truth for
both the website and the CRM.

**Every hex is exactly as approved.** Nothing was substituted.

## Four pairings failed, and all four are fixed by role

The colours were right; where some of them were allowed to sit was not.

| Pairing as specified | Measured | Fix |
|---|---|---|
| Royal Blue on Navy | **2.11:1** | Royal Blue is a **surface**, not type on the background. White on Royal is 8.04:1 — filled buttons and panels. |
| White on AI Teal | **3.36:1** | Labels on teal are **navy**. 5.04:1. |
| White on Bright Cyan | **2.12:1** | Labels on cyan are **navy**. 7.98:1. |
| AI Teal on Soft Grey | **2.88:1** | Light panels use `#00647A`, the same hue one stop down. 5.79:1. |

The white-on-teal one matters most in practice. A teal button with a
white label is unreadable in Dubai sunlight on a phone, which is where
your buyer will actually open it. That is a measurement, not a taste
argument.

Royal Blue keeps its billing as the primary brand accent — it is the
button colour and the panel colour. It simply cannot be text on navy,
because at 2.11:1 nobody can see it.

**Every pair now measures AA or better. All sixteen.**

## Gradients and glow

Both were specified, and both were removed earlier in this project for
reading as AI-generated. They are back, restrained:

- **Gradient**: two adjacent blues at 160°, navy to ocean. Not a
  spectrum sweep.
- **Glow**: a soft ring on focus and active states, 24–45% opacity. Not
  a halo, and not on anything at rest.

The difference between premium and generic here is entirely amplitude.
Two stops, close together, low opacity. If it starts creeping onto cards
and headings it will undo the rest of the work.

## One thing to decide, not now but soon

The site is navy. **The app should ship light by default.**

They are different jobs. A visitor is on the site for ninety seconds and
dark reads as premium. An agent is in the CRM for eight hours reading
dense text and numbers, and dark-first for that is a real ergonomic
choice that a meaningful share of people dislike.

`tokens.css` already carries both: `.theme-navy` and `.theme-light`,
same palette, both measured. The app takes light as its default and
offers navy as a dark mode. One brand, two contexts, no drift.

## What to do

1. Roll `tokens.css` into the site and the CRM together.
2. Rebuild the ten remaining pages against `APPROVED-home.html`.
3. Replace the CRM's old accent with `--accent` from this file. Red is
   now free to mean errors, which is what it should have meant all along.
4. Re-run all seven audit scripts. The palette changed; the standards
   did not.
