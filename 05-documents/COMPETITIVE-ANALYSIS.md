# Competitive analysis — UAE real estate CRM

Written as an independent assessment, not as a sales document. Where I
could not verify something, I have said so rather than filled the gap.

---

## On sourcing, before anything else

**Goyzer** — verified from their own site, their blog, a Microsoft
marketplace listing and third-party review roundups. Founded in Canada in
2015, Dubai office from 2020, positions as an AI real estate CRM for
brokers, developers and property managers, with Arabic and English apps.

**Repit** — **I could not find it.** Three searches across product
directories, UAE CRM roundups and general web returned nothing matching a
real estate CRM by that name. It may be very new, very small, white-label,
or the name may be slightly different from what you have.

I am not going to invent a feature list for a product I cannot find. If
you have a demo login, a brochure or even a screenshot, send it and I will
do this properly. In the meantime I have widened the comparison to the
products that actually turn up against Goyzer in this market — PropSpace,
Retyn, A-One and Behomes — which is more useful anyway, because those are
who you will lose deals to.

---

## What they have that we do not

Grouped by whether it is a gap that matters.

### 1. Commission — the first thing an agent asks about

Retyn markets "Dubai's complex multi-tiered commission structures" and
commission forecasting. Every mature CRM here has it.

**We have nothing.** Not a field. An agent's first question in a demo is
"can I see what I'm owed", and the answer is currently no.

This is the single most damaging gap on the list, because it is the one
that loses the room in the first ten minutes.

### 2. The deal after the handshake

Their pipelines run through to transfer: MOU, Form F, NOC from the
developer, Ejari registration, DLD transfer, Title Deed. Retyn advertises
automated alerts on RERA compliance deadlines.

**Our pipeline ends at "Won."** In this market that is roughly the
halfway point. Deals die between agreement and transfer, and that is
where a brokerage most wants a system chasing paperwork.

### 3. Documents, with expiry

Passport, Emirates ID, visa status, Title Deed, NOC, SPA, Ejari, tenancy
contract. Retyn explicitly sells "retrieve passport copies and visa
status when needed for DLD verification" and alerts when paperwork needs
renewal.

**We have no document storage at all.** We built listing permits and
nothing else.

### 4. AML and KYC — and this one is a legal obligation

Every brokerage concluding a purchase or sale is a **DNFBP** under UAE
AML law. That means, verified against the Ministry of Economy guidance
and the FIU's own requirements:

- Registration on **goAML**, and on the EOCN reporting system
- Customer due diligence on every client, enhanced for non-residents and
  politically exposed persons
- **Screening every customer and beneficial owner** against the UAE Local
  Terrorist List and UN Consolidated List *before* onboarding
- **Real Estate Activity Reports (REAR)** filed when a transaction
  involves **AED 55,000 or more in cash**, single or linked — and for any
  virtual asset settlement regardless of amount
- **Five-year record retention**, even if the deal falls through
- A named compliance officer
- **No tipping off** — telling the client a report was filed is itself an
  offence

**We have none of it**, and neither, as far as I can tell from their
marketing, do most of the CRMs in this market. That makes it
simultaneously the biggest hole in our product and the clearest
opportunity in the category.

Two things follow from that. First, our five-year retention default of
365 days is **wrong for this market** and needs changing. Second, our
privacy erasure needs a carve-out: AML records must survive a
right-to-erasure request, because a statutory retention obligation
overrides it. That is a real conflict in code we have already written.

### 5. Requirement matching

Standard everywhere: capture what a buyer wants, match it against
inventory automatically, alert the agent when something new fits.

We capture budget and intent through the assistant and then do nothing
with it. The qualification data we are proud of currently sits in a
field.

### 6. Lead ownership and duplicate handling

Retyn and A-One both advertise routing by area, property type, language
and availability, plus deduplication. One vendor names duplicate entries
as the main failure mode without smart deduping.

We deduplicate **within** a brokerage on phone number. We have no rules
for *which agent owns a lead*, and no handling of the fight that starts
when two agents both claim one. In a brokerage of twenty agents that
argument happens weekly.

### 7. Arabic and RTL

Goyzer ships Arabic apps. We flagged this ourselves and have not built
it. Our assistant speaks Arabic; our interface does not.

### 8. Property management and leasing

Goyzer does lease management, renewals, maintenance tracking, tenant and
landlord portals, a move-in/move-out inspection app with photos, and
accounting.

This is an entire second product. See below.

---

## What I would not build, and why

An independent view is worth as much for what it rules out.

**Do not build property management, leasing or accounting.** That is
Goyzer's ground, they have twenty years of it, and entering it turns
PotatoFarm into a worse Goyzer. Our wedge is speed of first response on
WhatsApp. Every hour spent on lease renewals is an hour not spent making
that wedge sharper.

**Do not chase portal count.** Retyn advertises 50+ platforms including
Chinese and Russian portals. Three portals that work perfectly beat fifty
that mostly do, and the fifty is a maintenance treadmill.

**Do not build a developer or off-plan ERP.** Different buyer, different
sales cycle, different product.

**Do not build tenant screening.** It is a leasing feature and it drags
you into the previous point.

---

## What to build, in order

### First — because you cannot sell without them

**1. Commission.** Per-agent rates, splits, tiered structures, forecast
against pipeline, and what has actually been paid. Two weeks of work and
it changes the first ten minutes of every demo.

**2. AML and KYC.** Sanctions screening at onboarding, CDD records, the
REAR trigger at AED 55,000 cash, five-year retention, and an audit trail
a Ministry of Economy inspector can read. Also fix the retention default
and the erasure carve-out we have already got wrong.

**3. Deal progression to transfer.** MOU through to Title Deed, with the
documents attached to each stage and deadline alerts. This is where deals
die and where a system earns its keep.

**4. Documents with expiry.** Falls out of 2 and 3 almost for free once
the storage exists.

### Then — because they sharpen the wedge rather than copying anyone

**5. Requirement matching, driven by the assistant.** We already capture
budget, intent and timeframe in conversation. Match that against new
inventory and have the assistant message the buyer *first* — "the 3 bed
you wanted in Marina just came up." Nobody in this market does proactive
outbound matching over WhatsApp, and we are the only ones holding both
halves of it.

**6. KYC document collection over WhatsApp.** Collecting a passport copy
and an Emirates ID is the most tedious part of a Dubai transaction, and
it is currently done by an agent chasing someone on WhatsApp by hand. Our
assistant is already in that conversation. Having it collect, validate
and file the documents into a compliant CDD record turns the worst job in
the brokerage into a background process.

That combination — compliance obligation, handled by the channel we
already own — is the strongest product idea in this analysis. It is
defensible, it is genuinely hard for a broad ERP to copy, and it attaches
us to a legal requirement rather than a preference.

**7. Lead ownership rules.** Round-robin, by area, by language, by
availability, with a clear rule for who owns a returning enquirer and a
visible history when it is disputed.

### Later

Arabic and RTL. Landlord updates over WhatsApp. Agent leaderboards.

---

## The honest summary

Against Goyzer we are narrower, faster in the one thing we do, and
missing four capabilities a brokerage will assume any CRM has. Two of
those — commission and AML — are not features, they are the price of
being taken seriously, and one of them is the law.

The good news is that the AML gap is a category-wide blind spot. Fixing
it properly, and having the assistant do the collection over WhatsApp,
would give PotatoFarm a claim nobody else in this market is currently making.

Still unresolved: send me anything you have on Repit and I will do that
half properly.
