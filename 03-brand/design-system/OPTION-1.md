# Option 1 — what was implemented, and what was not

White, deep charcoal, and a controlled orange, across the application,
the marketing website and the brand assets.

This is the record of the change. `tokens.css` is the source of truth
for the values; `03-brand/logo/PALETTE.md` is the reasoning behind
them; this file is what was actually done against the written
direction, including the parts that were not done and the two places
the implementation deviates from the brief on purpose.

---

## 1. The palette

Every colour in the direction is a declared token and every one of them
resolves in a browser, asserted by `npm run browser:option1`.

| Direction's name | Token | Hex |
|---|---|---|
| Primary orange | `--accent` | `#FF5A00` |
| Deep orange | `--accent-edge` | `#FF5A00` |
| Soft orange | `--accent-soft` | `#FFF0E8` |
| Charcoal | `--ink` | `#171717` |
| White | `--ground` | `#FFFFFF` |
| Warm grey | `--panel` | `#F5F3F0` |
| Medium grey | `--ink-3` | `#6B6B6B` |

The direction names its tokens `--color-primary`, `--color-background`
and so on. Those names exist as aliases onto the same values rather
than as a second set — this codebase has called them `--accent` and
`--ground` since before the direction, across 40+ screens and two other
surfaces, and two independent sets is how a palette comes to disagree
with itself. Either name works.

Three steps were once added that the direction does not name, all
derived from its own two oranges, and all for one reason: **the accent
is 3.13:1 on white** (`#FF5A00`; the four accents this project has had
measured 3.22, 1.97, 4.30 and 3.13). That clears the 3:1 a border, icon
or focus ring needs and falls short of the 4.5:1 text needs. So the
orange is a surface colour, and orange type used to step down the same
hue until it was readable — `--accent-hover` at 4.09:1, `--accent-edge`
at 5.03:1, `--accent-deep` at 6.34:1.

**That ramp is gone.** The direction is one colour, so `--accent`,
`--accent-hover` and `--accent-edge` are all `#FF5A00`, and the names
survive only so a future decision has somewhere to land. Orange type on
a light ground is not orange at all: `--accent-deep` is `#171717`.
Labels on an orange fill are white, at 3.13:1 — below AA, and a
decision the brand owner took with the number in front of them.
`tokens.css` is the authority for every value here; this file describes
the direction.

## 2. The 70/20/8/2 balance

Measured rather than asserted. `browser:option1` computes the share of
visible element area filled with the accent on `/today` and fails above
10%; it reads 0.0%, because the orange on that screen is a nav
underline, an inline link and the `.io` — none of which are fills.

The balance is also what drove the largest single decision here, in §4.

## 3. Contrast

`contrast.py` reports **0 failures and 0 warnings** on both surfaces.

One exception remains in its allow-list: the `.io` in the wordmark, at
3.22:1, on the grounds that WCAG 1.4.1 exempts a wordmark. It is
recorded rather than deleted so the grounds are visible.

Two exceptions were **removed** rather than narrowed — `h1,h2,h3` and
`.display` — because the headings they covered are charcoal now.

## 4. The one large deviation: headings are charcoal

The direction assigns charcoal to headings and orange to primary CTAs
and key accents. The first implementation kept orange headings, carried
forward from the previous palette. That was reversed, for two reasons.

**The arithmetic.** A 68px hero headline is not 2% of a page. At 390px
the marketing front page came out majority orange and the "Book a call"
button competed with the sentence above it.

**The contrast.** `h3` is 20px at weight 500. WCAG large text starts at
24px, or 18.66px bold, so an orange h3 needed 4.5:1 and had 3.22:1.
`contrast.py` waved it through because the exception covered the whole
`h1,h2,h3` selector on the stated grounds that all three were display
sized — true of two of them.

48 heading sites across 42 files, plus the website's element rule and
its hero class.

## 5. The one deliberate deviation from a written value

The direction specifies **white** on the orange fill. That measures
3.22:1, and a 16px semibold button label is not "large text" — which
starts at 18.66px bold — so it fails AA.

Charcoal on the same fill is 5.57:1. Shipped as charcoal, because it
keeps the orange fill exactly where the direction puts it — the fill is
what a customer perceives as the brand colour — and changes only the
label. It is one token (`--on-accent`), so setting it back to `#FFFFFF`
is a one-line decision rather than a hunt.

## 6. Typography

The existing scale was kept and is unchanged: Display / H1 / H2 / H2-sm
/ H3 / Body-lg / Body / Small / Caption / Micro / Stat, with three
tracking steps, all in `tokens.css`. The direction's scale maps onto it
without a gap.

No webfont was added. The stack is the system UI face with Inter as the
first named fallback, which is what the product already shipped.

