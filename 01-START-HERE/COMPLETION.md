# Where this project actually stands

Written to be read by whoever picks it up, not to make anyone feel good
about it.

---

## What is finished

**The website.** Ten pages, deployable today. Real price, honest claims,
share cards, a 404, security headers. Every figure on it can be defended
in a meeting — which was not true a week ago.

**The backend.** 66 models, 20 routers, 22 scheduled jobs. The
assistant, the reply window, both stop controls, Trakheesi, AML, the
vendor and offer side, deal progression to DLD transfer, commission,
billing with a conversation allowance, Meta lead ads, email sync, the
blackbook.

**The brand.** One mark across seven surfaces, one palette, one type
scale, one gutter. A consistency check that fails the build on
divergence.

**Thirteen audit scripts.** Markup, contrast, responsive, links, design
tokens, cross-surface consistency, marketing claims, CRM structure,
architecture, security, UX, reachability, and the assistant invariants.

---

## What is not finished, precisely

### The interface is 95% built, up from 15%

**95 of 100 procedures now have a screen.** Thirty-two screens and components.

Everything that blocks a pilot is built:

| | |
|---|---|
| Setup, Team | A brokerage can onboard itself and invite agents |
| Record an offer · present · counter · accept | The negotiation, end to end |
| Book a viewing, record the outcome | |
| Compliance, and the screening decision | The strongest argument in the pitch, now usable |
| Reports with the baseline chart | What the pilot is proved with |
| Blackbook and the person timeline | |
| Add an owner | |
| Channels | Where you find out a feed went quiet |
| Privacy — subject access and erasure | The legal page promises both |

Also built since: **support access** (the 72-hour named grant the
security page promises), **routing** with a preview of who gains and
who loses before a strategy changes, **sending a file** to a buyer,
the **leads list** with bulk assign, and the **assistant's own
settings**.

**Still missing, and none of it stops a pilot:**

| Router | Missing | What it costs |
|---|---|---|
| `aml` | 4 of 8 | Per-lead KYC status. The officer's view is built |
| `migration` | 3 of 3 | Importing from an existing CRM. Matters at customer two, not one |
| `org` | 3 of 6 | Switching org, accepting an invite, removing a member |
| `pipeline` | 3 of 5 | Editing stages, rebalancing |
| `copy` | 2 of 2 | Drafting listing copy |
| `commission`, `vendors`, `viewings`, `blackbook` | 2 each | Preview, vendor brief, reschedule, export |

Also built since: **the invitation page** (an invited agent had a link
with nothing behind it), the **per-lead KYC panel**, **inbox thread
controls**, and **importing from an existing CRM** — which matters
commercially rather than technically, because a brokerage with four
years of history in Goyzer will not move without it.

### The last five, and why they stay

| | |
|---|---|
| `billing.trials` | Ours, gated on `audit:read`. Which trials are dying is not a customer screen |
| `aml.visibilityPolicy` | Read by other procedures, not by people |
| `onboarding.previewImport` | The wizard's spreadsheet path; `migration.inspect` covers the full CRM export |
| `org.switch` | Multi-brokerage accounts, which do not exist yet |
| `pipeline.bulkAssign` | Now called by the leads screen — see below |

### What building the last 20% turned up

A check for **argument shapes** — a screen calling a procedure with a
key it does not accept. Both sides are individually correct, so nothing
else here could see it, and it fails at runtime in front of a user.

It found **eight**, all mine:

- The leads screen passed `leadIds` to `leads.assign`, which takes one
  `leadId`. It should have been `pipeline.bulkAssign` — the duplicate I
  had just written off as unnecessary.
- `org.removeMember` takes `userId`, not `memberId`.
- `onboarding.setStep` takes a state enum, not a boolean.
- `migration.inspect` takes parsed contacts, not a raw text sample.

And two where the **screen was the wrong design**, not the wrong
argument:

