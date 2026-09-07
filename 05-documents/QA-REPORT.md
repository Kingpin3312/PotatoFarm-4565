# Enterprise QA pass

Run 28 July 2026. Written to be read by someone who will be held
responsible for the launch.

---

## First, what I did not do

The brief asks me to verify the site on iPhone SE through Pro Max, Android,
iPad, Surface, ultra-wide, and in Chrome, Safari, Firefox, Edge and Opera.

**I have no browser and no devices. I did not do that, and I am not going
to tell you I did.** Every "verified across all devices" claim you have
ever read in an AI-written QA report was invented, and this project has
already shown what happens when I assert something I have not measured —
in Phase 11 I found I had told you a colour passed WCAG when it failed by
a third.

What I *can* do is static analysis, and I have written the tooling for it
and run it. It reasons about the CSS, the markup and the behaviour, and it
finds the class of defect that causes device bugs. It is not a substitute
for opening the site on a real phone. Budget half a day for that before
launch, and do it on a mid-range Android as well as an iPhone.

## What the audit found

Seven real defects. All fixed. Two of them were mine claiming things the
code did not do.

### 1. The mobile menu was lying to screen readers

`aria-modal="true"` is a promise that focus cannot leave the dialog. I set
the attribute and never trapped focus. I also described it as "focus
trapped" in Phase 3 and again in Phase 5, and the end-to-end test only
checked that focus *returned* on close, so it passed.

A screen reader user would be told they are in a modal, then silently
tabbed out into the page behind it, with no way to tell where they were.
That is worse than not marking it modal at all.

Fixed: real Tab and Shift-Tab cycling, and the rest of the page set
`inert` while the menu is open, so it is hidden from assistive technology
as well as from view.

### 2. The consent bar sat under the home indicator

Fixed to `bottom: 0` with no safe-area inset, so on any notched iPhone the
bottom of the bar — including part of the buttons — falls under the home
indicator. Also missing `viewport-fit=cover`, without which
`env(safe-area-inset-*)` silently resolves to zero, so adding the inset
alone would have done nothing.

Fixed on both counts, and the mobile menu got the same treatment.

### 3. The consent bar pushed focus onto "Accept"

Moving keyboard focus to the agreeing button is a nudge. I criticised
exactly this pattern in the brand review and then shipped it. Focus now
goes to the dialog itself.

### 4. The pricing "Most brokerages" tag overlapped the plan name

Absolutely positioned at `top: 28px; right: 26px`, which collided with the
heading once the plan name wrapped — which it does at tablet widths. Now
in normal flow.

### 5. The rate limiter leaked memory

The in-memory fallback added a bucket per IP and never removed one. On a
long-lived instance that is an unbounded Map, and it is cheap for an
attacker to grow on purpose. Now evicts expired buckets past a threshold.

### 6. Email header injection

The brokerage name went into the email subject line unsanitised. A newline
in a header is header injection. Now stripped and length-capped.

### 7. A false positive in my own tooling

The responsive checker flagged every JavaScript file for not containing a
focus trap, rather than asking whether any file in the bundle did. Fixed
the check, not the code — a checker that cries wolf gets switched off.

## Current state

    accessibility / markup    0 failures    14 pages
    responsive / robustness   0 issues
    contrast                  10/10 pairs pass WCAG AA

The two scripts are in `potato-tests/scripts/`. They run in about a second
and belong in CI on every commit.

## Security review

| Area | State |
|---|---|
| Input validation | Zod, server side, same schema as the client |
| XSS | JSON-LD escaped; email fields escaped; no `innerHTML` on user data |
| SQL injection | Not applicable — no SQL in the marketing site |
| CSRF | Not applicable — JSON POST, no cookie auth. Revisit when the CRM adds sessions |
| Rate limiting | Per IP, five a minute, now with eviction |
| Secrets | Server-only, none prefixed `NEXT_PUBLIC_` except the two that must be |
| Headers | HSTS, nosniff, frame options, permissions policy, CSP |
| Webhooks | HMAC signed both directions |
| Logging | Lead ID on every failed delivery, no PII in logs |

**One thing still open.** The CSP carries `script-src 'unsafe-inline'`
because Next's bootstrap needs it. Moving to a nonce is a half-day of work
and it is the difference between a CSP that documents intent and one that
actually stops an injected script. I would do it before launch, not after.

## Still not verified, and cannot be from here

- Real device rendering
- Real browser behaviour
- Actual Lighthouse numbers
- Screen reader behaviour with VoiceOver or NVDA
- The form end to end against live Resend, CRM and webhook

The Lighthouse budgets and Playwright suite from Phase 11 cover most of
this the moment there is somewhere to run them. Until then, treating a
static pass as a launch sign-off would be a mistake.
