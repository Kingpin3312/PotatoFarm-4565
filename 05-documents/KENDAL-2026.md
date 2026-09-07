# PotatoFarm vs Kendal — checked before deployment

Two parts. First, whether our own claims are true. Second, what Kendal
actually has today rather than what an audit found months ago.

---

## Part one: our own work

**26 of 26 capabilities verified in the code**, not asserted from
memory. The assistant, the window, both stop controls, Trakheesi, AML,
vendors, offers, deals, commission, matching, billing, signup, cards,
portals, the audit log, erasure, and all three mobile features.

One thing worth saying about how that check went: **the kill switch came
back as missing.** It is not — my search pattern used the old name, from
before I renamed it to "Stop everything" for consistency. The rename
worked; the check was looking for a ghost.

That is the fourteenth false positive from my own tooling in this
project, and it is the same shape as all the others: a pattern written
from memory rather than read from the code.

---

## Part two: what Kendal has now

Their site and current listings show a wider product than the audit
found. Three of the differences are real gaps for us.

### The gap that matters most: Facebook and Instagram lead ads

Kendal ingests leads directly from Meta ad accounts. **We ingest
Property Finder, Bayut, Dubizzle and website forms — and nothing from
Meta.**

That is not a minor integration. A large share of Dubai brokerage lead
spend goes to Instagram and Facebook lead forms, and for some firms it
is the majority. A brokerage running Meta ads would have to forward
those leads by hand or not use us for them at all, which means the
response-time argument — our entire pitch — does not apply to their
biggest channel.

**This is the one I would build before launch.** It is a webhook and a
form-field mapping, and the ingest pipeline already exists.

### Voice commands, not just voice notes

Kendal's assistant is voice-activated: *"manage tasks, send contracts,
and communicate with clients using voice commands."*

We built voice **notes** — hold to record, transcribe, attach to a
lead. That is dictation. Theirs is control.

I would still argue our version is the more useful of the two for an
agent in a car, because "make a note about this buyer" is a real daily
task and "send a contract by voice" is a demo. But it is a genuine
capability we do not have, and it demos better than anything we own.

### A no-code website builder

Kendal builds the brokerage a website with listing pages and lead
capture. We do not, and I would not.

It is a different product bolted on, and doing it badly is worse than
not doing it. Worth knowing they will raise it in a comparison.

### The small one that stings

They send reminders for **client birthdays and visa renewals.**

Visa renewal is a genuinely clever piece of local thinking — a resident
whose visa is up for renewal is a resident deciding whether to buy or
keep renting, and that is a real trigger. We do not have it and it is
about a day's work.

---

## What we have that they do not

No evidence on their site or in any listing of:

| | |
|---|---|
| **AML, KYC, sanctions screening, REAR reporting** | Every UAE brokerage is a DNFBP. Nobody in this market is building for it |
| **Trakheesi permit blocking and expiry** | We refuse to publish without one |
| **The seller side** — vendors, offers, negotiation history | Their product is buyer-first, like ours was until two days ago |
| **Deal progression to DLD transfer** | Planned backwards from the Form F date |
| **Commission with tiered splits** | |
| **Reply from the lock screen** | Five seconds against their app's eleven |
| **An offline queue that timestamps at creation** | |
| **An append-only audit log** | Revoked at the database, not by policy |
| **72-hour support access you grant and revoke** | |

---

## The difference that is not a feature

**Kendal's site names Betterhomes, Prime Capital and Chestertons as
customers.**

Betterhomes is one of the largest brokerages in the country. That is not
marketing — that is a reference a brokerage owner will ring.

We have nobody, and no amount of what is in the table above closes that.
It is the same finding as every review in this project and it has not
changed: **the product is not the constraint.**

---

## Honest verdict before deployment

**On compliance and the transaction, we are ahead and it is not close.**
On lead capture breadth they are ahead, and the Meta gap is the one that
would lose us a deal in a live comparison.

**Build the Meta lead ads ingest before launch.** Everything else on
this list is a conversation; that one is a channel we are blind to.

Then ring Betterhomes' competitors.
