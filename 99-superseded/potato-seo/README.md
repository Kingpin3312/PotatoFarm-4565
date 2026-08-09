# Phase 10 — SEO

## One correction to the brief, and it matters

You asked for FAQ schema. It's built and shipped, but not for the reason
the brief assumed.

**Google retired FAQ rich results on 7 May 2026.** The expandable
question-and-answer dropdown under a listing is gone for every site. The
Search Console report goes in June and the API data in August. There was
no blog post — just a deprecation note added to the developer
documentation.

What that changes:

- FAQPage is still valid markup and still worth shipping. Bing, Perplexity
  and the AI crawlers all still parse it. Google has confirmed unused
  structured data causes no problems.
- It is no longer a lever on how your result *looks* in Google. If anyone
  sells you FAQ schema as a traffic tactic this year, they haven't read the
  documentation.
- **The writing standard has changed.** Answers built for Google's
  accordion were 30 words and telegraphic. Answers built to be quoted by a
  model do better at 80 to 150 words with context and real figures. Our FAQ
  copy is written to the second standard, and that's the version worth
  having now.

## What's implemented

**Metadata** — one builder for every page. Canonical, Open Graph and
Twitter tags all derive from the same three fields, so they can't drift.
The usual failure is someone updating a title and forgetting the OG tag,
and the page then shares under last quarter's headline.

**Structured data**, server-rendered into the HTML:

| Schema | Where |
|---|---|
| Organization + WebSite | Every page |
| SoftwareApplication | Pricing |
| FAQPage | Anywhere with a real accordion |
| BreadcrumbList | Articles, mirroring the visible trail |
| Article | Blog posts |

**Sitemap** — generated from the CMS, not hand-maintained. A written
sitemap goes stale the first time somebody publishes and nobody notices.

**Robots** — AI crawlers get their own explicit entry rather than falling
out of a wildcard. They're allowed on purpose: being quoted by an assistant
is a real channel for a product like this. One line to reverse if you
disagree.

## Three decisions worth knowing about

**No Offer schema on the pricing page yet.** An offer with a blank price
is worse than no offer — it marks the page as incomplete rather than
silent. It switches on automatically the moment a real price is entered
in the CMS.

**Breadcrumb schema mirrors the visible breadcrumb exactly.** Inventing a
trail the user can't see is the kind of thing that earns a manual action.

**JSON-LD is escaped before it renders.** The content comes from an
editor, and a stray character in a testimonial could otherwise close the
script tag early. That's an XSS hole and an easy one to leave open.

## Fixed on the static build

- Unique meta description on all eleven pages, every one between 70 and
  160 characters. Kendal runs the same description across five pages.
- Canonical on every page.
- `robots.txt` and `sitemap.xml`.
- All JSON-LD validated as parsing cleanly.

## Before launch

- Replace the placeholder `@potatoai` handle, or remove the Twitter tags.
  A card pointing at a non-existent account is worse than no card.
- Produce a real 1200 × 630 share image. This is the single highest-return
  asset on the site — it's what people see when your link gets forwarded on
  WhatsApp, which for this market is most of them.
- Verify the domain in Search Console and Bing Webmaster Tools, and submit
  the sitemap to both.
