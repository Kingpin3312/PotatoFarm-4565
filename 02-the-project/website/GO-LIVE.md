# Go live

Ten pages. Nothing on any of them is waiting.

## Deploy

The site is static. Drop **this folder** on Netlify, Vercel or Cloudflare
Pages — no build step, no environment variables, nothing to configure.

    02-the-project/website/
      index.html                     home
      product.html                   how it works
      security.html                  security and compliance
      demo.html                      book a call
      guides.html                    guide index
      whatsapp-24-hour-window.html   guide
      trakheesi-permits.html         guide
      uae-aml-for-brokerages.html    guide
      legal.html                     terms and privacy
      404.html                       not found
      assets/site.css
      assets/site.js
      _headers  _redirects
      sitemap.xml  robots.txt  site.webmanifest

`_headers` and `_redirects` are read by Netlify and Cloudflare Pages. They
set the security headers and the extensionless URLs (`/product` →
`product.html`). On Vercel they are ignored and the equivalent belongs in
`vercel.json` instead.

## The two forms need the application

The demo form and the four guide subscribe forms are the only things here
that talk to a server. They post to `https://app.potatofarm.io/api/demo`
and `/api/subscribe`, which are routes in `02-the-project/app`.

They used to post to `potatofarm.io/api/…`, served by a folder called
`website-api/` that had no `package.json`, no `next.config` and two
conflicting app directories — it could not be deployed, so the site's only
conversion path posted to a URL nothing answered. That folder is gone and
the two routes moved into the application, which is already a deployable
Next project.

Two consequences:

- **The application has to be up before the forms work.** A brokerage
  owner filling in the demo form on a site whose API is not deployed gets
  "That didn't send. Email hello@potatofarm.io" — which is at least true,
  and the address is right above the form.
- **The requests are cross-origin.** The routes return
  `Access-Control-Allow-Origin` for `potatofarm.io` and `www.` only, and
  `_headers` here lists `app.potatofarm.io` in `connect-src`. If the site
  ends up on a different domain, both lists have to change:
  `app/src/server/lib/website/cors.ts` and `_headers`.

There was a second, identical copy of this folder at `07-ready-to-deploy/`
until the two started to drift — one had the deploy config, the other had
the working files, and neither was complete. There is one copy now, and
this is it.

The `preview-*.html` files are the same pages with the CSS and JS inlined,
for looking at on a phone without a server. They are generated, and
git-ignored. **Do not deploy those** — they duplicate the stylesheet ten
times and would be indexed as duplicates of the real pages.

## Before you press deploy

- [ ] Point `hello@potatofarm.io` somewhere that a person reads
- [ ] **Deploy the application first.** Both forms post to
      `https://app.potatofarm.io/api/…`, so the site is live with two dead
      forms until that host answers. See below.
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
both ends. Ten pages, no broken links, no orphans, no duplicate metadata,
no placeholder text — checked by script.

The scripts are in `04-audit-scripts/` at the repository root. They need
`beautifulsoup4`:

    pip install beautifulsoup4
    python3 04-audit-scripts/audit.py

Treat their colour findings as advisory for now — several still check a
palette two generations old, which is being corrected separately.
