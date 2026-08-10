# Putting the site live on potatofarm.io

You own the domain. The site is static HTML with no build step, so this
is DNS and a drag-and-drop, not an engineering task. Half an hour.

Everything below was verified against the site served over real HTTP by
`serve.mjs`, which reproduces what the host does with `_redirects` and
`_headers`. It is not written from memory.

---

## Before you start

```bash
cd 02-the-project/website
node serve.mjs 4321 &          # serve it exactly as the host will
node predeploy.mjs             # pages, CSP, forms, desktop + iPhone
node predeploy-links.mjs       # every internal link, followed over HTTP
../../04-audit-scripts/site-deep.py .
```

All four must pass. They currently do. If one fails after an edit, the
edit is the problem — do not deploy around it.

**Once the application is deployed**, the two form flows are worth
running too, because they are the one thing that spans both
deployments and neither side's checks can see the gap:

```bash
node serve.mjs 8081 &
npm --prefix ../app run dev
node demo-flow.mjs             # desktop and iPhone, submitted for real
node subscribe-flow.mjs        # a guide subscribe, submitted for real
```

They intercept the post to `app.potatofarm.io` and send it to the local
application. Run them with the app *stopped* to see the other half:
the form should say "That didn't send" and show the mailto beside it,
which is the state the site is in until the app goes up.

One thing that looks like a failure and is not: a `429` and "Too many
attempts" means the rate limiter is working. Wait a minute, or clear
`RateLimitHit`.

---

## 1. Cloudflare Pages

Free, fast in the Gulf, and it reads `_redirects` and `_headers` without
configuration. Netlify behaves the same way if you prefer it.

1. **Cloudflare → Workers & Pages → Create → Pages → Upload assets.**
2. Upload the **contents** of `02-the-project/website/` — the ten HTML
   files, `assets/`, `_redirects`, `_headers`, `robots.txt`,
   `sitemap.xml`. Not the folder itself, and not `serve.mjs`,
   `predeploy*.mjs` or this file.
3. Project name `potatofarm`. No build command, no output directory —
   there is no build.

You will get `potatofarm.pages.dev`. Open it and click through all nine
pages before touching DNS.

---

## 2. DNS

In Cloudflare Pages → your project → **Custom domains**, add **both**:

| Domain | Why |
|---|---|
| `potatofarm.io` | The canonical host. Every canonical tag and every sitemap entry points here. |
| `www.potatofarm.io` | Registered, so it must resolve — and 301 to the apex. |

Cloudflare creates the records itself if the domain is on your account.
If the registrar is elsewhere, point the nameservers at Cloudflare first;
a CNAME on an apex will not work at most registrars.

**The www → apex redirect is already in `_redirects`** and was verified:

```
$ curl -I -H "Host: www.potatofarm.io" .../guides
301 → https://potatofarm.io/guides
```

Do not also add a Cloudflare Redirect Rule for it. Two mechanisms doing
the same job is how a redirect loop happens.

---

## 3. What to check the moment it is live

```bash
for u in / /product /security /guides /demo /legal \
         /trakheesi-permits /uae-aml-for-brokerages /whatsapp-24-hour-window; do
  curl -s -o /dev/null -w "%{http_code}  $u\n" https://potatofarm.io$u
done

curl -sI https://www.potatofarm.io/product | grep -i location   # → apex
curl -s -o /dev/null -w "%{http_code}\n" https://potatofarm.io/nonsense   # → 404
curl -sI https://potatofarm.io/ | grep -i content-security-policy
```

Nine 200s, one 301, one 404, and a CSP header. The three guide URLs are
the ones to watch: they were missing from `_redirects` and would have
404'd, and they are the pages search traffic lands on.

Then submit `https://potatofarm.io/sitemap.xml` in Google Search Console.

---

## 4. What is *not* live yet, and what the site does about it

The application is a separate deployment at `app.potatofarm.io` and it
needs a database, so it is not going up today. Two things on this site
point at it:

- **The demo form** posts to `https://app.potatofarm.io/api/demo`.
- **The guide subscribe forms** post to `.../api/subscribe`.

Until the app is deployed those posts fail. **The forms degrade
honestly** — every one sits beside a `mailto:` link, and that is
deliberate rather than a fallback nobody tested. Read the form copy once
before launch so you know what a visitor sees.

If you would rather not have a form that cannot submit, delete the form
blocks and leave the mailto links. It is a five-minute edit and
`site-deep.py` will tell you if you break a page doing it.

---

## 5. The forms are cross-origin, and two lists have to agree

The site is on `potatofarm.io`; the form endpoints are on
`app.potatofarm.io`. That is a cross-origin POST, so it works only while
**two lists name the same hosts**:

| Where | What it lists |
|---|---|
| `app/src/server/lib/website/cors.ts` | The origins allowed to POST — `potatofarm.io` and `www.` only |
| `_headers` here | `app.potatofarm.io` in `connect-src` |

If the site ever moves to a different domain, **both** change or the
forms fail silently in the browser console — a CORS rejection is not an
error the visitor sees, so it looks like the form doing nothing.

---

## 6. What is deliberately not on this site

Do not treat these as gaps to fill before launch. Each is a decision.

**No pricing page.** The number is a line on the homepage instead: book a
call and we'll talk about it. Normal at this stage, and better than a
page reading `AED —`.

**No customers page.** You have no customers. Placeholder brokerage names
are worse than no page, and the real version will be worth ten times
more.

**No certifications claimed.** The security page says so plainly, which
is a stronger position than a badge.

**No analytics.** See section 7.

Add each one the day it becomes true. That is the whole rule.

**The three guides are the growth engine.** Meta's 24-hour window,
Trakheesi permits, and what being a DNFBP requires — questions brokerage
owners actually search, written from work that had to be done anyway.
They need no customers, no price and no testimonials, and they carry
Article schema, which is what gets them quoted when somebody asks an AI
assistant about UAE property compliance. Almost nobody in this market is
writing for that channel. One more a month: service charges blocking an
NOC, the seller's liability letter, why a 30-day Form F fails on a
mortgage purchase. Each is an afternoon and each is permanent.

**Do not deploy `preview-*.html`.** They are generated, git-ignored
copies with the CSS and JS inlined, for looking at a page on a phone
without a server. Deployed, they would be indexed as duplicates of the
real pages.

---

## 7. Two things to decide

**The demo form's destination.** Right now it needs the app. A form
posting to a hosted form service instead would work today, at the cost
of leads not landing in the CRM. Your call — the leads matter more than
the tidiness in the first month.

**Analytics.** There is none, deliberately: the CSP has no third-party
`script-src` and the privacy page says so. Cloudflare Web Analytics is
the option that does not need a cookie banner or a CSP change. Anything
else means editing `_headers`, and the privacy page with it.
