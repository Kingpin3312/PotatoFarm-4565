# Export and erasure

Built because the marketing site already promises it. The FAQ says "every
contact, message and deal, in one export, whenever you ask" and the
security page says the same. A promise in copy with no code behind it is
the thing that turns a sales conversation into a refund.

## Two exports, not one

**Tenant export** — a brokerage leaving or backing up. Everything they
own, cursor-paged and streamed, because four years of messages will not
fit in memory and an export that falls over at 80% is worse than one that
was never offered.

**Subject export** — one person asking what is held about them. Scoped to
their own record and written in plain language: "what you told us",
"properties you asked about", "messages", with authors described as *you*,
*our assistant* and *our team* rather than as database enums.

Conflating the two is how a brokerage accidentally hands one buyer another
buyer's file.

## The conflict, and how it is resolved

The audit log is append-only at the database level. `REVOKE UPDATE,
DELETE`. That was the right call and the security page depends on it.

A right-to-erasure request says: remove this person's personal data.

Both cannot be absolute. The resolution:

> **The skeleton survives, the person does not.**

The audit row keeps what happened, when, and to which record. It loses
every field that identifies a human — `before`, `after`, IP, user agent.
You can still prove a lead was assigned on the 14th and erased on the
30th. You can no longer tell from the log who they were.

That satisfies erasure, because the remaining data can no longer be
attributed to an identifiable person, while keeping the integrity record
intact. It is the standard position, and it is defensible in a way that
"we deleted the audit trail" is not.

**One deliberate exception:** the erasure itself is logged, with a one-way
fingerprint of the phone number rather than the number. It answers "have
we already done this one?" without storing the thing being erased — and
without it you cannot prove you honoured the request at all.

## Three decisions worth knowing

**Messages are scrubbed in both directions.** What an agent wrote *to*
somebody is as identifying as what they wrote back.

**The lead is tombstoned, not deleted.** Enquiry and viewing counts —
which the brokerage needs for its own reporting, and which are not
personal data once detached — do not silently change underneath them.

**A departed brokerage's tenancy is flagged for manual removal, not
deleted on a timer.** A tenancy disappearing automatically with nobody
looking is how a customer who was mid-renewal loses four years of data.

## The AML carve-out — a correction

This section was added after a competitive review, and it corrects two
things that were wrong in shipped code.

**A right to erasure does not override a statutory retention
obligation.** UAE AML law requires a brokerage to keep customer due
diligence records for five years, including for a deal that collapsed. We
were erasing on request regardless.

Now: a lead with a KYC file is not erased. It is recorded, the requester
is told plainly why and on what date the data will go, and the compliance
officer is notified. Quietly erasing it would leave the brokerage unable
to answer a Ministry of Economy inspection — a worse outcome for them
than the one the request was trying to avoid.

**The retention default was 365 days.** That was a number I picked, and
it was wrong for this market. It now derives from the five-year AML
obligation rather than from an assumption.

Neither was found by a test. Both were found by asking what the law in
this market actually requires, which is an argument for doing that
earlier than we did.

## Still to decide, and it is yours not mine

The retention period. It defaults to 365 days in the sweep, but that is a
placeholder — it is a commercial and legal decision, it goes in the
privacy policy, and the number needs to be the same in both places.

## What the site already promises

Checked against the live pages rather than from memory:

| Promise | Where | Backed by |
|---|---|---|
| "Every contact, message and deal, in one export, whenever you ask" | homepage FAQ | `exportTenant` |
| "Full export on demand, in a format you can actually use, whether or not you're staying" | security page | `exportTenant` |
| Data subject access | implied by the privacy policy | `exportSubject` |
| Erasure | required by GDPR and the UAE PDPL | `eraseSubject` |

The first two were live on the site before any of this existed. They are
now true. Worth re-running that check whenever the security copy changes,
because copy moves faster than code and the gap is invisible until
somebody asks.
