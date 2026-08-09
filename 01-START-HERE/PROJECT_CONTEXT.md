# PROJECT_CONTEXT.md

Everything Claude Code needs to continue PotatoFarm.io. Written to be
read first, before any file is opened.

Anything genuinely not known is marked **UNKNOWN** rather than guessed.

---

## 1. What this is

**PotatoFarm.io** — a WhatsApp-native lead qualification CRM for UAE
real estate brokerages.

- **Price:** $70 per agent per month (AED 257 + 5% VAT), 60 pooled
  conversations per agent, 35 fils per conversation beyond that
- **Owner:** Christopher Simon, COO of EDM Holdings, Dubai
- **Core promise:** an enquiry is answered in ~90 seconds, day or night,
  because portal leads go to four agencies at once and the first to
  reply usually gets the viewing

**Nothing has ever been compiled, deployed, or sent a message. There is
no customer.**

---

## 2. The folders

| Folder | What it is | Files |
|---|---|---|
| `potato-launch/` | The public marketing website | 36 |
| `potato-backend/` | API routes for the website's forms | 9 |
| `potato-crm/` | **The main application** | 264 |
| `potato-design-v4/` | Design-system reference pages | 4 |
| `potato-logo/` | Logo files and brand spec | 25 |
| `potato-tests/` | 18 audit scripts | 22 |
| `potato-prod/` | Deployment notes and `.env.example` | 6 |

Files named `preview-*.html` in `potato-launch/` are **generated** —
they inline the CSS and JS so a page can be opened directly. Do not edit
them; edit the real page and regenerate.

---

## 3. Technology

### The website (`potato-launch/`)
Plain **HTML, CSS and JavaScript**. No framework, no build step, no
`npm install`. Ten pages. Open a file in a browser and it works.

### The application (`potato-crm/`)

| | Version |
|---|---|
| Next.js | ^15.1.0 (App Router) |
| React | ^19.0.0 |
| TypeScript | ^5.7.0 |
| Prisma | ^6.1.0 |
| tRPC | ^11.0.0 |
| NextAuth | ^5.0.0-beta.25 |
| Zod | ^3.24.1 |

**Database: PostgreSQL.** Styling is Tailwind utility classes plus a
small set of custom rules in `src/styles/globals.css`.

There is also `potato-crm/mobile/` — a React Native shell. **UNKNOWN
whether it is complete**; a drift check keeps it in step with the web
theme.

---

## 4. What is built

**68 database models · 22 API routers · 103 procedures · 29 screens ·
23 scheduled jobs · 18 audit scripts.**

**97 of 103 procedures (94%) have a screen.**

Working areas: the WhatsApp assistant and its stop controls; the inbox;
pipeline and leads; listings with Trakheesi permit tracking; viewings
(book, reschedule, outcomes); offers (record, present, counter, accept);
vendors and weekly owner reports; deals through to DLD transfer;
commission; AML and compliance; the agent blackbook; email sync; billing
with a conversation allowance; Meta lead ads; reports with a baseline
chart; spoken requests ("Ask").

---

## 5. What is NOT finished

### It has never run
- **No `npm install` has ever been run** — `node_modules/` is absent
- **No database exists** — `prisma/migrations/` is absent, no migration
  has ever been applied
- **No build has ever run** — `.next/` is absent

**Expect real TypeScript errors on the first build.** This is a large
codebase written without a compiler ever checking it. That is normal and
does not mean the work is wrong.

### Six procedures have no screen

| | Why |
|---|---|
| `billing.trials` | Internal — gated on `audit:read`, not a customer screen |
| `aml.visibilityPolicy` | Read by other code, not by people |
| `onboarding.previewImport` | Superseded by `migration.inspect` |
| `org.switch` | Multi-brokerage accounts do not exist yet |
| `leads.assign` | Single-lead assign; the screen uses `pipeline.bulkAssign` |
| `requests.mine` | Request history — genuinely missing, small |

### Not built at all
- Voice recipes `BOOK_VIEWING` and `COMPARABLES` return a follow-up
  question rather than completing in one step. Deliberate, but the
  second step is not wired to the booking screen.
- **UNKNOWN:** whether the React Native mobile app is complete.

---

## 6. Known bugs

**All three known bugs are now FIXED.** Kept here because the pattern
matters more than the fix.

**1. `LEADS_WEBHOOK_URL` vs `LEAD_WEBHOOK_URL` — FIXED.**

`website-api/app/api/subscribe/route.ts` read the plural; every
`.env.example` defines the singular. It fell back to `""`, and the
`.catch()` below swallowed the rejection — **every newsletter signup
POSTed to an empty URL and nobody would ever have known.**

**2. The import screen rendered fields the router never returns —
FIXED.**

`app/src/app/(app)/settings/import/page.tsx` reads
`inspect.data.detectedSource`, `.columns`, `.rows` and `.willSkip`.
`migration.inspect` returns only `counted: { contacts, deals }`.

