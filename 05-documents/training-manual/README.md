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
