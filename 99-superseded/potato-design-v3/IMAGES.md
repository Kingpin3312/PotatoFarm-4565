# Adding the visuals

Three separate problems, and the middle one is the expensive one to get
wrong.

---

## 1. Where the pictures come from

### The hero shot

Four routes, best first.

**Your pilot brokerage's own listings.** This is the answer. They have
professional photography of real Dubai property, they own it, and one
line in the pilot agreement gets you the right to use it. It is local,
it is true, and it costs nothing.

It also gives you a caption no stock library can: *"Marina Gate 2,
listed by [brokerage]"*. A real building somebody recognises beats a
beautiful house in California every time.

**Commission a shoot.** A Dubai architectural photographer is roughly
AED 2,000–4,000 for a half day and you own the output outright. Worth it
once you have a customer whose properties you can shoot.

**Unsplash or Pexels.** Free, commercial use permitted, no attribution
required on Unsplash. Search `Dubai Marina`, `Dubai skyline night`,
`modern villa pool`. The catch: every other proptech company is using
the same twelve photos, and a brokerage owner who has seen that villa on
three other sites notices.

**Adobe Stock or Getty.** Around $10–50 an image. Better selection, same
sameness problem.

### Never

**A photo of a property you do not represent**, taken from a portal.
That is somebody else's copyright and somebody else's building, and in
this market the owner will see it.

### The faces

The mockup has headshots for John Smith, Sarah Johnson and so on.

**Do not use stock headshots to represent customers or agents.** A photo
of a model captioned as your customer is a false statement about a real
person's endorsement, and it is the same category of problem as the
developer logos.

Three safe options:

1. **Initials in a circle** — what the dashboard I built uses. Honest,
   fast, and no licence to worry about.
2. **Real photos of your real team**, with their permission in writing.
3. **Illustrated or generated avatars**, obviously not photographs.

Initials look deliberate. Stock faces look like a company pretending to
have customers.

---

## 2. What the picture has to be, technically

A hero photo is the single heaviest thing on a page and the first thing
a visitor waits for. Get it wrong and the site that currently loads
instantly takes four seconds on a phone in a car park.

    Format        AVIF first, WebP fallback, JPEG last
    Hero width    2400px source, served at 5 sizes
    Quality       AVIF q50, WebP q75 — indistinguishable, far smaller
    Target        Under 180KB for the hero, under 90KB for cards
    Aspect        Set width and height so the layout cannot jump

`optimise.py` in this folder does all of it. Point it at a directory of
photos and it produces every size and format with the right names.

    python3 optimise.py ~/Downloads/shoot images/

---

## 3. Putting it in without wrecking the page

The pattern is in `hero-with-image.html`. Four things in it are not
optional:

**The hero image is never lazy-loaded.** It is the Largest Contentful
Paint element — lazy-loading it tells the browser to deprioritise the
exact thing the visitor is waiting for. `fetchpriority="high"`, and a
`<link rel="preload">` in the head.

**Everything below the fold is `loading="lazy"`.** The opposite rule, for
the opposite reason.

**Width and height on every image**, always. Without them the text moves
down when the picture arrives, and a visitor who has started reading
loses their place. This is the single most common cause of a page feeling
cheap.

**A real `alt`, or an explicitly empty one.** `alt="Modern villa at
dusk with a lit pool, Dubai"` if it carries meaning. `alt=""` if it is
decoration — an empty alt tells a screen reader to skip it, which is
correct and is not the same as leaving the attribute off.

---

## The order I would do this in

1. **Ship without photography.** The site is finished and fast today.
   A hero image is an improvement, not a blocker, and the product
   screenshot in the hero is arguably better than a house — it shows what
   you sell rather than what your customers sell.
2. **Sign the pilot.** Ask for image rights in the same conversation.
3. **Use their buildings.** Real, local, free, and it makes the page
   about them rather than about a stock library.

The one thing not to do is buy a photo of a villa in Los Angeles to sell
software to a man who has stood in the building next door.
