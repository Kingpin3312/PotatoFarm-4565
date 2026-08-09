# PotatoFarm vs S.MPLE — audit, gap analysis, roadmap

Phase 1 of the AI-native upgrade. Nothing was rewritten to produce this.

**One caveat about the benchmark, stated up front.** `serhant.com/simple`
is blocked by this environment's network egress proxy, so I could not read
it directly today. The S.MPLE column below comes from
`05-documents/SERHANT-ANALYSIS.md`, already in this repository, which
cites Inman's reporting on the rollout and the product's own published
figures. Where that document is silent, this one says "not established"
rather than guessing. **No capability is attributed to S.MPLE that is not
in that record.**

---

## A. Architecture summary

| Layer | What it is |
|---|---|
| Framework | Next.js 15 App Router, React 19, TypeScript 5.7 (`strict` + `noUncheckedIndexedAccess`) |
| API | tRPC 11 — 22 routers, 103 procedures, every one permission-gated |
| Database | PostgreSQL via Prisma 6 — 68 models, 53 enums, 3 migrations |
| Tenancy | **Postgres row-level security**, transaction-local `set_config`, `FORCE ROW LEVEL SECURITY`, separate privileged connection reached only via `crossTenant(reason)` |
| Auth | NextAuth v5, Resend magic links, database sessions |
| AI | Anthropic, called through one gated path (`assistant/run.ts`) |
| Styling | Tailwind v4, `@theme inline`, one token file |
| Jobs | 23 scheduled jobs, matched 1:1 to 23 Vercel crons by a check |
| Storage | S3-compatible, request signing in-repo, verified against AWS's published vector |
| Hosting | Vercel (app) + Cloudflare Pages/Netlify (static site). Nothing deployed yet |

**The architecture is right for this product and should not be replaced.**
Single-tenant-per-org with database-enforced isolation is more defensible
than most CRMs manage, and it has been tested with two brokerages in one
database.

## B. Existing feature inventory

Working: WhatsApp assistant with kill switch and per-conversation mute ·
inbox · pipeline · leads · listings with Trakheesi permit tracking ·
viewings (book/reschedule/outcome) · offers (record/present/counter/accept,
ranked by strength not price) · vendors and weekly owner reports · deals
through to DLD transfer · commission · AML and compliance · agent
blackbook · Gmail/Outlook sync · billing with a conversation allowance ·
Meta lead ads · reports · **spoken requests**.

## C. Data model

Already represents: Users, Teams, Contacts (Lead/Vendor/BlackbookEntry),
Properties/Listings, Requirements, Deals, Activities, Conversations,
Tasks (FollowUp/TaskPlan), Documents, Viewings, Offers, Communications,
Audit logs, Integrations (Channel), and AI requests (AgentRequest).

**Three things the brief asks for that the model cannot represent:**

1. **Client memory.** No model for qualitative facts — motivation,
   objection, family circumstance, communication style, why a deal was
   lost. There is `Lead.notes` (one free-text field) and
   `BlackbookEntry.privateNote`. Nothing structured, nothing queryable,
   nothing the AI can retrieve selectively.
2. **Recommendations.** No model for a next-best-action, its reasoning,
   its priority, or whether it was taken.
3. **Scores over time.** `Lead.score` exists as a single nullable `Int`.
   No history, so "engagement has increased over the last 7 days" is
   unanswerable.

## D. AI capabilities today

Stronger than the brief assumes in one direction and weaker in another.

**Already built:** a closed set of **7 recipes** (`COMPARABLES`,
`LISTING_PITCH`, `VENDOR_UPDATE`, `LOG_CONTACT`, `BOOK_VIEWING`,
`DRAFT_REPLY`, `DAY_BRIEF`) behind a classifier with a confidence floor;
a customer-facing assistant that qualifies leads in conversation; a
guardrail layer that rejects ungrounded figures, screens injection, and
refuses to negotiate or claim to be human; a replay harness that
**cannot** send; a kill switch checked uncached before every model call.

**The gap that matters most:** the classifier extracts only
`building`, `personName` and `when`. So the brief's flagship example —

> "Met Sarah today. She's looking to buy a 4-bedroom villa in Dubai Hills
> around AED 12m. She needs to move within three months."

— produces a blackbook entry whose note is the raw transcript, plus a
follow-up in three days. **No budget, no bedrooms, no community, no
timeframe, no requirement, no matching, no opportunity.** The agent still
types all of it. This is the single biggest distance between the codebase
and the North Star.

## E. UX assessment

`/ask` exists and is good, but **`/` redirects to `/inbox`** — the
natural-language surface is one of seven nav items rather than the front
door. An agent's first screen is a message list, which is a
conventional-CRM answer to "what do I do now".

`DAY_BRIEF` returns viewings count and unanswered conversations. It does
not say what matters, why, or in what order.

