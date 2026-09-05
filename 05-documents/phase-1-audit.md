# Phase 1 — Site Audit
### kendal.ai, reviewed 28 July 2026

**Method.** Every public page was fetched and read at source level: markup, heading order, link targets, meta tags, asset URLs and form structure. Findings marked *(live test)* need a browser session to confirm — anything to do with rendered CSS values, animation timing and real Lighthouse numbers can't be measured from source alone. I'd rather flag those than guess at them.

**Headline.** The site sells well. It also has a handful of faults that are costing conversions right now, and two of them are the sort a prospective client notices before they notice the product.

---

## 1. Site Map

### Primary navigation
| Path | Title | Notes |
|---|---|---|
| `/` | Home | Long-form marketing page, ~14 sections |
| `/about` | Meet The Team | Team grid + press logos |
| `/plans` | Plans & Subscriptions | Three tiers, no prices |
| `/contact` | Book A Demo | Form + FAQ + waitlist |
| `/blog` | Knowledge Centre | 18 posts listed |
| `/blog/[slug]` | Article | CMS collection |

### Utility & legal
| Path | Notes |
|---|---|
| `/terms-and-conditions` | Footer only |
| `/privacypolicy` | Footer only. Non-standard slug — no hyphens, breaks the site's own URL convention |
| `app.kendal.ai` | External product login |

### Orphaned
| Path | Notes |
|---|---|
| `/therealones` | Podcast page. Reachable only from a small unlabelled link in the homepage podcast block |

### Navigation hierarchy
Flat. One level, six items, plus a demo CTA and a login. That flatness is a strength — nothing is buried — but it means the homepage carries the entire product story on its own, and there's no room to grow into feature pages, industries, or case studies without a restructure.

**In-page anchors:** `#home-form`, `#home-contact`, `#faq`. The footer FAQ link resolves to `/#faq`, which sends anyone on `/plans` or `/contact` back to the homepage even though both pages already have the same FAQ block on them.

### Gaps
No `/features`, no per-feature pages, no `/integrations`, no `/security`, no case studies, no changelog, no careers, no docs or help centre, no status page, no sitemap page. For a product sold on integrations and trust, the absence of a security page and an integrations page is the largest structural gap.

---

## 2. Feature Audit

**Navigation** — sticky header, logo left, six links centre, demo CTA plus login right. Mobile collapses to a menu. Same header across every page except the podcast page, which runs a different one entirely.

**Hero** — eyebrow pill ("AI-Powered CRM"), H1, supporting paragraph, single CTA to the in-page form, layered product screenshots and a glow backdrop.

**Logo rail** — eight partner/client logos in a continuous horizontal marquee, duplicated in the DOM to make the loop seamless.

**Feature blocks** — a two-up bento pair (WhatsApp assistant, voice control), then a full-width "all in one suite" block, then a six-card benefits grid, then a three-card extras grid.

**Capability chips** — a second marquee of small labelled pills: secure, lead nurturing, real-time updates, team collaboration, multilingual, AI assistant, easy to use. The two loop passes carry different labels, so "lead nurturing" and "risk advisor" both appear. Almost certainly unintentional.

**Testimonials** — three quotes, marquee carousel, each with name and job title.

**Stats** — six figures: 1M+ leads, 4.7 rating, 80% less workload, 24/7 engagement, 50% faster deals, 10x productivity.

**Waitlist block** — "AI Workforce Coming Soon" with a background video and a join-the-waitlist button.

**Podcast** — six episode cards linking straight out to YouTube, plus Spotify and YouTube channel buttons.

**FAQ** — four accordion questions. Answers are not in the served HTML; they render client-side.

**Callback form** — name, WhatsApp number, number of brokers, role dropdown, submit. Appears on home and contact.

**Footer** — brand blurb, Company column, Support column, three social links, copyright.

**Plans page** — three tiers with five bullets each, all pointing at `/contact`. No prices. No comparison table. No toggle.

**Blog** — 18 posts, category label and date per card. No filtering, no search, no pagination, no author, no reading time.

**Analytics** — Google Tag Manager (`GTM-PD5NJ6JD`). No visible consent banner.

**Not present:** pricing figures, integrations directory, ROI calculator, product tour, comparison table, video testimonials, case studies, live chat, search, dark/light toggle, command palette.

---

## 3. UX Audit

### What's working
The core promise lands in the first five seconds. The headline argues a position rather than describing a product, which is the right instinct. WhatsApp-first is a genuinely strong wedge for Gulf real estate and the site leads with it. The benefits grid is specific — named portals, named actions — rather than the usual vague SaaS abstraction. Section rhythm is consistent and the page never feels cluttered.

### What isn't
**The stats contradict each other.** The homepage claims over a million leads qualified. The plans page claims more than fifty thousand. Both are live, one page apart. Anyone comparing vendors will spot it, and the moment they do, every other number on the site becomes suspect. This is the single most damaging issue on the site and it takes ten minutes to fix.

