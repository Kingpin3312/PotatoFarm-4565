"""Stamp footers on every page but the covers and the part dividers."""
import json, sys
from pypdf import PdfReader, PdfWriter
body, foot, out, pages_json = sys.argv[1:5]
pages = json.load(open(pages_json))
skip = {1, pages.get("back")} | {v for k, v in pages.items() if k.startswith("part-")}
w = PdfWriter(clone_from=body)
f = PdfReader(foot)
for i, pg in enumerate(w.pages, 1):
    if i not in skip:
        pg.merge_page(f.pages[i - 1])
        pg.compress_content_streams()
w.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
w.add_metadata({"/Title": "PotatoFarm.io Training Manual", "/Author": "PotatoFarm.io",
                "/Subject": "Training manual for agents, managers, owners and compliance officers"})
w.write(out); print("stamped", len(w.pages), "pages, skipped", sorted(x for x in skip if x))