## F. Mobile assessment

Bottom tab bar (Inbox/Today/Pipeline/Ask + More), safe-area insets,
44px targets, tested at 375px. Good.

**But voice does not work on iPhone.** `/ask` uses
`webkitSpeechRecognition`, which iOS Safari does not implement — and
every browser on iOS uses the Safari engine, so this fails on all of
them. The code handles it honestly with a message telling the user to
type instead. The brief's primary device and primary interaction do not
currently meet.

## G. Security assessment

The strongest part of the codebase. RLS proven with two tenants;
`crossTenant(reason)` with a build-failing check on bare `rootDb`; audit
log with `UPDATE`/`DELETE` revoked at the database; webhook signatures
timing-safe against the raw body; CSP, HSTS; compliance reports invisible
to admins because tipping off is an offence.

For the AI work ahead, the relevant gap is **graded autonomy**. There is
a binary kill switch and a per-conversation mute. There is no
suggest/draft/approve/execute ladder, and no record of what an AI action
changed or how to undo it.

## H. Performance assessment

`tsc` clean, build clean, one extended Prisma client cached per
brokerage. Every tenant query runs in its own transaction — deliberate,
because widening the scope means holding a connection across an Anthropic
call. **A connection pooler is required before real traffic** and is
documented.

The AI risk ahead: scoring 500 leads nightly and generating
recommendations must not run in the request path. It belongs in the jobs
layer, which already exists.

---

## I. Competitive gap analysis

S.MPLE, from the record: an agent speaks or texts a request; it maps to
one of **17 recipes**; software does the work; **a human advisor runs
quality control before it returns**. NPS 97, 95% repeat use within five
days, ~3.5 hours saved per request. **Free, and only to SERHANT agents.**
It is a recruiting instrument, not a product you can buy.

Three things about it do not port to Dubai: every recipe that matters
assumes **MLS comparables** and Dubai has no MLS; SERHANT is US-licensed;
and the advisor layer scales by hiring.

| Area | Verdict |
|---|---|
| AI assistant | **PotatoFarm superior** — ours talks to the customer within 90 seconds. Theirs is back-office; it does not answer a lead. |
| Voice interaction | **S.MPLE stronger** — theirs works on the phone an agent actually carries. Ours does not run on iPhone at all. |
| CRM automation | **PotatoFarm superior** — 23 scheduled jobs against a staffed advisor queue. |
| Follow-up automation | **Equal** — `FollowUp` + `followups.due` job. |
| Client management | **Missing from PotatoFarm** — no qualitative memory layer. |
| Deal management | **PotatoFarm superior** — through to DLD transfer, offers ranked by strength. |
| Task management | **Equal** |
| Email assistance | **Equal** — Gmail/Outlook sync, `DRAFT_REPLY`. |
| Research | **Not comparable** — theirs is MLS-bound; ours reads the brokerage's own book because that is what Dubai has. |
| Lead generation | **PotatoFarm superior** — Meta lead ads, portals, WhatsApp, website. Not established for S.MPLE. |
| Lead qualification | **PotatoFarm superior** — the assistant qualifies in the conversation. |
| Property intelligence | **Partial** — buyer→property matching exists; the reverse view (which buyers for this property) does not. |
| Pipeline intelligence | **Missing** — no probability, no forecast weighting. |
| Transaction management | **PotatoFarm superior** |
| Agent productivity | **Split** — they have 17 recipes to our 7; we return in seconds where they take hours. |
| Predictive recommendations | **Missing entirely** — `Lead.score` is a column nothing writes. |
| Autonomous workflows | **PotatoFarm superior** — ours sends to customers unattended. Theirs requires a human before anything ships. |
| Human-in-the-loop | **Partial** — confidence gate and kill switch, but no graded autonomy. |
| Mobile experience | **Partial** — layout good, voice broken on the target device. |
| Ease of use / clicks | **Missing** — the natural-language surface is not the front door. |
| Data entry burden | **Biggest gap** — extraction captures three fields, so the agent still types everything. |
| Personalisation | **Missing** — no client memory for the AI to draw on. |

### The strategic read

**They are not competing with you for customers. They are competing with
brokerages for agents.** S.MPLE cannot be bought, does not operate in the
UAE, and is bounded by how many advisors SERHANT employs.

Two asymmetries are worth building on rather than closing:

1. **Theirs answers the agent. Ours answers the customer.** A lead that
   gets a reply in 90 seconds at 2am is revenue S.MPLE structurally
   cannot capture, because a human advisor is asleep.
2. **Their advisor opens the MLS. Ours reads the brokerage's own book.**
   PotatoFarm already holds the listings, viewings, offers and deals a
   deliverable needs. That is a data advantage, not a feature gap.

**The one thing to copy is the interaction, not the mechanism:** speak,
and the work happens. Then beat them by removing the human from the loop
and returning in seconds with a stated confidence.