The screen would render blanks and the column-mapping table would be
empty. The screen also tells the user it can read a **Goyzer** or
**PropSpace** export; **no vendor-specific parsing exists** — the only
mention of a competitor in the migration code is a comment about Reapit's
onboarding being people rather than tooling.

Cut back to what `inspect` genuinely produces — which turned out to be
better than the invention: **grouped issues with severities, suggestions
and example rows**, so a brokerage can go and look at the records that
will not import. The Goyzer and PropSpace claims are gone.

**3. The routing screen read `.agents` from a procedure returning
`pool` — FIXED.**

Found by the new return-shape check, not by looking. The real shape
carries eligibility and capacity per agent, so "why did that lead not
come to me" is answerable without a manager guessing. The screen now
uses it.

**4. Nothing else is known.** All 18 audit scripts pass, including two
checks added specifically for the class of bug above: one for arguments
sent to a procedure, one for fields read from its return. That means the
checks find nothing, not that the code is correct — **it has never been
compiled.**

---

## 7. Design — colours

Ground `#F4F3F0`. Panel `#EBEAE6`.

| Use | Hex | Contrast on ground |
|---|---|---|
| All headings, titles, button labels | `#1A1A1A` | 15.68:1 |
| Body | `#4A4A4A` | 7.99:1 |
| Captions | `#6B6B6B` | 4.80:1 |
| **Potato orange — logo only** | `#E87A2E` | 2.66:1 |
| Highlight (upper-left of mark) | `#EE9149` | — |
| Shade (lower-right) | `#DB6E22` | — |
| Rim / border on orange fills | `#C4621D` | 3.70:1 |
| **Orange TEXT in the app** | `#A84900` | 5.23:1 |
| Eyes | `#8A4310` | — |

### The two oranges — do not merge them

`#E87A2E` at text size measures **2.66:1**, which fails accessibility.
It is fine inside the logo, which is artwork and exempt. It is **not**
fine for interface text somebody reads in a bright Dubai office.

**The lockup uses `#E87A2E`. UI text uses `#A84900`.** A script enforces
this and will fail the build if it is broken.

### Hierarchy is one hex

**Every heading, title, price and button label is `#1A1A1A`.** The rule:
**colour carries state, not hierarchy.** Four exceptions carry genuine
state — a green delta, an amber allowance figure, an orange "tight"
warning, a selected tab.

---

## 8. Design — type, layout, the mark

- **Font:** Inter, falling back to system sans. Monospace for small
  labels and figures.
- Labels: 10px, uppercase, letter-spacing 0.12em
- Figures use **tabular numerals** everywhere
- Page width **1120px**, gutter `clamp(20px, 4vw, 32px)`
- Buttons **48px**, inline actions **44px minimum** (tap targets)
- Body text max ~46–52 characters per line
- **Top navigation: seven items maximum.** Enforced by a check. It has
  drifted past this three times.

### The logo

Stacked lockup **300 × 162**: mark 108px centred at y=12, gap 26,
wordmark 30px / weight 500 / tracking −0.4, baseline 146.

**Four things break it:**
1. **Four unique SVG ids per instance** — gradient, blur, shadow, clip.
   Two marks on one page sharing any id means the second inherits the
   first, and a mismatched clip renders it invisible.
2. The wordmark must be **one inline element**. `PotatoFarm` and `.io`
   as flex siblings render a visible gap.
3. `text-anchor="middle"` with a coloured tspan is mis-measured by
   several renderers. Left-anchor at a measured x.
4. The highlight must stay **clipped to the form**.

Full spec: `potato-logo/SPEC.md`.

---

## 9. Database, API, auth, integrations

**Database:** PostgreSQL via Prisma. `potato-crm/prisma/schema.prisma`,
68 models. **No migrations have been generated.**

**API:** tRPC. Routers in `potato-crm/src/server/api/routers/`, mounted
in `root.ts`. Every procedure is permission-gated.

**Authentication:** NextAuth v5 with the **Resend** provider — email
magic links, no passwords. Links last 10 minutes. Sign-in pages at
`/sign-in`.

**External services the code calls:**

| | For |
|---|---|
| `api.anthropic.com` | The assistant and request classification |
| `graph.facebook.com` | WhatsApp Business and Meta lead ads |
| `api.stripe.com` | Subscriptions and usage billing |
| `api.resend.com` | Transactional email and sign-in links |
| `graph.microsoft.com` | Outlook mailbox sync |
| `gmail.googleapis.com` | Gmail mailbox sync |
| `maps.google.com` | Travel time between viewings |
| Upstash Redis | Rate limiting |

---

## 10. Environment variables

**Names only. No values appear anywhere in this project and none should
ever be committed.** `potato-prod/.env.example` (119 lines) is the
template — copy it to `.env.local` and fill it in.

