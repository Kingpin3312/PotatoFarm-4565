# Typography

One family, one scale, three weights — across the CRM, the marketing
site, the transactional email, the SVG wordmark and the three reference
pages.

Apple.com is the reference for *discipline*, not a look to copy. The
brand, the colours, the orange accent, the potato and the copy are
untouched.

---

## 1. What was there before

| | |
|---|---|
| **Family** | `-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif` |
| **Second family** | `ui-monospace, "SF Mono", …` — on ~174 interface labels |
| **Weights** | 184 × `font-semibold`, 11 × `font-medium`, 1 × `font-normal` |
| **Sizes** | 18 distinct `text-[Npx]` values, plus 4 different inline `clamp()`s for one heading |
| **Tracking** | 9 hand-written values, including 3 different ones on what is visually a single label |

**`Inter` was the change that mattered.** It sat third in the stack, so
on a Mac it never won — `-apple-system` matched first, and nobody
working on this ever saw it. On Windows or Linux with Inter installed it
won every time. Half the users were reading a different product from the
other half, and no screenshot would ever have shown it.

## 2. What it is now

```
--sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
        "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif;
```

`-apple-system` resolves to San Francisco, which is an **optical-size
family**: the browser picks SF Pro Display above roughly 20px and SF Pro
Text below it, adjusting aperture and spacing as it goes. That switch is
most of what "Apple typography" is, and it costs nothing — no webfont,
no download, no licence. `browser:type` asserts the app ships zero
`@font-face` rules of its own.

**One deviation from the brief's literal stack**, and it is deliberate.
The brief goes from `"Helvetica Neue"` straight to `Helvetica, Arial`,
which on Windows resolves the entire product to Arial — a 1982 face with
no optical sizing. The brief's own stated principle is to "prioritise
the native system rendering", and Segoe UI *is* that on Windows, as
Roboto is on Android. On Apple hardware the two stacks are identical.

`--mono` survives for one job: figures in a column that must not jitter.
It is no longer a label face.

## 3. The scale

Two registers from one system, because Apple does not use one scale for
apple.com and for a working tool — their own guidance puts 17pt body on
an iOS screen and 13pt on a macOS window. A marketing page is read once;
a pipeline is scanned four hundred times a day.

**Editorial — the marketing site**

| Token | Size | Line height | Tracking |
|---|---|---|---|
| `--display` | 44 → 80 (fluid) | 1.05 | −0.022em |
| `--h1` | 32 → 48 (fluid) | 1.05 | −0.02em |
| `--h2` | 26 → 32 (fluid) | 1.12 | −0.018em |
| `--h3` | 24 | 1.2 | −0.014em |
| `--lead` | 21 | 1.5 | −0.01em |
| `--body` | 17 | 1.5 | −0.01em |

**Interface — the CRM**

| Token | Size | Line height | Tracking |
|---|---|---|---|
| `--t-page` | 32 → 40 (fluid) | 1.05 | −0.02em |
| `--t-stat` | 30 | 1.05 | −0.018em |
| `--t-title` | 28 | 1.12 | −0.018em |
| `--t-section` | 21 | 1.2 | −0.012em |
| `--t-sub` | 17 | 1.2 | −0.01em |
| `--t-control` | 16 | 1.45 | −0.006em |
| `--t-ui` | 15 | 1.45 | −0.006em |
| `--t-note` | 13 | 1.3 | −0.004em |
| `--t-label` | 12 | 1.3 | +0.02em |

Each step carries its own line height and tracking, because tracking is
a function of size: type tightens as it grows and needs air as it
shrinks. One number at every size is what reads as templated.

**Weights: 400 / 500 / 600.** There is no 700 in the system. `<strong>`
and `<b>` are set to 500 in the base layer, because the browser default
is `bold` — a 14px 700 fragment inside a paragraph was heavier than the
page's own headings.

## 4. What changed, by surface

