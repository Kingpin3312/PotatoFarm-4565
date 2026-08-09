#!/usr/bin/env python3
"""
Design audit.

Not taste — drift. A design system is only a system while everything
uses it, and it decays one hardcoded value at a time. Every finding
here is countable.
"""
import glob, os, re, sys

# ---------------------------------------------------------------------
# Skip anything that is not ours.
#
# Every recursive glob in this suite was written when `node_modules` did
# not exist, because nothing had ever been installed. The moment it did,
# the checks started reading dependencies: the contrast check failed six
# times on ag-Grid colours inside Prisma Studio's bundled stylesheet.
#
# A check that reports a dependency's CSS as a brand violation is a check
# nobody runs twice.
# ---------------------------------------------------------------------
_SKIP = ("node_modules", "/.next/", "/dist/", "/build/", "/__pycache__/", "/.git/")


def ours(paths):
    """Filter a glob result down to this project's own files."""
    return [p for p in paths if not any(s in p.replace(os.sep, "/") for s in _SKIP)]

from collections import Counter



TARGETS = sys.argv[1:] or ["potato-design-v3", "potato-launch", "potato-crm"]
FAIL, WARN = [], []

def scan(label, files, html_files=None):
    css = "\n".join(files.values())

    # Strip the token block itself — a definition is not drift.
    body = re.sub(r':root\s*\{.*?\n\s*\}', '', css, flags=re.S)
    body = re.sub(r'\.(on-dark|on-light|theme-\w+)\s*\{.*?\n\s*\}', '', body, flags=re.S)

    print(f"\n{'='*62}\n{label}\n{'='*62}")

    # 0. A var() with no definition.
    #
    #    Resolves to nothing, renders as an inherited or default colour,
    #    and is invisible in review. A tidy-up that consolidates literals
    #    into tokens is exactly when this happens — I did it to two
    #    colours in one pass and only caught it by checking.
    used = set(re.findall(r'var\((--[\w-]+)\)', css))
    defined = set(re.findall(r'(--[\w-]+)\s*:', css))
    orphans = sorted(used - defined)
    if orphans:
        FAIL.append(f"{label}: var() used but never defined: {', '.join(orphans[:6])}")
        print(f"  UNDEFINED TOKENS: {', '.join(orphans[:6])}")

    # 0b. A class in the markup with no rule anywhere.
    #
    #     Renders as unstyled and looks *almost* right, which is why it
    #     survives. Caught here after a palette swap remapped every
    #     `theme-navy` to `on-leather` in the HTML while the CSS edit
    #     failed silently — ten pages referencing two classes that did
    #     not exist, and every other check passed.
    #
    #     Utility-first frameworks would drown this in noise, so it only
    #     runs where the stylesheet is hand-written.
    if html_files and not any("tailwind" in c.lower() for c in files.values()):
        used_cls = {c for g in re.findall(r'class="([a-z][\w -]*)"', "\n".join(html_files.values()))
                    for c in g.split()}
        defined_cls = set(re.findall(r'\.([a-zA-Z][\w-]*)\s*[,{ :]', css))
        orphan_cls = sorted(c for c in used_cls - defined_cls if len(c) > 2)
        if orphan_cls:
            FAIL.append(f"{label}: class in markup with no CSS rule: {', '.join(orphan_cls[:6])}")
            print(f"  CLASSES WITH NO RULE: {', '.join(orphan_cls[:6])}")

    # 1. Colour literals outside the token block.
    # Not preceded by '&' — `&#9679;` is an HTML entity for a bullet,
    # not a colour, and the first version reported it six times.
    hexes = Counter(m.group(0).lower() for m in
                    re.finditer(r'(?<!&)#[0-9a-fA-F]{3,8}\b', body))
    if hexes:
        print(f"  {sum(hexes.values())} hardcoded colour(s) outside the tokens:")
        for h, n in hexes.most_common(6):
            print(f"    {h}  x{n}")
        if sum(hexes.values()) > 12:
            FAIL.append(f"{label}: {sum(hexes.values())} hardcoded colours — the palette is "
                        f"no longer one file")
        else:
            WARN.append(f"{label}: {sum(hexes.values())} hardcoded colours")
    else:
        print("  colours: all via tokens")

    # 2. Type scale. Every size should come from the seven defined steps.
    sizes = Counter(m.group(1) for m in re.finditer(r'font-size:\s*([\d.]+(?:rem|px))', body))
    print(f"\n  {len(sizes)} distinct font sizes")
    if len(sizes) > 12:
        FAIL.append(f"{label}: {len(sizes)} font sizes for a 7-step scale")
        for s, n in sizes.most_common(8):
            print(f"    {s:9} x{n}")
    elif len(sizes) > 7:
        WARN.append(f"{label}: {len(sizes)} font sizes, scale defines 7")
        print("    " + ", ".join(f"{s}({n})" for s, n in sizes.most_common(10)))

    # 3. Radii. Three defined; more means somebody eyeballed one.
    radii = Counter(m.group(1) for m in re.finditer(r'border-radius:\s*([\d.]+px)', body))
    print(f"\n  {len(radii)} distinct border radii: " +
          ", ".join(f"{r}({n})" for r, n in radii.most_common()))
    if len(radii) > 4:
        WARN.append(f"{label}: {len(radii)} radii for a 3-step scale")

    # 4. Weights. More than three and the hierarchy is being carried by
    #    weight instead of by size and space, which reads as noisy.
    weights = Counter(m.group(1) for m in re.finditer(r'font-weight:\s*(\d{3})', body))
    print(f"\n  weights: " + ", ".join(f"{w}({n})" for w, n in sorted(weights.items())))
    if len(weights) > 3:
        WARN.append(f"{label}: {len(weights)} font weights")
    if "700" in weights and "800" in weights:
        WARN.append(f"{label}: both 700 and 800 — pick one")

    # 5. Spacing. A rhythm, or arbitrary numbers.
    pads = Counter(m.group(1) for m in re.finditer(r'(?:padding|margin|gap):\s*([\d.]+px)', body))
    odd = [v for v in pads if int(float(v[:-2])) % 2 and float(v[:-2]) > 6]
    if odd:
        print(f"\n  odd-numbered spacing (breaks a 2px rhythm): {', '.join(sorted(odd)[:8])}")
        if len(odd) > 6:
            WARN.append(f"{label}: {len(odd)} odd spacing values")

def scan_html(label, files):
    inline = sum(len(re.findall(r'style="[^"]{20,}"', s)) for s in files.values())
    print(f"\n  {inline} inline style attribute(s) over 20 chars")
    if inline > 25:
        FAIL.append(f"{label}: {inline} long inline styles — these are the values that "
                    f"never make it into the stylesheet and never get fixed")
    elif inline > 10:
        WARN.append(f"{label}: {inline} long inline styles")

for t in TARGETS:
    css = {p: open(p).read() for p in ours(glob.glob(f"{t}/**/*.css", recursive=True))}
    html = {p: open(p).read() for p in glob.glob(f"{t}/*.html")
            if "preview" not in os.path.basename(p)}
    # Styles inside <style> blocks count as CSS.
    for p, s in html.items():
        for m in re.finditer(r'<style>(.*?)</style>', s, re.S):
            css[p + "#style"] = m.group(1)
    if not css: continue
    scan(t, css, html)
    if html: scan_html(t, html)

print(f"\n{'='*62}\n{len(FAIL)} FAILURE(S) · {len(WARN)} WARNING(S)\n{'='*62}")
for f in FAIL: print(f"  x {f}")
for w in WARN: print(f"  ! {w}")
sys.exit(1 if FAIL else 0)
