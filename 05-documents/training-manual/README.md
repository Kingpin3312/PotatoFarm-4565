# The training manual

`../PotatoFarm-Training-Manual.pdf` is built from the running app. Rebuild it
when the screens change, so the screenshots never describe a product that
has moved on.

1. Reseed the demonstration brokerage and start the app:
   `npm run db:seed && npm run dev` (in `02-the-project/app`).
2. Capture every screen (Dubai time, the developer badge hidden). Copy
   `capture.mjs` into `02-the-project/app/.tmp/`, then run
   `node .tmp/capture.mjs <out>`; it writes `<out>/raw/*.png` and
   `<out>/texts.json`, the text of each screen, to write against.
3. `python build.py` → `manual.html`; render it with `render.mjs`, find the
   section pages with `pages.py`, run `build.py pages.json` again so the
   contents page carries page numbers, then add footers with `footers.py`
   and `stamp.py`. Fonts: Inter from `@fontsource/inter` (the app itself uses
   the system font; a PDF has to look the same on every machine).

The words are in `content.py`, one entry per section. Every instruction was
written against the screen as captured; when a screen changes, change its
entry.
