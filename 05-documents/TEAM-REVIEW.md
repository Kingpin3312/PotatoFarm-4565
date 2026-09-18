# Before launch — every seat at the table

You asked whether I can improve it. **Yes, and I found five things nobody
had checked.** All five are now fixed. Then the honest part.

---

## What the room found

### Brand and design

**No favicon.** Every browser tab showed a default globe. On a phone
home screen it would have shown a screenshot of the page. Ten minutes of
work that makes the difference between a company and a project.

Now: PF mark at 32, 180 and 512, plus a web manifest so an installed
shortcut looks right.

### Marketing — and this is the one that mattered most

**No `og:image`. Every share showed a blank card.**

Read that again in context: **your product is sold through WhatsApp, and
your site will be shared through WhatsApp.** A brokerage owner forwarding
your link to a partner is the single most common way anyone will ever see
PotatoFarm — and it would have arrived as a grey box with a URL.

Now: three share cards, generated to match the site exactly — the same
navy-to-ocean gradient, the same lockup with the flush mark and the
lighter extension, a cyan rule at the foot. A card that does not match
the page it links to looks like somebody else made it.

### Content

**No 404 page.** A mistyped URL would have shown Netlify's default,
which carries their branding and none of yours. Now it is the same shell,
says *"That page isn't here — either it moved or the link was wrong.
Neither is your fault"*, and gives two ways back.

### Accessibility

**Footer headings were `h3` under an `h1`.** They passed on nine pages
because those happened to have an `h2` in the body, and failed on the one
that did not — which means they were never structurally right, only
accidentally valid. Now `h2` throughout, with size as a class.

### Engineering

Three meta descriptions went over 160 characters when the name got
longer. Small, real, and exactly the kind of thing that survives to
launch because nobody re-runs the checks after a rename.

---

## Where we honestly are

**The website is finished.** Ten pages, zero failures, zero warnings
across three independent audits. It is measurably better than the
competitor you will actually be compared against and there is nothing
outstanding on it.

**The CRM has never been compiled.** That has not changed and no amount
of review will change it.

**There is no customer.** That has not changed either.

---

## Can I improve it further? Honestly, no — not usefully

I have now run seven audit scripts, three formal reviews, a design
rebuild, a naming exercise and this pass. The last three rounds have
produced: a dependency cycle, a money-unit bug, a dead login link, five
launch assets and some heading levels.

**Every one was real. None of them was the thing holding you back.**

The next genuine improvement to this product cannot be made by me,
because it requires information I do not have and cannot generate:

- **What agents actually do with it.** Every UX judgement here is
  untested. Enter sends. A reply pauses a plan. Outcomes are two taps.
  Several are wrong and I cannot tell you which.
- **Whether the assistant sounds right.** It has held zero real
  conversations. Kendal's has held thousands, and that gap does not close
  with better prompts — it closes with transcripts.
- **What a brokerage owner objects to in minute four.** That determines
  the homepage, and it is not knowable from here.

**More building from me now is motion, not progress.** I would be
polishing a thing whose fundamental uncertainty is unaffected by
polishing.

---

## What would actually exceed expectations

Not a better site. **A named brokerage on a call this week.**

The four business items are still yours and still unmoved: a price, three
testimonials, logos with permission, hosting region. Two of those require
a customer, which is the same bottleneck as everything else.

**Deploy tonight so DNS settles. Ring three owners tomorrow.** The site
is now good enough that it will not be the reason any of them says no —
which is all a site can ever do, and it is done.

Everything after that is a conversation I cannot have for you.
