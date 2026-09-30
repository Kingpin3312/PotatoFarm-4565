"""What Apple's PDF viewer draws wrongly: translucent layers. A blurred
shadow, a faded logo or a see-through image reaches the PDF as a soft mask
or a partly transparent graphics state, which iPhone and Mac can draw as a
hard grey box. Checks each page's own resources (never its parents)."""
import re, sys, pymupdf
doc = pymupdf.open(sys.argv[1]); bad = []
for i, pg in enumerate(doc, 1):
    hits, seen = set(), set()
    def walk(x):
        if x in seen: return
        seen.add(x)
        obj = re.sub(r"/Parent \d+ 0 R", "", doc.xref_object(x))
        if re.search(r"/SMask \d+ 0 R", obj): hits.add("soft mask")
        for key, v in re.findall(r"/(ca|CA) ([0-9.]+)", obj):
            if float(v) < 0.999: hits.add(f"opacity {float(v):g}")
        for ref in re.findall(r"(\d+) 0 R", obj): walk(int(ref))
    walk(pg.xref)
    if hits: bad.append((i, sorted(hits)))
for i, h in bad[:12]: print(f"page {i}: {', '.join(h)}")
print(f"{len(doc)} pages, {len(bad)} with translucent layers")
