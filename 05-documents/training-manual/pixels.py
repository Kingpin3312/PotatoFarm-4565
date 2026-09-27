"""Every section page, in two PDF engines: the charcoal band is unbroken
down its edges to one clean line, and below that line nothing but white."""
import json, sys
import pymupdf, pypdfium2 as pdfium
from PIL import Image
pdf_path, pages_json = sys.argv[1], sys.argv[2]
pages = json.load(open(pages_json))
skip = {"contents", "roles", "back", "routines", "trouble", "glossary"}
secs = sorted(v for k, v in pages.items() if not k.startswith("part-") and k not in skip)
def dark(p): return sum(p) < 3 * 120
def check(img, i, engine):
    w, h = img.size; px = img.load()
    edge = 3
    bottom = next(y for y in range(h) if not dark(px[edge, y]))          # where the band ends at the left edge
    right = next(y for y in range(h) if not dark(px[w - 1 - edge, y]))  # and at the right edge
    probs = []
    if abs(bottom - right) > 2: probs.append(f"band ends at {bottom}px left but {right}px right")
    if bottom < h * 0.2: probs.append(f"band only {bottom}px tall")
    for y in range(bottom + 1, bottom + int(h * 0.0135)):               # the 4mm just below the band (headings start 7mm down)
        stray = [x for x in range(w) if dark(px[x, y])]
        if stray: probs.append(f"dark pixels on white at y={y}: x {stray[0]}–{stray[-1]}"); break
    for y in range(0, bottom - 2, 7):                                    # the band has no white holes at its edges
        if not dark(px[edge, y]) or not dark(px[w - 1 - edge, y]): probs.append(f"band broken at y={y}"); break
    return probs
doc = pymupdf.open(pdf_path); pdm = pdfium.PdfDocument(pdf_path); bad = 0
for i in secs:
    pix = doc[i - 1].get_pixmap(dpi=60)
    a = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    b = pdm[i - 1].render(scale=60 / 72).to_pil().convert("RGB")
    for eng, im in (("mupdf", a), ("pdfium", b)):
        p = check(im, i, eng)
        if p: bad += 1; print(f"page {i} [{eng}]: " + "; ".join(p))
print(f"{len(secs)} section pages checked in two engines, {bad} problems")
