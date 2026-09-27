# The training manual

`../PotatoFarm-Training-Manual.pdf` is built from the running app. Rebuild it
when the screens change, so the screenshots never describe a product that
has moved on.

1. Reseed the demonstration brokerage and start the app:
   `npm run db:seed && npm run dev` (in `02-the-project/app`).
2. Capture every screen at 1120×760 (Dubai time; the developer badge, the
   Demo label and the demonstration-only Inbox buttons hidden, because an
   agency's own agents never see them). Copy
   `capture.mjs` into `02-the-project/app/.tmp/`, then run
   `node .tmp/capture.mjs <out>`; it writes `<out>/raw/*.png` and
   `<out>/texts.json`, the text of each screen, to write against.
3. `python build.py` → `manual.html`. Check it with `overflow.mjs`: every
   page is a fixed A4 sheet (this renderer ignores per-page margins), and a
   section with more words than fit is reported rather than silently cut.
   Fix it in `TREAT` in `build.py` (crop the screenshot, or the two-column
   "wide" layout). Then render it with `render.mjs`, find the
   section pages with `pages.py`, run `build.py pages.json` again so the
   contents page carries page numbers, then add footers with `footers.py`
   and `stamp.py`. Fonts: Inter from `@fontsource/inter` (the app itself uses
   the system font; a PDF has to look the same on every machine).

The words are in `content.py`, one entry per section. Every instruction was
written against the screen as captured; when a screen changes, change its
entry.

## Edition 2 and why

Edition 1 was accurate and read as software documentation. Audited against
the printed material a top-end agency gives its agents, it fell short: the
Demo label on every screenshot, the sales-demo buttons in every Inbox shot,
screen text printing at about 4.5pt, heavy type, pink blocks, and a
glow-and-collage cover. Edition 2 keeps the words and changes the setting:
a charcoal stage at the head of every page with the screen framed, light
headings, hairline rules, steps and notes in two columns, one section per
sheet, and a line saying the sample brokerage is illustrative.

## Four checks, every rebuild, every page

A page that looks right here can look wrong on the reader's phone. Edition
2 as first published looked perfect in Chrome's and MuPDF's renderers and,
on an iPhone, showed each screenshot's soft shadow as a hard grey box
spilling off the charcoal band onto the white (pages 6, 22 and 27 were
reported). Apple's PDF viewer draws translucent layers — blurred shadows,
faded or see-through images, CSS gradients — its own way. So the manual now
uses none: flat charcoal, crisp frame edges instead of shadows, and a flat
image of the potato (`mark_flat.png`) instead of the blurred SVG.

- `captures.py texts.json` — every screenshot the manual uses was taken with
  content on it. Documents and Reports went out as grey blocks: their
  loading placeholders are marked `aria-busy` rather than saying
  "Loading", and the capture waited only for the word. `capture.mjs` now
  waits for both and refuses to save a placeholder.
- `overflow.mjs manual.html` — every page's words fit its sheet.
- `pixels.py <pdf> pages2.json` — on every section page, in two PDF engines,
  the charcoal band runs unbroken to one edge and nothing lands on the
  white below it.
- `structure.py <pdf>` — no page carries a translucent layer. This is the
  one that catches the iPhone fault (the two renderers above cannot show
  it): 62 of 62 pages flagged on the edition you saw, 0 now.

## In the CRM

`publish.py <pdf> pages.json` puts the manual into the app: every page as an
image under `manual-assets/<edition>/` (an iPhone shows only the first page
of a PDF inside a web page, so the reader shows images), the PDF for
download beside them, and the contents as `src/lib/manual.ts`. Agents open
it from **Training manual** on Today, or from More and search.

**It is behind sign in.** `manual-assets/` is deliberately not under
`public/`: anything there is served to anyone who has the address, and the
manual is a map of the product for a competitor. Every page and the PDF
come through `src/app/api/manual/[...path]/route.ts`, which refuses (401)
without a session, before two-step sign-in is finished, or without a
membership, and sends `Cache-Control: private` so no shared cache keeps a
copy. `/api` is outside the middleware's sign-in redirect, which is why
the route checks for itself. `next.config.ts` lists the folder in
`outputFileTracingIncludes` so a production build ships it.
`npm run browser:manual` asserts all of it, including that the old public
addresses serve nothing.
