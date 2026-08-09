#!/usr/bin/env python3
"""
Turn a folder of photos into web images.

    python3 optimise.py ~/Downloads/shoot images/

Produces AVIF, WebP and JPEG at five widths, plus a copy-paste HTML
snippet with the srcset already written.

Why three formats: AVIF is roughly half the size of JPEG at the same
quality and every current browser supports it, but a two-year-old
Android does not. The browser picks the first one it understands, so
nobody waits for bytes they cannot use.
"""
import sys, os
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("pip install pillow --break-system-packages")

# Five widths. More is wasted disk; fewer means a phone downloads a
# desktop image.
WIDTHS = [480, 768, 1200, 1800, 2400]

# AVIF at 50 and WebP at 75 look identical to the eye and land at very
# different sizes. Numbers picked by comparison, not by convention.
QUALITY = {"avif": 50, "webp": 75, "jpg": 82}

def process(src: Path, out: Path):
    im = Image.open(src)
    # Strip EXIF. A photographer's camera writes GPS coordinates into
    # every file, and publishing the exact location of a client's villa
    # is not something anybody asked for.
    im = im.convert("RGB")
    stem = src.stem.lower().replace(" ", "-").replace("_", "-")
    made, ratio = [], im.height / im.width

    for w in WIDTHS:
        if w > im.width:
            continue   # never upscale — it adds bytes and removes sharpness
        h = round(w * ratio)
        resized = im.resize((w, h), Image.LANCZOS)
        for fmt in ("avif", "webp", "jpg"):
            path = out / f"{stem}-{w}.{fmt}"
            try:
                resized.save(path, quality=QUALITY[fmt],
                             **({"method": 6} if fmt == "webp" else {}))
                made.append((fmt, w, path.stat().st_size))
            except Exception as e:
                print(f"    {fmt} unavailable ({e.__class__.__name__})")
    return stem, im.width, im.height, ratio, made

def snippet(stem, ratio, widths):
    """The markup, with everything that is easy to forget already in it."""
    def srcset(fmt):
        return ",\n              ".join(f"images/{stem}-{w}.{fmt} {w}w" for w in widths)
    big = max(widths)
    return f'''<!-- In <head>, so the browser starts fetching before it parses the body. -->
<link rel="preload" as="image" fetchpriority="high"
      href="images/{stem}-{big}.avif" type="image/avif">

<picture>
  <source type="image/avif" srcset="{srcset('avif')}"
          sizes="(min-width: 960px) 50vw, 100vw">
  <source type="image/webp" srcset="{srcset('webp')}"
          sizes="(min-width: 960px) 50vw, 100vw">
  <img src="images/{stem}-1200.jpg"
       width="{big}" height="{round(big * ratio)}"
       alt="DESCRIBE THIS — or alt=&quot;&quot; if it is decoration"
       fetchpriority="high"
       decoding="async"
       style="width:100%;height:auto;border-radius:var(--r-lg)">
</picture>

<!-- Below the fold, change fetchpriority="high" to loading="lazy"
     and drop the preload. Opposite rule, opposite reason. -->'''

def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    src_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    photos = [p for p in sorted(src_dir.iterdir())
              if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".heic", ".tif", ".tiff")]
    if not photos:
        sys.exit(f"No photos in {src_dir}")

    for p in photos:
        print(f"\n{p.name}")
        stem, w, h, ratio, made = process(p, out_dir)
        print(f"  source {w}x{h}")
        for fmt in ("avif", "webp", "jpg"):
            sizes = [(wd, s) for f, wd, s in made if f == fmt]
            if sizes:
                biggest = max(sizes)[1] / 1024
                print(f"  {fmt:5} {len(sizes)} sizes, largest {biggest:.0f}KB"
                      + ("   <- too heavy, drop the quality" if fmt != "jpg" and biggest > 180 else ""))
        widths = sorted({wd for f, wd, s in made if f == "avif"}) or \
                 sorted({wd for f, wd, s in made if f == "jpg"})
        (out_dir / f"{stem}.html").write_text(snippet(stem, ratio, widths))
        print(f"  markup -> {out_dir / (stem + '.html')}")

    print("\nDone. Paste the .html next to your hero and fill in the alt text.")

if __name__ == "__main__":
    main()