## 7. Spacing

**Not added as a new token set, deliberately.** Tailwind's 4px scale is
already the spacing system, used consistently across all 41 screens. A
parallel `--space-*` set that nothing reads would be a declared thing
with no behaviour behind it, which is the specific failure mode this
codebase has now found eight times.

## 8. Components

- **Buttons** — one component, three variants, all on tokens. The
  disabled state moved from `opacity-40` (which drags the label to
  1.8:1) to explicit `bg-sunk` / `text-ink-3` / `border-rule-strong`.
- **Form controls** — 44px minimum, 16px text so iOS does not zoom, and
  a `--rule-strong` boundary at 3.41:1 for WCAG 1.4.11. `--rule` at
  1.26:1 is for separators only.
- **Focus** — one `--ring` token, an orange 3px halo, on every
  interactive element.
- **Touch targets** — 44px, asserted at all eight widths.

## 9. AI surfaces

`--accent-soft` was declared and read by nothing. It now has a rule
behind it, in `components/ui/machine.tsx`: **an agent must be able to
tell without reading which sentences came from the model and which came
from the database.**

Everything the assistant produces is a claim about a customer the agent
is about to repeat to them, and `guardrails.ts` catches an invented
price but not a plausible one attributed to the wrong building. The
person reading the screen is the check after that.

The label is not optional — `#FFF0E8` on `#FFFFFF` is a 1.11:1 tint,
which is reinforcement, not a signal. Applied to the assistant's
outcome, its clarifying question, and the listing draft (where the tint
marks the *unread* state and the first keystroke clears it).
Deliberately **not** applied to the "who wants it" pitch: `pitch()` is a
template over database counts, and tinting it would say "unverified"
about arithmetic.

## 10. Potato terminology

Internal screens only, as instructed. Golden / Hot / Warm / Cold now
band the nightly lead score on `/leads`.

This is not naming for its own sake. `scoreLead` has run every night
since it was written, filling `Lead.score` and a `LeadScoreEvent` with
four components and a driver list — and no screen had ever shown any of
it. The vocabulary is the display layer that was missing.

`npm run check:bands` follows the import graph and fails if
`intelligence/score.ts` becomes reachable from `whatsapp/`, `vendors/`,
`notify/`, `mail.ts`, `copy/`, `portals/` or `assistant/`. A buyer who
finds out a brokerage has them filed as a cold potato has had a bad day,
and nothing in the type system prevents a template string doing that.
The check asserts the other direction too, because a check that only
forbids is satisfied by deleting the feature.

## 11. Responsive

375 / 390 / 430 / 768 / 1024 / 1280 / 1440 / 1920. No page scrolls
sideways and no element crosses the right edge at any of them, asserted
per width by `browser:option1`.

## 12. The website

Ten pages, all on the new palette, all verified in a browser: white
ground, charcoal headings, no element still painting a v4 colour, no
horizontal overflow.

## 13. Checks added

| Check | What it catches |
|---|---|
| `browser:option1` | The palette as a browser resolves it — tokens, painted colour, orange share, primary-button labels, orange type below AA Large across 13 screens, 8 widths, and any surviving v4 colour |
| `check:bands` | The potato vocabulary reaching a customer-facing surface, transitively |

Both are in `npm run verify`. Two existing checks (`brand.mjs`,
`og.mjs`) pinned `rgb(255, 107, 53)` as a literal and failed a correct
render after the palette moved; both read the token now.

## 14. Gate

`npm run verify` — tsc, 228 unit assertions, 16 check suites, 13 audit
scripts. `check:load` is the one skipped item; it seeds a database and
runs under `--load`.

## 15. What was not done

Stated plainly rather than left to be inferred.

- **No structural redesign of the dashboard or the website.** The
  palette, the component states and the type colour moved. The
  information architecture, page composition and copy did not. The
  direction describes a redesign in places; what was delivered is a
  design-system change applied thoroughly.
- **The mobile app screens.** `mobile/` cannot build — no `app.json`,
  no `tsconfig.json`, no `babel.config.js`, no assets, an Expo SDK two
  years old, and a sign-in flow expecting a `?session=` token the web
  app cannot issue. Styling screens that cannot render would not be
  testable, and the direction is explicit that nothing should be
  claimed untested.
- **No spacing token set**, for the reason in §7.
- **No new typeface**, for the reason in §6.

## The rule that governed all of it

Nothing above is claimed on the strength of reading the source. The
last palette move shipped `text-accent-type` to 42 call sites that
generated no CSS at all — the token had never been mapped to Tailwind —
and every source-reading check passed. So the assertions here are made
by a browser against computed colour, computed size and computed
geometry, and the two checks that measured a hard-coded hex instead of
the token have been fixed.
