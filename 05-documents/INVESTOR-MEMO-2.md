# Second pass — the things the first memo missed

The first memo found a scope problem. This one goes at gross margin,
distribution and the pricing model, and one of the three findings is
better news than expected.

---

## 1. The good news I got wrong by not checking

I assumed WhatsApp messaging was a meaningful cost of goods. **It is
close to zero for the core product.**

Meta charges per delivered *template* — a message that opens or re-opens
a conversation. Replies inside the 24-hour window a customer opened are
**free**. This product's entire value proposition is answering an inbound
enquiry within seconds, which happens inside that window every time.

Better: leads arriving from a Click-to-WhatsApp ad are free for 72
hours. **The Meta lead-ads channel that was just built is the cheapest
one to serve**, not the most expensive. That is an unusually good
alignment between the growth channel and the cost base and neither of us
had noticed it.

Modelled properly, gross margin at a typical firm is **86%**. At a quiet
one, 94%. That is a proper software margin, and my first memo was wrong
to worry about it without checking.

---

## 2. The pricing model is misaligned with both the cost and the value

Here is what falls out of the same model:

| | Agents | Leads/mo | Revenue | Gross margin |
|---|---|---|---|---|
| Quiet firm | 18 | 300 | $1,260 | **94%** |
| Typical | 18 | 1,200 | $1,260 | **86%** |
| Lead-heavy | 8 | 3,000 | $560 | **30%** |

**Per-seat pricing charges by headcount and delivers value by
conversation.** Those two numbers are not correlated in this market.

An eight-agent firm running heavy portal and Meta spend pays $560 a
month, consumes more inference than a forty-agent firm paying $2,800,
and receives vastly more value than either. You are simultaneously
under-charging your best customers and over-charging your quietest ones.

**It also breaks the story.** The pitch is *"we answer every enquiry in
seconds"* — the unit of value is an enquiry answered. The invoice counts
desks.

I am not arguing for pure usage pricing; brokerages hate unpredictable
bills and per-seat is easier to sell. **A seat floor plus a conversation
band** keeps the predictability and fixes the alignment, and it is a
schema change, not a rewrite. The billing engine already computes
seat-days exactly; it has no concept of a conversation at all.

This is the single highest-leverage change available before the first
customer signs, because **repricing existing customers later is the
hardest thing a young company does.**

---

## 3. The competitive threat is not Kendal. It is Property Finder.

The first memo compared features against Kendal, Goyzer and Reapit. That
was the wrong axis.

**The portals own the lead flow.** Property Finder, Bayut and Dubizzle
generate the enquiries this product exists to answer, they have the
billing relationship with every brokerage in the country, and they have
the distribution to ship an auto-responder to all of them in one release.

If Property Finder bundles a competent WhatsApp auto-reply into their
existing subscription — free, on by default — a large part of this
product's headline value evaporates for most of the market on the day
they announce it.

**What survives that release is the half you built in the last week:**
the vendor side, offers with negotiation history, deal progression to
DLD transfer, commission, and the AML file. A portal will not build
compliance infrastructure for brokerages; it is not their business and
it carries liability they do not want.

**So the strategic answer is to lead with the transaction and the
compliance, and treat fast replies as the wedge rather than the product.**
That is a positioning decision, and today the homepage does the opposite —
it leads entirely with reply speed, which is the part most exposed to
being commoditised by an incumbent with distribution.

---

## 4. The structural point about the moat

Tenant isolation is enforced at the database, which is right for
compliance and correct engineering. It also means **there is no data
network effect.** The matching engine does not get cleverer as customers
are added; the hundredth brokerage's assistant is exactly as good as the
first's.

Not a flaw — the alternative is training on customers' client lists,
which would be indefensible in this market. But it means the moat is
domain depth and switching cost, not accumulating data, and those decay
differently. Domain depth can be copied by anyone willing to do the same
homework. **Switching cost is the one that compounds, and switching cost
comes from being the system of record for the transaction** — which is
argument three again, from another direction.

---

## Where I land, second time

The margin question resolved better than I feared. The scope question
from the first memo stands. Two new ones matter more than anything on
the feature roadmap:

1. **Reprice before the first customer**, to a seat floor plus a
   conversation band.
2. **Reposition around the transaction**, not around reply speed, because
   reply speed is the part a portal can give away.

Do those two and the third question — Saudi, or an adjacent vertical —
becomes a much easier conversation, because you would be selling
something a platform incumbent structurally will not build.
