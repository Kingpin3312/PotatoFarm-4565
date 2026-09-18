# Deep audit — findings

A full pass across the website and the CRM, looking for logic and
consistency faults rather than structure.

## Result

| Check | Before | After |
|---|---|---|
| Website markup and accessibility | 0 | **0** |
| Website responsive | 0 | **0** |
| CRM structure | 0 | **0** |
| CRM deep audit | **3 bugs** | **0** |
| Assistant invariants | pass | **pass** |

## The three real bugs

### 1. Two money units in one schema

`Lead.budgetMax` and `Listing.price` were `Decimal` in AED. Everything
else — commission, invoices, deal values, `Requirement.budgetMaxFils` —
was `BigInt` in fils.

Nothing converted between them, because nothing yet joined the two. The
first thing to join them would have been the requirement matcher, which
is the obvious next step and is already written. It would have compared a
budget in AED against a price in fils and **shown a buyer a property a
hundred times their budget.**

Fixed by unifying on fils, with the reasoning written into the schema so
the next person does not undo it. Integer fils is also what the
commission arithmetic needs — splits are basis points and the remainder
is allocated so the parts sum exactly to the whole, which only works on
integers.

**Five separate money formatters** became one, in `lib/money.ts`. Two of
the five assumed AED.

### 2. The pipeline could not reorder

The drop handler always passed the top of the column. A card could move
between stages and never change position within one — on a board where
position is priority, half the feature was missing. It now computes the
drop point from the cursor against each card's midpoint.

### 3. A permission check broke the whole frame

The shell called `api.assistant.status`, which needs `channel:write`. An
agent without it got a 403 and **the entire header failed** — a
permission check breaking the frame rather than the feature. Split into
an open `isRunning` that leaks nothing and gives every agent what they
need to know.

## Also fixed

- **Every screen showed a failed fetch as an empty list.** An agent
  seeing an empty pipeline on a Monday assumes the worst thing, and it is
  the wrong worst thing. Eight screens now say so plainly.
- **`JSON.parse` on the model's reply was unguarded.** An unhandled throw
  in the send path is the worst failure available — no reply, no record.
- Missing loading states on two screens.
- The success green was hardcoded in three places; now a token.

## What the tool got wrong, which matters more

**Three times the audit cried wolf, and once I acted on it and broke
working code.**

It flagged the money divisors as a 100x error. They were correct — the
values were AED. The real fault was subtler and I only found it by
checking the schema by hand.

It then flagged five files for missing `fetch` timeouts. Four already had
them; the detector read a fixed window and missed options declared above
the call. The fifth was a **local callback parameter named `fetch`** — and
acting on that false positive, I added a `signal` option to a Prisma
query. The tool caused the exact fault it exists to prevent.

The third: it reported eleven pages as having no meta description. Every
one had a description — the markup writes `content="..." name="..."` and
the pattern assumed the reverse order.

All three came from **regexing HTML and TypeScript and assuming a
canonical form.** The metadata check now parses attributes properly.

The lesson is the one worth keeping:

> A noisy audit is worse than no audit, because people act on it.

## The website, same depth

The structural passes had always been clean. A deep pass found one real
fault and confirmed the rest.

### The dead link, on all fourteen pages

**"Log in" pointed at `#login`, which exists nowhere on the site.** Every
page in the header, every visitor who clicked it, nothing happened.

This is precisely the fault flagged in the competitor audit — their
contact page shipped with leftover template links. Criticising it and
then shipping it is the kind of thing that is only funny when somebody
else does it. Now points at `app.potatofarm.io`.

### Checked and clean

- **No orphan pages.** Every page is linked from somewhere. The
  competitor has one crediting a different company entirely.
- **No duplicate metadata.** Every title, description and canonical is
  unique. Theirs shares one description across five pages.
- **No contradictory figures.** Nothing states two different numbers for
  the same thing. Theirs contradicts itself one page apart.
- No broken internal links, no missing assets, no dead anchors.
- No placeholder text, no developer notes, no example domains.
- The rate limiter evicts. The public POST route is limited. The client
  and server share one validation schema.

The 23 pending markers on five pages are deliberate and visible — the
price, testimonials, logos and security facts. They block launch on
purpose.

### A note that behaved correctly

The audit flagged the Turnstile token comparison for review rather than
declaring it a bug. On inspection it compares a boolean from Cloudflare's
API, not a secret, so there is no timing surface.

That is the tool working properly: **it said "confirm" rather than
"fix".** The three false positives all came from checks that asserted
instead of asking.

## The nine remaining warnings

All known, none of them faults:

- **Five models declared and never queried** — `TaskPlan`, `PlanStep`,
  `DealMilestone`, `MigrationIssue`, `UltimateBeneficialOwner`. Each is
  documented in its module README as not yet wired. Real gaps, correctly
  reported.
- **One fire-and-forget call** — `extractAndStore()` after a reply. It is
  deliberate: extraction must not delay the customer's message. Worth a
  second look when it can fail loudly.
