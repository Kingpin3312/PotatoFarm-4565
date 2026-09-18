# Phase 2 — Design System
### PotatoFarm.ai — 28 July 2026

---

## Before anything else: two straight answers

**On "exact".** I can't read rendered CSS from where I sit — I can fetch a page's markup, but not the computed styles a browser resolves at runtime. So I can either give you values I've derived and labelled honestly, or you spend thirty seconds getting me the real ones. The second option is in section 1 and it's genuinely thirty seconds. Once you paste that back, every token in this document locks to the actual figure and I never guess again.

**On the name.** PotatoFarm.ai is memorable, and memorable is worth a lot. It also has to survive a brokerage owner reading it on a proposal before he's met you. If you've already tested it on a few of them and it landed, ignore me and we build it. If you haven't, that's a cheap test worth running this week — you're asking someone to route their entire client database through it. I'll proceed with PotatoFarm.ai either way; just say the word if it changes.

**One more, and then I'll stop.** You're pitching the same buyers, in the same market, that Kendal pitches. If the palette, the type and the layout all match theirs exactly, a brokerage owner who sat through a Kendal demo last month will notice, and he'll say so in the room. Matching their *quality* is the goal. Matching their *fingerprint* hands them the comparison. My recommendation is section 4: same discipline, same dark premium territory, shifted enough that it's yours. Your call, and I've built the system so either version is a one-file change.

---

## 1. Locking the exact values — thirty seconds

Open kendal.ai in Chrome. Right-click, Inspect, Console tab. Paste this and hit enter, then paste the result back to me.

```js
const g = (el, p) => getComputedStyle(el)[p];
const h1 = document.querySelector('h1');
const p  = document.querySelector('p');
const btn = document.querySelector('a[href*="home-form"]');

console.log(JSON.stringify({
  pageBackground: g(document.body, 'backgroundColor'),
  bodyText:       g(document.body, 'color'),
  bodyFont:       g(document.body, 'fontFamily'),
  headingFont:    h1 && g(h1, 'fontFamily'),
  h1: h1 && {
    size: g(h1,'fontSize'), weight: g(h1,'fontWeight'),
    tracking: g(h1,'letterSpacing'), leading: g(h1,'lineHeight'),
    colour: g(h1,'color')
  },
  paragraph: p && {
    size: g(p,'fontSize'), weight: g(p,'fontWeight'),
    leading: g(p,'lineHeight'), colour: g(p,'color')
  },
  button: btn && {
    bg: g(btn,'backgroundColor'), colour: g(btn,'color'),
    radius: g(btn,'borderRadius'), padding: g(btn,'padding'),
    size: g(btn,'fontSize'), weight: g(btn,'fontWeight')
  },
  loadedFonts: [...new Set([...document.fonts].map(f => `${f.family} ${f.weight} ${f.style}`))]
}, null, 2));
```

If you'd rather not, a full-page screenshot of the homepage at desktop width gets me about ninety percent of the way there. Either works.

---

## 2. Fonts

I'm not going to name a typeface I haven't verified — that's the one thing on this project you'd catch me on, and there are half a dozen geometric sans faces that look near-identical in a screenshot. The console output above returns the family name and every loaded weight, and that's the answer.

What I can tell you from the markup is how the type is *used*, and that transfers regardless of which face it turns out to be:

- One family throughout. No secondary display face, no serif accent.
- Display sizes run tight — negative tracking, leading close to 1.0.
- Headlines set in sentence case, closed with a full stop. That full stop is doing real work; it makes a claim sound like a fact rather than a slogan.
- Body text sits at a noticeably lighter weight and a muted tone against the background, giving heavy contrast between the two levels.
- Eyebrow labels are small, uppercase, wide-tracked, muted. They're the only place tracking goes positive.

**Licensing.** Once we know the face, we check it. If it's a commercial licence — Satoshi, General Sans, PP Neue Montreal and similar all are — you buy the web licence for potatofarm.io. It's usually a couple of hundred dollars and it's the kind of thing that surfaces later at the worst possible moment. If it's a Google font, no issue.

**Loading.** Self-hosted, subset, `next/font` with `display: swap`, preloaded. No render-blocking third-party font request. This is worth about half a second of LCP on its own.

---

## 3. Token architecture

Everything below lives in one file — `src/styles/tokens.css` — exposed as CSS custom properties and mapped into Tailwind's theme. Nothing hardcodes a colour or a size anywhere else in the codebase. That's what makes the "match them exactly / shift it to yours" decision a single-file change rather than a three-day refactor.

```
tokens.css
├── colour       surface, content, brand, state, border
├── type         family, scale, weight, tracking, leading
├── space        4pt base, 12 steps
├── radius       6 steps
├── shadow       4 steps + 2 glow
├── motion       duration, easing
└── layout       container, gutter, breakpoints
```

Semantic naming, not literal. `--surface-raised`, not `--grey-900`. When you change the palette, the names still make sense.

### Colour — derived, pending confirmation

These are read from the design language, not from the stylesheet. The console paste replaces the first two immediately and I calibrate the rest from those.

| Token | Role | Status |
|---|---|---|
| `--surface-base` | Page background, near-black | derived — confirm |
| `--surface-raised` | Card fill, a step above base | derived — confirm |
| `--surface-glass` | Translucent card over glow, with backdrop blur | derived — confirm |
| `--content-primary` | Headlines, near-white | derived — confirm |
| `--content-secondary` | Body copy, muted | derived — confirm |
| `--content-tertiary` | Eyebrows, captions | derived — confirm |
| `--brand-primary` | CTA fill, active states | **confirm** |
| `--brand-glow-a/b` | The two gradient orb stops | **confirm** |
| `--border-subtle` | Card and input hairlines | derived |
| `--state-success/error` | Form feedback | new — not on their site |

