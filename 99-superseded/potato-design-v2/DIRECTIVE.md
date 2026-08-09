# Design directive — PotatoFarm v2

To the team. Read this before you touch a file.

The brief is to make the site feel like Apple's. I'm accepting the brief
and rejecting two parts of it, and I want the reasoning in writing so
nobody relitigates it in week three.

---

## What we are not doing

### 1. We are not using SF Pro

Apple licenses SF Pro for **mock-ups of interfaces running on Apple
platforms.** A marketing website for a UAE property CRM is outside that
licence. Not a grey area — the licence text is explicit.

We would be shipping a font we have no right to ship, on a site whose
security page tells brokerages we take compliance seriously. The first
person to notice would be a competitor.

**What we do instead:** the system font stack. On a Mac or an iPhone,
`-apple-system` renders SF natively, because it is the operating
system's own font being called by the operating system. That is
legitimate, it is what Apple's own site does for most body copy, and it
costs us nothing. On Windows it falls to Segoe, on Android to Roboto.

Inter as the loaded fallback, because it is the closest thing to SF that
is licensed for open use and it holds up at large sizes.

### 2. We are not copying the layout

Apple's design language is built to sell **objects** — a phone
photographed against black, rotating, at 2000px. Every layout decision
follows from having something beautiful to show.

We have no object. We have a WhatsApp conversation. Copying the
choreography of a product launch page and putting a chat thread where
the iPhone goes will look like exactly what it is.

**What we take instead is the discipline underneath it**, which is
transferable and is genuinely what makes their site feel modern.

---

## What we are taking, and it is the important half

Six principles. Every one of them is why their site feels expensive, and
none of them requires a phone.

**1. Ruthless subtraction.** Look at an Apple product page: a headline,
one image, one sentence, enormous space. They earn attention by not
asking for it constantly. Our current homepage has twelve sections. It is
going to have seven.

**2. Type as the primary visual element.** Their headlines run 48–80px on
desktop, tight tracking, and carry the page on their own. No decoration,
no icon beside every heading. If a section needs an illustration to be
interesting, the sentence is not good enough yet.

**3. One thing per screen.** Each scroll position holds one idea, fully.
Not three cards side by side competing.

**4. Space as a material.** Their vertical rhythm is enormous — 120 to
180px between sections. Whitespace is not what's left over; it is the
main ingredient and it is what reads as confidence.

**5. Motion that reveals, never decorates.** Content enters as you reach
it, briefly, once. No parallax, no floating, no counters ticking up.
Every animation answers "what changed?" and then stops.

**6. Product-first imagery.** They show the thing working, not an
abstraction of it. For us that means the actual conversation — real
messages, real timestamps — rendered at a size you can read from across
a desk.

---

## The palette

Apple's is close to no palette at all: near-white, near-black, and one
accent used sparingly for action.

**We already have this.** The paper-and-ink system is the same idea with
warmer temperature. That was the right call and we are keeping it. What
changes is the *ratio* — far more ground, far less ink.

    Ground      #FBFAF8   near-white, warm, replaces the current paper
    Deep        #0B0B0C   near-black sections, for contrast breaks
    Ink         #1A1A1C   primary type
    Secondary   #5C5C63   supporting type
    Tertiary    #86868B   captions, meta — this is Apple's exact grey
    Accent      #A83226   seal red, kept, action only
    Hairline    #E8E4DC   1px rules, and almost nothing else

One addition: **alternating light and deep sections.** Apple breaks a
long page by inverting it — a black section between two white ones. It
resets the eye and makes a long scroll feel structured rather than
endless. We have not been doing this and it is the single biggest change
to how the page will feel.

---

## Type scale