---

## J. Top 20 improvements, prioritised

Ranked on user value × revenue impact × feasibility.

### P0 — the North Star demo

1. **Structured extraction from natural language.** Widen the classifier
   to pull budget, bedrooms, community, property type, timeframe,
   intent and motivation, then create the person, the requirement and
   the follow-up in one turn. This is what makes "just tell PotatoFarm"
   real.
2. **Lead scoring that actually writes `Lead.score`,** with history so
   trend questions are answerable.
3. **Next-best-action engine** — one recommended action per lead, with a
   reason, priority and value, computed in the jobs layer.
4. **Command centre as the front door.** `/` becomes "What can I do for
   you?" with priorities beneath it.
5. **A real daily briefing** — the five things that matter, each with
   why, and the pipeline value at stake.
6. **Client memory model** — structured qualitative facts the AI can
   retrieve.

### P1 — trust and depth

7. Deal health score with a stated reason and a recommended action.
8. AI action log recording what changed, who approved, and how to undo.
9. Graded autonomy: Copilot / Assisted / Autopilot.
10. Voice that works on iPhone (server-side transcription, not Web Speech).
11. Property-side intelligence — which buyers for this listing.
12. Global semantic search across people, properties, deals and notes.

### P2 — completeness

13. Lifecycle vocabulary in the interface (the potato journey), subtly.
14. Engagement and churn scoring.
15. Seller-likelihood identification from the existing database.
16. AI communications that read as the agent, drawing on memory.
17. Management intelligence layer.

### P3 — later

18. Remaining recipes toward parity with 17.
19. Vendor-side conversations (17 call sites still read `conversation.lead`).
20. Integration surface: calendar, telephony, Zapier.

---

## Status — what has been built since this was written

P0 is done. Each item was verified against a real database rather than
demonstrated, and each check was confirmed to fail when the thing it
checks is broken.

| | |
|---|---|
| 1. Structured extraction | **Done.** `npm run check:intake` |
| 2. Lead scoring that writes `Lead.score` | **Done.** With four components and history |
| 3. Next-best-action engine | **Done.** Ordered by urgency, not warmth |
| 4. Command centre as the front door | **Done.** `/` no longer redirects to the inbox |
| 5. A real daily briefing | **Done.** Five things, each with why |
| 6. Client memory model | **Done.** `ClientFact`, written by the intake flow |
| P1 · Voice on an iPhone | **Done.** `npm run check:voice` |

Three bugs the work turned up, all found by running it:

- **Budget fit used a median.** A buyer with a live 17.6m offer on a
  property the brokerage held scored 6/25 for "budget above your usual
  stock", because the median of a three-listing book is not the question
  being asked. A price band is.
- **"Today" started at the wrong hour.** The server's clock is UTC, so a
  Dubai agent's day began at 4am and a 1am viewing was filed under
  yesterday.
- **Three rules could never fire.** `openOffers`, `offerExpiringInDays`
  and `matchesWaiting` were hardcoded to zero in the sweep — the light
  switch wired to nothing, and worse than absent because they read as
  covered.

**Voice on an iPhone is done too** — P1 item 10, taken next because it
was the one place S.MPLE was genuinely stronger. Recording happens on
the device with `MediaRecorder` and transcription on the server, through
any provider with an OpenAI-compatible endpoint.

Two things it turned up:

- **`Permissions-Policy: microphone=()` blocked the microphone
  outright.** Correct when it was written, because nothing used a
  microphone. The moment voice arrived it silently blocked the
  product's most differentiated interaction — and `getUserMedia` fails
  with the same error a user denying permission produces, so it would
  have read as the agent saying no.
- **iOS Safari has no webm encoder.** It does not throw when you ask for
  one; it quietly records mp4. Sending that under a `.webm` filename
  gets rejected as corrupt, which looks like a broken microphone. The
  filename now follows the container the browser actually produced —
  verified by forcing Safari's behaviour in a real browser and watching
  `note.mp4` arrive where desktop sends `note.webm`.

It is also now *better* than the browser API rather than merely working
where that one does not: the transcription request carries a Dubai
vocabulary hint, so it spells Jumeirah and Trakheesi. Web Speech has no
equivalent.

**Remaining P1:** deal health scores, the AI action log surfaced in the
interface, graded autonomy, property-side intelligence and semantic
search.

---

## Build order

1. Client memory + recommendation + score-history models (one migration)
2. Structured extraction → the flagship one-sentence flow
3. Lead scoring in the jobs layer
4. Next-best-action engine
5. Command centre + real daily briefing
6. Deal health
7. AI action log and graded autonomy
8. iPhone voice

Each step ships behind the existing permission model, the existing kill
switch, and the existing confidence gate. **Nothing that works today is
removed.**