Two notes on this. First, their glow effects are decorative PNGs sitting behind sections, not CSS. We rebuild them as real gradients — same look, a fraction of the weight, and they can animate. Second, `--content-secondary` on `--surface-base` is where dark sites usually fail WCAG AA. I'll measure it and lift it if it fails. That's the one place I'll deviate from an exact match without asking, because failing contrast is a defect, not a style choice.

### Type scale

Fluid, `clamp()`-based, so it moves with the viewport instead of jumping at breakpoints.

| Token | Use | Mobile → Desktop |
|---|---|---|
| `display-lg` | Hero H1 | 40 → 76 |
| `display-md` | Section headings | 32 → 52 |
| `display-sm` | Card headings | 24 → 32 |
| `body-lg` | Hero subhead, section intros | 17 → 20 |
| `body-md` | Default | 15 → 17 |
| `body-sm` | Card body, captions | 14 → 15 |
| `label` | Eyebrows, badges, buttons | 12 → 13 |

Three weights only: regular, medium, semibold. Locking it to three is what stops a design system drifting six months in.

**Fixing what's broken on their site.** Their section headings, card headings and feature headings sit too close in size, which is why the benefits grid reads as texture rather than as six separate arguments. The scale above opens that gap deliberately. And headings map to `h1`–`h4` by *structure*, never by size — the styling comes from the token, so we never end up with an `h6` on a testimonial quote the way they have.

### Space, radius, shadow

**Space** — 4pt base. 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160, 200. Section padding uses the top four so vertical rhythm is consistent by default rather than by discipline.

**Radius** — 6, 10, 14, 20, 28, full. Cards sit at 20, inputs at 10, buttons and badges at full.

**Shadow** — dark UI doesn't take drop shadows well, so elevation comes from surface lift plus a hairline border, with shadow used only on hover and on floating elements. Two glow tokens handle the coloured ambient light.

### Motion

| Token | Value | Use |
|---|---|---|
| `--dur-instant` | 120ms | Button press, checkbox |
| `--dur-fast` | 200ms | Hover, focus ring |
| `--dur-base` | 320ms | Card lift, accordion |
| `--dur-slow` | 600ms | Scroll reveal |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` | Almost everything |
| `--ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | Counters, badges |

Rules I'll hold to: nothing animates on load above the fold except the hero, because that's LCP. Scroll reveals fire once and never replay. Every animation respects `prefers-reduced-motion` — which their site doesn't, and which is a straight WCAG failure. Marquees pause on hover and on focus.

---

## 4. The one decision I need from you

**Option A — exact match.** Same background, same brand colour, same type, same everything. Fastest to build. The risk is the one in the preamble.

**Option B — same discipline, your fingerprint.** Identical structure, spacing, motion and quality. Different brand colour and glow pair, a slightly warmer or cooler black, and a type scale with more hierarchy. Costs nothing extra — it's the same build, different token values — and it means nobody puts your deck next to Kendal's and sees the resemblance.

I'd build B. But you know your buyers and I don't, so tell me which and Phase 3 goes ahead on it.

---

## 5. Component inventory

Twenty-eight components, everything on the site composed from them. Each ships with props, variants, states, and a story.

**Primitives** — Button (4 variants × 3 sizes), Link, Input, Select, Textarea, Checkbox, Badge, Icon, Avatar, Divider

**Composites** — Card (surface / glass / bordered), FeatureCard, BenefitCard, StatCard, TestimonialCard, PricingCard, EpisodeCard, PostCard, LogoRail, Marquee, Accordion, Tabs

**Layout** — Container, Section, Grid, Stack, StickyHeader, MobileMenu, Footer

**Motion** — Reveal, Counter, TextReveal, Parallax, ScrollProgress

Every one keyboard-operable with a visible focus ring, every interactive element at 44px minimum touch target, every icon either labelled or marked decorative.

---

## 6. Site architecture — PotatoFarm.ai

Built for one job: getting a brokerage owner to a conversation.

```
/                    Home
/product             What it does — the page Kendal doesn't have
/pricing             With actual numbers on it
/integrations        Portals, WhatsApp, CRMs
/security            Where their client data lives — the trust page
/customers           Named brokerages, real numbers
/about               Team, story
/blog                Market content
/blog/[slug]
/demo                Booking
/legal/privacy
/legal/terms
```

Three deliberate departures from Kendal:

**Pricing is published.** A brokerage owner who can't find a price and doesn't want a call yet leaves and doesn't come back. Even a "from AED X per user" band keeps him on the site. This is the single biggest conversion difference between your site and theirs.

**A second, lighter CTA.** "Book a call" is a big ask from a cold visitor. For a WhatsApp-native product the obvious lighter option is to let him message the bot himself from the homepage and watch it qualify him in real time. It's the product demonstrating itself, it costs him nothing, and it's a far better story in a pitch than a screenshot.

**A security page.** You're asking a brokerage to hand over its client database. Kendal has nothing addressing that anywhere on their site. It's the easiest trust gap on the market to close.

---

## What Phase 3 gives you

Wireframes for all eleven pages at three breakpoints, section by section, with the copy hierarchy in place — so you can see the argument each page makes before a single component is styled.

I need two things to start it: the console output (or the screenshot), and A or B.