Bigger than you think is correct. Then bigger again.

    Display     clamp(3rem, 2rem + 5vw, 5.5rem)    hero only, 1.05, -0.03em
    H1          clamp(2.25rem, 1.6rem + 3vw, 3.5rem)   1.08, -0.025em
    H2          clamp(1.75rem, 1.3rem + 2vw, 2.5rem)   1.12, -0.02em
    H3          1.375rem                                1.25, -0.01em
    Body-lg     1.3125rem                               1.5    intros
    Body        1.0625rem                               1.6
    Caption     0.8125rem                               1.4    tertiary

Weights: 400, 500, 600 only. **No 700.** Apple's headlines are semibold
at most — bold at 80px looks heavy and cheap.

Negative tracking on everything above 2rem. This is the single most
recognisable thing about their typography and it costs one line of CSS.

---

## Spacing

    Section     clamp(88px, 12vw, 180px) vertical
    Block       48px
    Element     24px
    Tight       12px

If a section feels too airy in the browser, it is probably right. Compare
against apple.com in a second window rather than against instinct.

---

## Functionality

**Sticky nav with backdrop blur.** 48px tall, translucent, blurs what
passes underneath. `backdrop-filter: saturate(180%) blur(20px)`. Add an
`@supports` fallback to solid — Firefox lags here.

**Scroll reveals.** `IntersectionObserver`, 24px rise, 600ms, once. Never
on the hero — above the fold must be there on paint. Respect
`prefers-reduced-motion` by disabling entirely, not by shortening.

**The conversation demo becomes the hero.** Currently it is a supporting
element. It is the product; it goes at the top, large, and the messages
arrive on a timer as though it were happening. One cycle, then it rests.

**Nav links scroll smoothly to sections.** `scroll-behavior: smooth`,
`scroll-margin-top` on every anchor to clear the sticky bar.

Do not build: parallax, cursor followers, page transitions, a
preloader, counters that tick, tilting cards.

---

## What I will reject in review

- Any headline under 40px on desktop
- Any section under 88px of vertical padding
- 700 weight anywhere
- More than one accent colour on screen at once
- An icon whose only job is to sit beside a heading
- Positive letter-spacing on a headline
- Animation that runs more than once

---

## The one thing to hold onto

Apple's site does not feel modern because of the fonts. It feels modern
because they had the confidence to put one sentence on a screen and
nothing else.

Everything in this document is downstream of that. If you find yourself
adding an element to fill a space, delete the element and keep the space.

---

## Reference implementation

`preview-v2-home.html` is the direction built, not described. Open it
next to the current homepage and the difference is the point: seven
sections instead of twelve, and each one holds a single idea.

Read the CSS in it as the spec. Particularly:

**Section inversion.** `.on-deep` re-declares the tokens rather than
overriding individual colours. Any component dropped inside it inverts
correctly without knowing it is on a dark background. That is the whole
reason it works — no component needs a dark variant.

**`--tertiary` is `#86868B`, Apple's own grey**, and it measures 3.47:1
on our ground. That fails AA for body text and passes for large or
non-essential text, which is exactly the restriction Apple works under.
Captions and meta only. If you use it for a paragraph I will send it back.

Every ratio in the palette is measured, not estimated:

    ink on ground        16.66:1
    secondary on ground   6.36:1
    tertiary on ground    3.47:1   captions only
    accent on ground      6.39:1
    on-deep on deep      18.07:1

**Reveals are opt-in via a class the script adds.** If JavaScript fails,
nothing is hidden — the page is simply readable. The common
implementation hides everything in CSS and reveals with JS, which turns
one failed request into a blank page.

**The hero has no `data-reveal`.** It is present on paint. Animating the
first thing a visitor sees is the most common mistake in this style and
the most expensive.

## What to do with this

1. Roll `tokens-v2.css` into the site and the CRM together. Two token
   files is how the app and the marketing site drift apart.
2. Rebuild the homepage against this reference, then the other ten pages.
3. Re-run all seven audit scripts. The design changes; the standards do
   not.

The current site is good work and it is not wrong. This is a different
posture — quieter, more confident, more room. Do not let anybody talk you
into meeting it halfway, because half of this reads as neither.