| Surface | Change |
|---|---|
| `app/src/styles/tokens.css` | The scale, the stack, the weights, per-step line height and tracking |
| `app/src/styles/globals.css` | 16 steps exposed to Tailwind as `text-*`; `.t-label`; `strong, b` at 500 |
| `app/src/lib/cn.ts` | The custom size names declared to tailwind-merge — see §6 |
| `app/src/lib/sentence.ts` | One formatter for a database enum shown as a label — see §7a |
| 77 app screens/components | 415 raw pixel sizes → named steps; 33 inline `clamp()`s → `--t-page` |
| 69 app files | 174 mono uppercase eyebrows → `.t-label` (see §7a) |
| 46 app files | 75 body-size semibolds → medium; 11 selected chips; the Button component |
| 34 app files | 49 hand-written tracking values removed where the step supplies it |
| `website/assets/site.css` | Headings, body, buttons, `.phead`, the wordmark, every literal weight |
| `app/src/server/lib/mail.ts` | The email's inline stack |
| `03-brand/logo/mark.py` | `WORD_STACK` — it led with Inter, so the SVG wordmark rendered in a different face from the product beside it |
| `03-brand/logo/build.mjs` | Two stacks on the contact sheet |
| Three reference HTML pages | The stack, so `consistency.py`'s four surfaces still agree |

## 5. Responsive

375 / 390 / 430 / 768 / 1024 / 1280 / 1440 / 1920, five screens each,
asserted by `browser:type`. Both fluid steps use `clamp()` so a hero
cannot overflow a phone or strand itself at 1920.

The 12px floor is a rendered-text assertion across all 22 screens, not a
source rule: there were 144 elements at 10px and 22 at 9px, and 9px is
not a font size, it is a texture.

Form controls stay at 16px. Below that Safari zooms the page on focus —
a layout bug that presents as a typography choice.

## 6. What the work found

**`cn()` was silently deleting the new size classes.** `tailwind-merge`
resolves conflicts by class group, and its rule for an unrecognised
`text-<word>` is to assume a **colour**. So `cn("text-title",
"text-ink-3")` put a size and a colour in one group, decided they
conflicted, and returned only the colour. On `/listings` and `/me` a
28px figure rendered at the inherited 16px.

Fourteen call sites. The class is in the source, the utility is in the
stylesheet, and every check that reads either passes — only a browser
reading computed `font-size` catches it, which is how it was caught.
`cn.ts` now declares the scale's names to tailwind-merge.

**Two invalid declarations on the website.** `site.css` set
`font-family: var(--body)` in two places, and `--body` is a font-*size*
token. Neither declaration had ever done anything.

**The wordmark was on a different font from the product.** `mark.py`'s
`WORD_STACK` led with Inter, and the wordmark is live text inside the
SVG — so on any non-Mac the logo rendered in a face the interface around
it no longer used.

**Both browser checks miscounted overflow.** They flagged every element
past the viewport edge, which is 123 correct cards inside the kanban
board's own horizontal scroller at 375px. `option1.mjs` had the same
logic and passed only because the single screen in its width list has no
scroller. Both now ignore anything inside a deliberate scroller and
assert what is actually a bug: the page scrolling sideways, or content
with no scrollable ancestor to reach it by.

## 7. What was deliberately not changed

- **Layout, spacing, colour, components, routes, copy, schema, APIs,
  auth, business logic.** Untouched. The only spacing that moved is what
  the scale's own line heights changed.
- **The wordmark's optical tracking** (`-0.024em`) — a genuine one-off,
  and the last hand-written tracking value left in the app.

## 7a. The uppercase, and the bug under it

Held back on the first pass and done on the second, so both halves are
worth recording.

**Held:** ~174 labels were uppercase, and the capitals were this
product's field-label convention on every screen. Rewriting them read as
a content decision rather than a typographic one, so the first pass
changed the face, the size, the weight and the tracking, and left the
transform.

**Done:** the direction lists "excessive uppercase text" under Avoid,
and 174 is excessive. `text-transform` came off the class and the
tracking eased from 0.06em to 0.02em — capitals genuinely need air
between them and sentence case does not.

**The bug it was hiding.** A dozen screens called `.toLowerCase()` on a
database enum so the transform could shout it back, which turned
`PROPERTY_FINDER` into `PROPERTY FINDER` and read as deliberate. With
the transform gone they rendered `property finder`, in a chip, on the
board an agent looks at all day. The workaround had been propping up the
thing that required it.

