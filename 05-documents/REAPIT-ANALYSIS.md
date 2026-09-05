# Reapit — analysis

That was the name I couldn't find. Reapit, not Repit — and it is a much
more interesting comparison than Goyzer, because Reapit is what a mature
version of this category looks like after twenty-five years.

## What they actually are

Verified from their own site, their press releases and the UK trade
press: roughly 65,000 users across 5,200 offices in the UK and Australia,
over 225,000 tenancies managed. **AgencyCloud** in the UK, **Agentbox**
in Australia, and **Agency Edition** for agencies up to 30 users.

Modules: Sales CRM, Lettings CRM, Property Management, Block Management,
Client Accounts. Plus **AppMarket** with 60+ third-party integrations and
**Foundations**, a developer portal where an agency can build its own apps
and either keep them private or publish them.

Note the market: UK and Australia. **Not the UAE.** They are not who you
lose a Dubai deal to. They are who you learn from.

---

## Four things worth taking

### 1. Task Plans — the best idea in their product

Subscribe a contact to a sequence, and the system prompts at the right
moments to nurture, follow up and re-engage. They call it out as
AgencyCloud-only, which tells you they think it is a differentiator.

**We have nothing like it.** We have notifications, which fire when
something goes wrong. We have no concept of a plan that runs over weeks
because a lead said "we're looking in about six months."

That lead is currently a note, and notes do not do anything. In this
market a meaningful share of enquiries are six to twelve months out, and
the agency that is still politely in touch at month five wins them.

This is the one I would build first, and **our version should be better
than theirs** — because their prompts nudge an agent to do something, and
ours can just do it, in the conversation that is already open.

### 2. Viewing feedback, structured and sent to the vendor

Their mobile app logs client feedback after a viewing. That feedback is
what a landlord or vendor actually wants: not "it went fine" but four
viewings, three said the second bedroom is too small, one made an offer.

We record a viewing outcome. We do not collect the *why*, and we never
send anything to the owner. Vendor communication is the most common
complaint about estate agents anywhere, and it is a gap we can fill in
the channel we already own.

### 3. Listing descriptions, written for them

"Create market-ready property descriptions at the click of a button.
Customise attributes and adjectives to match the way you write."

Cheap, obvious, and entirely on-brand for us — we already run a model
that has been taught a brokerage's tone. Writing a listing description in
that voice is a smaller problem than the one we have already solved.

### 4. They compete on implementation, not only on features

Six-week data migration, a named customer success manager with regular
check-ins, and a learning platform.

That is not software, and it is probably the most copyable thing in this
whole analysis. We have onboarding, and it assumes a brokerage is
starting from nothing. **Every real customer is coming off something
else** — a spreadsheet, PropSpace, Goyzer, a WhatsApp group — and the
migration is what actually decides whether they switch.

Our importer handles listings. It does not handle contacts, history, or
open deals, which is most of what they are frightened of losing.

---

## What I would not copy

**Client Accounts and Block Management.** Regulated client money
handling. Enormous, and a different licence.

**Property management and lettings.** Same conclusion as with Goyzer —
that is the other product, and building it makes us a worse version of
two competitors instead of a better version of one.

**Customisable dashboards.** It sounds generous and it is a tar pit at
our stage. Every user configuring their own view means no two support
calls are about the same screen, and you lose the ability to say "press
the thing at the top" and be right. Opinionated fixed screens are better
until you know what people actually look at, and we do not yet.

**The AppMarket, for now.** See below — this one deserves more than a
line.

---

## Foundations, and the thing you cannot clone

Their real moat is not a feature. It is that they are the system of
record for 5,200 offices with sixty integrations plugged into them.
Switching costs are enormous, and every partner integration deepens them.

You cannot copy that with a marketplace. A marketplace with one customer
and no partners is an empty shop, and building one now would be building
the endgame before the game.

But the **posture** is worth adopting immediately, and it costs almost
nothing:

- Keep the API clean enough to publish. We already have a typed router
  and a tenant boundary that holds — that is most of the work.
- Webhooks outward, not only inward. Right now everything points at us.
- Never build a feature in a way that assumes we are the only thing
  touching the data.

Do that and the marketplace becomes possible in three years. Skip it and
it becomes a rewrite.

---

## Where we actually stand

Against Reapit we are narrower by design, and level or ahead on four
things we have built in the last few days: instant applicant matching,
deal progression milestones, expiring document alerts, and compliance
workflow. Those were the gaps; they are closed.

What Reapit has that we genuinely lack is **Task Plans**, structured
**viewing feedback**, **listing copy**, and a serious **migration story**.

None of those are large. All four are worth doing. I would start with
Task Plans, because a lead who is six months out is currently a note in a
field, and a note does nothing at all.
