# AML and KYC

## This is not a feature

Every brokerage concluding a purchase or sale in the UAE is a **DNFBP**
under anti-money-laundering law. That brings obligations with
administrative penalties attached: registration on goAML, customer due
diligence, sanctions screening before onboarding, Real Estate Activity
Reports, a named compliance officer, and five-year records.

We had none of it. So did most of the CRMs in this market, as far as
their marketing shows — which makes this simultaneously the biggest hole
in the product and the clearest opening in the category.

**Everything here needs review by a UAE compliance adviser before
launch.** It is written from the Ministry of Economy guidance and the
FIU's published requirements. It is a starting point, not legal advice.

## The two numbers that are law, not settings

**REAR trigger: AED 55,000 in cash, single or linked.** Linked is the
part that gets missed — three payments of twenty thousand across a week
aggregate and trigger it. Virtual asset settlement triggers it whatever
the amount. Tested against six cases including the aggregation window and
a large bank transfer, which does *not* trigger.

**Retention: five years**, even if the deal collapses.

Neither is configurable per customer, and neither should be moved to suit
a brokerage that finds it inconvenient.

## Risk is rated with reasons, not a score

The regulation asks for a risk-based approach, and an inspector asks
*why* a client was rated low. "The system said so" is not an answer, so
the assessment produces reasons alongside the rating, and a corporate
buyer with no identified beneficial owner is called out explicitly —
shell companies are the mechanism the whole obligation exists to catch.

Review intervals follow the rating: six months for high, twelve for
medium, twenty-four for low.

## Tipping off — the one place we hide information deliberately

Telling a client that a report has been filed, or is being considered, is
an offence in its own right, separate from anything the client may have
done.

So compliance reports are visible to the compliance officer only. The
assistant is paused on that conversation. **The agent is not told why** —
they see a neutral hold that says the file is with compliance, carry on
as normal, and do not mention it to the client.

This is the only place in the product where information is deliberately
withheld from the person doing the work. It is worth being explicit about
that in the code and in training, or it looks like a bug and somebody
"fixes" it.

## A decision not to file is still a decision

`ReportType.NO_FILING` exists on purpose. An inspector asks why you did
not report as often as why you did, and a reviewed-and-cleared record
with a rationale is a far better answer than silence.

## Two corrections this forced elsewhere

Both in code that was already written, and neither found by a test:

1. **Erasure now defers when a KYC file exists.** A right to erasure does
   not override a statutory retention obligation. We were erasing anyway.
2. **The retention default was 365 days.** A number I picked. It now
   derives from the five-year obligation.

## The opportunity

Collecting a passport and an Emirates ID is the most tedious part of a
Dubai transaction, and it is currently done by an agent chasing somebody
on WhatsApp by hand.

Our assistant is already in that conversation. `KycDocument.collectedVia`
defaults to `WHATSAPP` because that is the intended path: the assistant
asks, receives, files and flags for verification, and the compliance
record builds itself.

That is a legal obligation, discharged through the channel we already
own. It is the strongest product idea in the competitive analysis, and it
is hard for a broad ERP to copy because they do not have the
conversation.

## The compliance officer role

Now in the permission matrix, and **deliberately not a superset of
anything**.

They see every KYC file and every report across all leads, and they
approve due diligence. They cannot change billing, publish listings or
remove members. An admin can run the brokerage and **cannot read a
suspicious transaction report** — bundling compliance into ADMIN is the
tempting shortcut and it defeats the separation the appointment exists to
create.

An agent sees that a file exists and what is outstanding, so they know
whether they can proceed. They cannot approve it and cannot see the
reports.

Ten assertions cover that separation. The first run of them failed, and
it was the *test* that was wrong — a naive substring match had found the
words "compliance:read" inside a comment explaining that admins
deliberately do not have it. Worth recording, because a test that passes
for the wrong reason is worse than one that fails.

## Collecting documents over WhatsApp

Five rules, each with a reason.

**Never during qualification.** Asking an enquirer for a passport because
they asked about a three-bed in Marina is excessive collection, and it is
creepy. The obligation attaches to a transaction, not a conversation.
Documents are requested only once a deal is agreed.

**Always say why, in plain words.** "An AI asked me for my passport on
WhatsApp" is a sentence that ends badly. The request names the legal
obligation, names the brokerage, says what happens to the file, and
offers to do it in person instead. A request that sounds like phishing
will be treated as phishing, and rightly.

**The assistant collects. It never verifies.** An automated decision that
a document is genuine has legal weight, and getting it wrong either way
is serious — rejecting a real buyer, or accepting a forgery into a file a
regulator will later read. Documents are stored and queued for a human.
The assistant says "we'll confirm shortly", never "verified".

**The image never lives in the message thread.** WhatsApp media URLs
expire, and a passport in a conversation log is a passport in every backup
and export of that conversation. It goes to object storage; the message
records only that something arrived.

**A blurry passport is worse than none.** It looks collected, the file
looks complete, and it fails at the moment somebody needs to read it.
Quality is checked on receipt so the assistant can ask again while the
person is still in the conversation, rather than an agent finding out a
fortnight later.

## Screening: nothing is auto-cleared

Name matching is fuzzy and always will be. Common names generate hits
constantly, and a system that quietly dismisses anything under a
threshold will one day dismiss the one that mattered.

So `AUTO_CLEAR_THRESHOLD` is deliberately `null`. A possible match goes
to the compliance officer with the hit detail and a person decides,
recording why — an inspector will ask.

A confirmed match is different and urgent: freeze without delay, file a
CNMR on goAML, notify the EOCN. Software does not make that decision
either, but it must make it impossible to miss.

## Not built yet

- **A screening provider implementation.** The interface is here; nothing
  calls a list. Dow Jones, Refinitiv and LexisNexis all serve this market,
  and the UN and EOCN lists are published directly.
- **Image quality checks.** The messages are written; the detection is
  not.
- **goAML submission.** Reports are recorded here and filed manually.
  Automating it needs the portal's own integration terms.