**`aml.assessRisk` takes factors, not a rating.** I had built a form
asking the officer to pick low, medium or high. The router asks whether
the buyer is a PEP, non-resident, a company, whether cash is involved —
and derives the rating. That is better: an officer answering questions
of fact can defend the answer, and an inspector asks what a rating was
based on rather than what it was.

**`assistant.updateSettings` controls spend, not features.** I had
invented toggles for after-hours replies and Arabic. What it actually
governs is a monthly ceiling and a warning threshold — which is the more
useful lever anyway. An assistant answering everything is the product
working; one quietly running up a bill is what an owner needs a control
for.

---|---|
| `pipeline.stages`, `bulkAssign`, `rebalance` | Editing the board itself |
| `vendors.attach`, `brief` | Attaching an owner to a listing, and the call brief |
| `viewings.reschedule` | Moving one, rather than cancelling and rebooking |
| `blackbook.add`, `exportMine` | Adding somebody, and the export the ownership split promises |
| `commission.preview`, `record` | |

**Not missing — internal or covered:**

`billing.trials` is our view of which trials are dying, gated on
`audit:read`; it correctly has no customer screen. `aml.visibilityPolicy`
and `onboarding.previewImport` are read by other procedures rather than
by people. `org.switch` matters only for multi-brokerage accounts, which
do not exist yet.

**A real gap worth naming: `blackbook.exportMine`.** The ownership split
promises an agent can take their notes when they leave. Until that
button exists, the promise is a paragraph in a design document.

### It has never been compiled

No `npm install` has run. No migration has been applied. **There is no
database.** Every line was written against a schema and a type system
that nothing has verified.

`PRE-FLIGHT.md` exists for exactly this. Expect the first compile to
produce real errors — that is normal for a codebase this size and does
not mean the work is wrong.

### It has never sent a message

No WhatsApp number is connected. No Meta app. No Stripe keys. The
assistant has never replied to anybody.

---

## What blocks a pilot, in order

1. **Compile it.** A contractor with the repo, `CLAUDE.md` and
   `PRE-FLIGHT.md`. Days, not weeks.
2. **Provision.** Postgres, Stripe live keys, a Meta app, a WhatsApp
   Business number.
3. **Build the AML screens.** The compliance story is the moat and it is
   currently unreachable.
4. **Build viewings properly.** An agent books viewings all day.
5. **Ring brokerage owners.**

## What does not block a pilot

Everything else on the missing list. `migration`, `routing`, most of
`reports` — real gaps, none of which stop a first brokerage using this.

---

## What the last sweep found

The screens all compile against components and classes that have to
exist. Three did not.

**`variant="ghost"` was never a variant.** Used fourteen times across
the screens built in this pass; the five defined are `primary`,
`surface`, `secondary`, `quiet`, `danger`. Every one would have rendered
as an unstyled button — the markup correct, the value wrong, and nothing
else here able to see it.

**`btn-inline` was used nine times and defined nowhere.** It would have
rendered as plain text. Same class of miss as an undefined CSS variable:
it renders *almost* right, which is why it survives.

**`btn-secondary`** on the inbox error state, also undefined — a retry
button that looked like a sentence. Replaced with the real component
rather than adding a second way to draw one button.

Both are now checked: `ux-audit.py` fails on a variant that is not
defined, and on any bespoke class in markup with no rule.

### A note on the regression tests

Four of those checks reported FAIL when they were working. The test
harness did this:

    open(p, "w").write(open(p).read().replace(...))

`open(p, "w")` truncates the file the moment it is called, so the read
nested inside it returns an empty string and the file is blanked. Every
tampered copy was empty, so of course nothing was found.

**A test that silently does nothing reports the same as a check that
does not work, and the two are indistinguishable from the output.** The
harness now reads fully, asserts the string is present, and only then
writes.

## The thing that has not changed

**There is no customer.** Every review in this project has ended here
and it is still true.

Kendal names Betterhomes, Prime Capital and Chestertons. The product gap
between us is arguable in both directions. The customer gap is not
arguable at all, and no amount of building closes it.

The website is ready. The next move is a phone call, not a commit.
