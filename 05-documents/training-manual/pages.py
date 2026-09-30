import json, re, sys
from pypdf import PdfReader
r = PdfReader(sys.argv[1]); pages = {}
for i, pg in enumerate(r.pages, 1):
    for m in re.findall(r"§([a-z0-9-]+)§", pg.extract_text() or ""):
        pages.setdefault(m, i)
json.dump(pages, open(sys.argv[2], "w"), indent=1); print(len(r.pages), "pages;", len(pages), "markers")
