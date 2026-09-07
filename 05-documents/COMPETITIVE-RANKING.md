# Ranking PotatoFarm against the field

Five products, and they are not all the same kind of thing. Two of them
you cannot lose a customer to.

---

## First, who is actually a competitor

| | What it is | Competes with us? |
|---|---|---|
| **PropSpace** | UAE brokerage CRM, since 2012 | **Yes — directly, and it is the real one** |
| **Goyzer** | UAE property management platform, with a CRM attached | **Partly — see below** |
| **Kendal.ai** | AI-first UAE brokerage CRM | **Yes** |
| **Reapit** | Enterprise agency software, UK / Ireland / Australia / Denmark | **No UAE presence found** |
| **S.MPLE** | SERHANT's internal agent service | **No — you cannot buy it** |
| **PotatoFarm** | WhatsApp lead response, UAE | — |

**S.MPLE is free to SERHANT agents and available only to SERHANT
agents.** It is a recruiting weapon for their brokerage. You cannot lose
a deal to it in Dubai.

**Reapit sells in the UK, Ireland, Australia and Denmark.** Twenty-five
years, enterprise-grade, and no evidence of a UAE operation. If a Dubai
brokerage mentions it, they are describing something they read, not
something they were quoted.

**That leaves three real competitors. PropSpace is the one that matters
most; Goyzer matters if the brokerage also does rentals.**

---

## The overall ranking

### 1. PropSpace

Fourteen years in this exact market. **4.9 stars across 164 Google
reviews.** Owned by Property Finder from 2018 to 2024, now
founder-owned.

Direct Property Finder API rather than a delayed XML feed. 80+ portal
syndication. RERA Forms A, B, F and I generated inside the CRM. Ejari
documents. Trakheesi validation. Off-plan inventory. A full property
management module for rentals. iOS and Android apps. A public API. Data
migration services. No setup fee.

**They have the market, the integrations, the compliance paperwork and
the reviews.** This is the incumbent and there is no honest reading
where we are ahead of them today.

### 2. Goyzer

UAE-based, Dubai, AI-positioned, and shipping four separate apps: a
property management app, a mobile app for tenants and landlords, an
on-site inspection app, and — **in their own words** — *"a lightweight
CRM for agents"*.

**That phrase is the whole assessment.** Goyzer's centre of gravity is
property management: leases, landlords, tenants, move-in and move-out
inspections, owner portals, accounting. The brokerage CRM is the
secondary product, and they say so themselves.

Their iOS CRM app has been live since 2020. Established, real customers,
genuinely strong on the rentals side.

**For a brokerage that only does sales, Goyzer is a heavier tool than
they need.** For one that also manages a rental portfolio, it is a
serious answer and PotatoFarm does not compete at all — we have no
tenancy model.

### 3. Kendal.ai

Named customers a Dubai principal recognises: **Betterhomes, Prime
Capital, Chestertons.** AI-first positioning, and now an agent-side
blackbook product. Weaker on the paperwork than PropSpace, stronger on
the AI story.

### 4. Reapit

Genuinely excellent software, in four countries that are not this one.
Ranked third because it would be a serious competitor if it arrived, not
because it is here.

### 5. PotatoFarm

Fifth of six, and the gap to fourth is large.

### 6. S.MPLE

Last only because it is not for sale in this market. On product quality
it would rank higher; on relevance to a Dubai brokerage it is a
non-event.

---

## Where we actually stand, by dimension

| | PotatoFarm | Best in field |
|---|---|---|
| **Customers** | **Zero** | PropSpace, 14 years |
| **Has ever run** | **Never compiled** | All four |
| Portal integrations | Bayut + Meta lead ads | PropSpace, 80+ |
| Property Finder | Feed only | PropSpace, direct API |
| RERA forms A/B/F/I | **No** | PropSpace |
| Ejari / rentals | **No tenancy model at all** | PropSpace |
| Off-plan inventory | **No** | PropSpace |
| Trakheesi permits | Yes, 12 files | PropSpace |
| AML / KYC screening | **Yes — 11 files** | **Us** |
| WhatsApp assistant | **Yes, with stop controls** | **Us** |
| Vendor side + weekly reports | **Yes** | **Us** |
| Voice → deliverable | **Yes** | S.MPLE (staffed) |
| Mobile app | Shell, 20 files, unverified | PropSpace and Goyzer, both stores |
| Tenant / landlord portal | **No** | Goyzer |
| Inspection app (move in/out) | **No** | Goyzer |
| Owner accounting | **No** | Goyzer |

### Where we are genuinely first

Three things, and they are narrow but real:

**1. AML and compliance depth.** Screening, a compliance officer's
queue, tipping-off protection enforced by a build check, five-year
retention that defers erasure. No competitor advertises this. Every UAE
brokerage concluding a sale is a DNFBP and this is a firm obligation
they currently meet in spreadsheets.

**2. The WhatsApp reply window, handled properly.** Outside 24 hours a
normal message is accepted by Meta and never delivered. We compute it
before every send and refuse with an explanation. This is the thing
generic CRMs get wrong silently.

**3. Voice → deliverable without a human in the loop.** S.MPLE proves
agents want it; theirs needs an advisor and takes hours. Ours is
seconds, and states its own uncertainty instead of guessing.

### Where we are last, and it is not close

**Zero customers. Never compiled. No database has ever existed.**

PropSpace has 164 reviews. We have a codebase that has never been run
by anybody.

---

## The honest summary

**On paper, on a feature-by-feature comparison in AML, WhatsApp
handling and the vendor side, we are ahead of everyone.**

**In the market, we are fifth of six, because every one of them ships
and we have never compiled.**

The three narrow strengths are real and worth pitching — but they are
claims about code nobody has run. A principal who asks "who else uses
this?" ends the meeting, and that question comes in the first five
minutes.

### What would change the ranking

1. **Compile it, run a migration, send one message.** Until then every
   comparison above is theoretical.
2. **One pilot brokerage.** One named customer moves this from fifth to
   arguable.
3. **Do not chase PropSpace's or Goyzer's feature list.** Off-plan inventory, Ejari
   and a rentals module are years of work against a fourteen-year
   incumbent. Sell the three things they do not have.

The pitch against PropSpace is not "we do more". It is: *"They will run
your listings and your paperwork. We answer the enquiry at eleven at
night, and we keep the compliance file an inspector will ask for."*

Against Goyzer it is shorter, because they have already conceded it:
**their CRM is, in their own words, lightweight.** A brokerage that
mainly does sales is buying a property management platform to get a
sales tool.

---

## One thing this comparison exposed in our own product

The import screen tells a brokerage it can read a **Goyzer** or
**PropSpace** export. **No vendor-specific parsing exists.** The only
mention of a competitor in the migration code is a comment noting that
Reapit's six-week onboarding is people rather than tooling.

The screen also renders four fields — `detectedSource`, `columns`,
`rows`, `willSkip` — that `migration.inspect` never returns. It returns
`counted: { contacts, deals }` and nothing else.

**This is exactly the kind of claim that ends a pilot in week one.**

**Now fixed.** The screen was cut back to what the router provides, and
the vendor names are gone — it asks for "a CSV export from your current
system" instead. What `inspect` actually returns turned out to be better
than the invention: grouped issues with severities and example rows, so
a brokerage can go and look at the records that will not come across.