**The contact page footer is an unfinished template.** It carries a "Debt Management" link, a link literally labelled "404", and three social icons pointing at a stranger's Twitter account and at Framer's own Instagram and YouTube channels. This sits directly underneath the form where a brokerage owner is deciding whether to hand over their phone number. It reads as abandoned, and it is on the highest-intent page on the site.

**The podcast page is from a previous life.** Different header, different footer, nav links that all dump you back on the homepage, a "Terms and Conditions" link that opens the privacy policy, and a copyright line crediting a different company altogether. It's indexed and reachable.

**Placeholder copy shipped to production.** The about page carries an unfinished sentence about connecting your favourite tools — twice, under two different headings. It's leftover template text.

**No prices anywhere.** Three tiers, fifteen features, zero pricing signals. Not even "from" pricing or a band. Every visitor who wants to know what it costs has to fill in a form and wait for a callback. A large share won't. Competitors that publish a starting price win those visitors by default.

**The form asks for a WhatsApp number and no email.** That's coherent with the product, but it means there is no way to nurture anyone who isn't ready to talk, no lead magnet, no newsletter, no sequence. Every visitor is either a phone call or nothing.

**Single conversion path.** Almost every CTA on the site — hero, feature cards, benefit cards, waitlist, podcast — goes to the same form. Book a call is a high-commitment ask. There's no lighter option: no self-serve trial, no interactive demo, no "see it work" video, no WhatsApp-yourself-a-demo, which for this product would be the obvious and most on-brand micro-conversion available.

**Anchor targets are inconsistent.** Two benefit cards point at `#home-contact`, four point at `#home-form`. If both anchors don't exist on the homepage, some cards silently do nothing.

**Testimonials carry no weight.** Three quotes, all using the same generic avatar placeholder, no photos, no company names, no logos, no results. Two of the three are soft ("lots of potential here" is faint praise). For a product asking a brokerage to route its lead flow through it, this is thin.

**Trust signals are missing entirely.** No security or data-handling section, no WhatsApp Business Platform partner status, no compliance statement, no uptime commitment, no customer count, no named logos in the testimonial block. Brokerages are handing over their client database. Nothing on the site addresses that.

**The podcast sends people away.** Six cards, all outbound to YouTube. It's good brand content leaking traffic at the point of highest engagement, with no episode pages capturing the search value.

**Blog hygiene.** Category labels are inconsistently cased and some aren't categories at all. Two separate cards resolve to the same URL under different headlines. No filtering or pagination across 18 posts, and the meta description contains a spelling error.

### Drop-off points, ranked
1. Contact page footer — visible damage at the moment of decision
2. Plans page — no price, no way forward but a form
3. Hero CTA — one high-commitment option, no lighter alternative
4. Stats section — the contradiction, if noticed
5. Podcast section — deliberate exit to YouTube
6. FAQ — four questions, none of which address price, contract length, data security or migration

### Fixes with the highest return
Publish pricing or a starting band. Add a second, lower-friction CTA — a WhatsApp demo is the natural fit and matches the product. Rebuild testimonials around named brokerages with numbers attached. Add a security and data section. Reconcile the stats. Repair the two broken pages.

---

## 4. Visual Audit

The site is built in Framer. That shapes almost everything below, and it explains several of the technical findings in section 5.

### Observed design language
**Aesthetic** — dark-first, near-black canvas, no light theme. Soft coloured glow assets sit behind sections as decorative PNGs rather than CSS gradients; the same two or three orb images are reused across every page.

**Typography** — a geometric sans throughout, tight tracking on display sizes, generous weight contrast between headline and body. Headlines run long and set in sentence case with full stops, which gives the copy a declarative tone. Eyebrow labels are set small, uppercase, wide-tracked, in a muted tone.

**Layout** — single centred container, generous vertical rhythm, sections separated by large uniform gaps. Content alternates between full-width statements and two- or three-column grids. Bento-style cards of unequal size in the feature area.

**Components** — heavily rounded cards, subtle borders, translucent surfaces with blur behind them over the glow layers. Pill buttons and pill badges. Icons are flat single-colour SVGs at 24–32px. Two horizontal marquees (logos, capability chips) as the main motion device.

**Motion** — marquee loops, accordion expansion, scroll-triggered section reveals, background video in the waitlist block. Restrained rather than showy, which suits the price point.

### To confirm in a live pass *(live test)*
Exact font families and the full type scale; precise colour tokens and gradient stops; container widths and breakpoints; corner radius scale; shadow and blur values; hover and focus treatments; transition durations and easing curves. I don't want to publish numbers I've inferred rather than measured — I'll capture the real values and turn them into tokens at the top of Phase 2.

