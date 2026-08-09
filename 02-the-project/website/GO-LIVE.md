# Go live

Nine pages. Nothing on any of them is waiting.

## Deploy

The site is static. Drop the folder on Netlify, Vercel or Cloudflare
Pages — no build step, no environment variables, nothing to configure.

    potato-launch/
      index.html                     home
      product.html                   how it works
      security.html                  security and compliance
      demo.html                      book a call
      guides.html                    guide index
      whatsapp-24-hour-window.html   guide
      trakheesi-permits.html         guide
      uae-aml-for-brokerages.html    guide
      legal.html                     terms and privacy
      assets/site.css
      assets/site.js
      sitemap.xml  robots.txt

The `preview-*.html` files are the same pages with the CSS and JS inlined,
for looking at on a phone without a server. **Do not deploy those** —
they duplicate the stylesheet nine times and would be indexed as
duplicates of the real pages.

## Before you press deploy

- [ ] Point `hello@potatofarm.io` somewhere that a person reads
- [ ] Confirm `app.potatofarm.io` exists, or remove the Log in link
- [ ] Submit the sitemap in Google Search Console
- [ ] Check the homepage on a phone in daylight — the whole design
      assumes that context

## What is deliberately not here

**No pricing page.** The number is a line on the homepage instead:
*book a call and we'll talk about it.* Normal at this stage, and better
than a page reading `AED —`.

**No customers page.** You have no customers. A page of placeholder
brokerage names is worse than no page, and the real version will be worth
ten times more.

**No certifications claimed.** The security page says so plainly, which
is a stronger position than a badge.

Add each one the day it becomes true. That is the whole rule.

## The guides are the growth engine

Three pages answering questions brokerage owners actually search, written
from work we had to do anyway:

- Meta's 24-hour window, and why the failure is silent
- Trakheesi permits and expiry
- What being a DNFBP requires

They need no customers, no price and no testimonials. They carry Article
schema, which is what gets them quoted when a buyer asks an AI assistant
about UAE property compliance — a real referral channel now, and one
almost nobody in this market is writing for.

**Write one more a month.** Service charges blocking an NOC. The seller's
liability letter. Why a 30-day Form F fails on a mortgage purchase. Each
is an afternoon and each is permanent.

## Measured, not assumed

Every colour pair passes WCAG AA, including across the hero gradient at
both ends. Nine pages, no broken links, no orphans, no duplicate
metadata, no placeholder text — checked by script, and the scripts are in
`potato-tests`.