`lib/sentence.ts` owns that now — one function, for the same reason
`lib/money.ts` is one function. Only the first letter is raised:
`Property finder`, not `Property Finder`, because title case on a data
value is a small lie about how important it is.

Six elements carried their own `uppercase` that the class sweep never
touched, including the command palette's keyboard hint, which read
`↑↓ MOVE · ⏎ OPEN · ESC CLOSE`. `browser:type` asserts that nothing in
the product is uppercased by CSS, across 25 screens, so the next one
fails the build rather than the eye.

## 7b. The other half of the uppercase bug

The workaround screens were the visible half. Thirteen more call sites
never had a workaround to break, so removing the transform changed
nothing about them — they had been rendering the raw enum all along, in
capitals, and looked exactly as intended:

| Screen | Was | Now |
|---|---|---|
| `/leads` | `REFERRAL`, `UNKNOWN` | `Referral`, `Unknown` |
| `/settings/import` | `MISSING_PHONE`, `BLOCKER`, `draft` | `Missing phone`, `Blocker`, `Draft` |
| `/settings/billing` | `paid` | `Paid` |
| `/settings/commission` | `senior agent` | `Senior agent` |
| `/compliance` | `high risk` | `High risk` |
| `/activity`, `/ask`, `/offers` | five more | sentence case |

`/leads` is the one that matters: it is the screen an agent reads most,
and `REFERRAL` had been shouting on every row since the list was built.

**Left alone deliberately.** Mid-sentence lowercase is correct English —
`Vendor countered` keeps its small *c*. A channel label and an import
source are typed by a person, so `sentence()` would flatten their
capitals. And `reason` fields are prose, not enums.

**What found it, and what nearly didn't.** A browser sweep of every
all-caps token on every screen, because an allowlist of "real acronyms"
written from imagination is how a check comes to pass by accident. It
returned AED, BRN, CSV, NOC and RERA — and `COMPLIANCE_OFFICER` on
`/team`, which turned out to be a *user's name* in the dev database
(`Test COMPLIANCE_OFFICER`), with a correct `Compliance officer` chip
beside it. Not a bug. CLAUDE.md's rule earned its keep again: checks
phrased *"this is broken"* have now been wrong ten times.

`browser:type` asserts that no element's entire text is a bare enum.
The rule is narrow on purpose, and §8 says what it therefore misses.

## 8. Checked, not asserted

    npm run browser:type

One family and no webfont · all 16 steps resolve to their intended pixel
size *and* carry a line height (an unmapped step computes to the
inherited 16px with `normal` spacing, which looks plausible and is not)
· nothing under 12px across 25 screens · no 700 anywhere and no 600 at
body size · no element whose entire text is a bare database enum · every
form control at 16px · eight widths · every `.t-label` rendering
identically.

**The check was measuring empty pages, and adding a test is what found
it.** Every assertion above waited 700ms after the `h1` appeared — but
on `/leads` the `h1` is the lead *count*, which paints on the first
render while the list is still in flight over tRPC. So `REFERRAL` was
put back on the leads list on purpose, to watch the new assertion go
red, and it stayed green.

Sampling the rendered text until it stopped changing was the first fix
and was also wrong: a page waiting on a query sits perfectly still, so
"stopped changing" is true of a finished page and an empty one alike. It
went green again while reporting 24 elements past the edge on
`/pipeline` at 375px that a fresh load could not reproduce.

`open()` now counts in-flight `fetch` calls, wrapped from
`addInitScript` so the counter exists *before* the page's own scripts
run — wrapping it afterwards misses the very requests being waited for
and reads zero. `networkidle` cannot be used because `/inbox` polls and
never reaches it.

**What this assertion does not cover.** It fires only when an element's
whole text is one all-caps token, so `{rating} risk` regressing to
`HIGH risk` would pass. That is deliberate: a per-token rule fires on
fixture data — the dev database has users named after their roles — and
a check somebody switches off is worth less than a narrow one that is
always true.