### Visual weaknesses worth fixing in the rebuild
- Type hierarchy flattens in the middle of the page: section headings, card headings and feature headings sit too close in size, so the eye loses its place across the benefits grid.
- Heading levels are used for styling rather than structure — `h5` and `h6` appear on testimonial quotes and stat labels, and team names on the about page aren't headings at all.
- Icon set is inconsistent in weight and grid size (some assets are 32px, others 25px, one is 26px).
- Cards are visually near-identical across three different grids, so the page reads as one long texture rather than a sequence of distinct arguments.
- No light theme, and no reduced-motion handling that I can see. Both matter for accessibility.

---

## 5. Performance, SEO & Accessibility

Real Lighthouse figures need a live run *(live test)*. What follows is what the source predicts, with the reasoning, so nothing here is a guess dressed as a number.

### Predicted performance problems
**Every responsive variant ships in the HTML.** The hero headline appears three times in the served markup. So does the supporting paragraph, every feature description, every testimonial and every footer. Framer renders one copy per breakpoint and hides the rest with CSS. The result is roughly three times the necessary DOM, three times the text nodes, and screen readers that encounter the same heading repeatedly. This is the root cause of most of the weight on the page.

**Images are unoptimised PNG.** Product screenshots are served at their native size — one is 2,691 × 4,036, another 3,341 × 1,207. They're PNGs, not AVIF or WebP, with width and height query parameters rather than a proper responsive source set. The largest of these is almost certainly the LCP element and almost certainly the largest single cost on the page.

**Two background videos.** MP4, on the homepage and the contact page, plus a third instance on the about page. No poster-first strategy visible.

**Layout shift risk** is elevated: marquees, a client-rendered FAQ accordion, and images without a reserved aspect ratio.

**Third-party load** is Google Tag Manager, plus whatever GTM itself injects, which isn't visible from source.

### SEO
- The same meta description is used on home, about, plans, contact and the podcast page. Five pages, one description. Duplicate descriptions get rewritten or ignored by Google.
- The blog's meta description contains a spelling error.
- Open Graph and Twitter card tags are present and correct — this part is done properly.
- Canonical tags are present on all pages.
- No structured data of any kind: no Organization, no Product, no FAQPage, no BreadcrumbList, no Article on blog posts. The FAQ block in particular is leaving rich results on the table.
- FAQ answers aren't in the served HTML, so they aren't indexable at all.
- No breadcrumbs anywhere.
- Multiple H1-level headings per page as a side effect of the breakpoint duplication.
- Two blog cards point at the same URL under different titles.
- The `/privacypolicy` slug breaks the site's own convention.

### Accessibility
- Repeated headings and repeated content from breakpoint duplication will make screen reader navigation genuinely confusing.
- Testimonial avatars, glow assets and decorative images don't appear to be marked decorative.
- Team photo alt text on the about page is wrong and misspelled — several people are described with the wrong gender, and "portrait" is misspelled in every instance.
- Marquees have no pause control, and I can see no reduced-motion handling.
- Heading levels used decoratively break the document outline.
- The role dropdown, form labels and error states need checking against a screen reader *(live test)*.
- Contrast on muted body text over the dark background needs measuring *(live test)*; low-opacity grey on near-black is where these designs usually fail AA.

### Privacy
Google Tag Manager fires with no visible consent mechanism. For a site targeting UK and European buyers as well as the Gulf, that's a live compliance exposure and worth raising with whoever owns the legal side.

---

## 6. What Version 2.0 Does Differently

Carried forward: the dark premium aesthetic, the confident declarative headline voice, WhatsApp as the wedge, the bento feature layout, restrained motion, the podcast as a brand asset.

Fixed at the root: no duplicated markup — one component, real breakpoints. Modern image formats through Next's image pipeline. Real structured data. Correct document outline. Reduced-motion support. Consent handling.

Added: published pricing, a security and data section, an integrations page, a light second CTA built on WhatsApp, testimonials with names, logos and numbers, episode pages that capture the podcast's search value, and a light theme.

Rewritten: all copy, from scratch. Same argument, sharper, shorter, and none of it theirs.

---

## Two things before Phase 2

**One — how close to their palette?** I can match their colours almost exactly, or take the same dark premium territory somewhere with more of its own identity. I'd lean towards the second: right now the site looks like a good Framer template, and the gap between that and looking like Linear or Raycast is mostly in the tokens. Your call, and it's the first decision Phase 2 depends on.

**Two — whose site is this?** The brief reads as a rebuild for a specific business. If it's for a real brand, tell me who and what they sell, and Phase 2 produces a design system and copy for *them* rather than a polished shell I'd have to re-skin later. If it's a portfolio or pitch piece, say so and I'll build it as a demonstrable product in its own right.

Say the word and I'll start Phase 2 — the design system.