Read by the code:

```
DATABASE_URL
ANTHROPIC_API_KEY
ASSISTANT_MODEL
NEXT_PUBLIC_APP_URL
NODE_ENV
CRON_SECRET
WEBHOOK_SIGNING_SECRET

WHATSAPP_APP_SECRET
WHATSAPP_VERIFY_TOKEN
META_APP_SECRET
META_VERIFY_TOKEN

STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SEAT_PRICE_FILS

RESEND_API_KEY
MAIL_FROM
SALES_INBOX
LEAD_WEBHOOK_URL          # see Known Bugs — one file reads LEADS_
TURNSTILE_SECRET_KEY

UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN

CRM_ENDPOINT
CRM_API_KEY
```

---

## 11. Deployment

**Intended target: Vercel.** `potato-crm/vercel.json` defines **23 cron
jobs** matching the 23 scheduled jobs in `src/server/jobs/index.ts`.
**These two lists must stay in step** — a check enforces it.

**The website deploys separately** as static files. `potato-launch/`
plus `_headers` and `_redirects` — suits Cloudflare Pages or Netlify.
A ready-made zip is `potatofarm-DEPLOY-THIS.zip`.

**UNKNOWN:** which hosting account, domain registrar or region will
actually be used. Nothing has been provisioned.

---

## 12. What must NOT be changed

Each of these came from a bug, a review, or a decision that took an
argument.

### Safety
- **Replay has no send capability.** You can see what happened without
  it happening again.
- **The kill switch is checked before every model call**, uncached.
- **Per-conversation mute is checked before every model call.**
- **The audit log has UPDATE and DELETE revoked at the database.** A
  grant, not a policy.

### Legal
- **An agent must never see why a sanctions screening was held.**
  Tipping off is an offence in itself. A check scans every agent-facing
  screen for this.
- **AML erasure defers against a live KYC file** — five-year retention
  outranks the request.
- **A decision NOT to file a report is still a decision** and needs a
  recorded reason.
- **Never claim the software files AML reports.** It prepares them; the
  firm files on goAML.

### The WhatsApp window
- Outside 24 hours from the customer's last message, a normal message is
  **accepted by the API and never delivered**. Always check the window
  before offering to send.

### Data
- **Money is BigInt fils.** One formatter, `src/lib/money.ts`. Never
  floats.
- **`crossTenant(reason)`** — no unscoped query without a stated reason.
- **A dead lead is never messaged.**

### Product
- **Offers rank by strength, not price.**
- **A counter creates a new row.** Amounts are never overwritten.
- **The leaderboard ranks viewings, not reply speed.**
- **The blackbook is scoped to the calling agent, and the private note
  is deliberately NOT audited** — an audit row is a record a manager can
  read.

### Naming
- **PotatoFarm.io everywhere.** Never "Potato.ai".

---

## 13. How to work on this

Three mistakes were made repeatedly. All three are avoidable by reading
before writing.

**1. Read the API before calling it.** Screens were written against
*assumed* procedure shapes eight times in one session. `getSecret` is
actually `readSecret`; `notify` is actually `dispatch` with nine fields;
`Reminder` did not exist. **Grep the file first, every time.**

**2. A module nobody imports is not built.** Six library modules were
written that no router, job or webhook called. `crm-audit.py` checks for
this.

**3. Test the test.** `open(p,"w").write(open(p).read()...)` truncates
the file before reading it — the tampered copy comes out empty and every
check reports a false pass. Read fully, **assert the target string is
present**, then write.

### The audit scripts

Eighteen scripts in `potato-tests/scripts/`. Run them after changes:

```bash
python3 potato-tests/scripts/crm-audit.py potato-crm
python3 potato-tests/scripts/security.py potato-crm
python3 potato-tests/scripts/reachability.py potato-crm
python3 potato-tests/scripts/consistency.py
```

**Each script collects failures differently and there is no way to
guess:**

| Script | Call |
|---|---|
| `audit.py`, `crm-audit.py` | `fail(msg)` |
| `claims.py`, `consistency.py`, `contrast.py`, `reachability.py` | `FAILS.append(msg)` |
| `ux-audit.py`, `responsive.py` | `issue(file, msg)` |
| `deep-audit.py`, `site-deep.py` | `bug(msg)` |

---

## 14. The first five things to do in Claude Code

1. **Compile it.** `cd potato-crm && npm install && npx prisma generate
   && npx tsc --noEmit`. Expect errors. Fix them.
2. **Create a database** and run `npx prisma migrate dev --name init`.
3. **Fix the `LEADS_WEBHOOK_URL` typo** in section 6.
4. **Provision the services** in section 9 and fill in `.env.local`.
5. **Then ring brokerage owners.** The website is ready. Every review of
   this project has ended in the same place: there is no customer, and
   no amount of building changes that.
