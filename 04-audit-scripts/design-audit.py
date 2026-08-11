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
    # Comments are prose, not CSS.
    #
    # A stylesheet comment explaining *why* a rule exists will quote the
    # thing it is warning about — `var(--x)`, a hex value, a property
    # name — and every check below then reads the explanation as a
    # declaration. That is how a note reading "never write fill=var(--x)"
    # came back as "var() used but never defined: --x": the audit found
    # the fault in the sentence describing the fault.
    #
    # Stripped once, here, so no individual check has to remember. The
    # same class of bug has now been fixed in ux-audit.py, and it is
    # worth stating the general rule: a matcher that reads comments
    # measures how well the code is explained, not what it does.
    css = "\n".join(re.sub(r'/\*.*?\*/', '', v, flags=re.S) for v in files.values())

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

# ---------------------------------------------------------------------
# A Tailwind utility naming a token that @theme inline never exposes.
#
# Tailwind v4 derives utility names from the token names in
# `@theme inline`. A colour declared in tokens.css and not mapped there
# produces **no CSS at all** for `text-x` or `border-x` — no error, no
# warning, the element simply renders with no colour and looks almost
# right, which is the worst way for a design system to fail.
#
# Three occurrences is why this is a check: `accent-type` and
# `accent-edge` were used 42 times before anybody noticed, and
# `rule-strong` was caught while writing the autonomy picker.
# ---------------------------------------------------------------------
for _root in TARGETS:
    _globals = os.path.join(_root, "src/styles/globals.css")
    _tokens = os.path.join(_root, "src/styles/tokens.css")
    if not (os.path.exists(_globals) and os.path.exists(_tokens)):
        continue

    _mapped = set(re.findall(r"--color-([a-z0-9-]+):", open(_globals).read()))
    _declared = set(re.findall(r"^\s*--([a-z0-9-]+):\s*#", open(_tokens).read(), re.M))

    # Every double-quoted string in the file, not only `className="…"`.
    # Most class lists in this codebase are arguments to `cn()`, and the
    # first version of this check read none of them — it found nothing
    # and passed, which is the failure it exists to catch, in itself.
    _used = set()
    for _f in ours(glob.glob(os.path.join(_root, "src/**/*.tsx"), recursive=True)):
        for _m in re.finditer(r'"([^"\n]+)"', open(_f).read()):
            for _c in _m.group(1).split():
                # Strip variant prefixes — `hover:border-rule-strong`
                # needs the same token mapped as the bare utility.
                _bare = _c.split(":")[-1]
                _hit = re.fullmatch(
                    r"(?:text|bg|border|ring|fill|stroke|decoration|outline|shadow)-([a-z0-9-]+)",
                    _bare)
                if _hit:
                    _used.add(_hit.group(1))

    for _t in sorted((_used & _declared) - _mapped):
        FAIL.append(f"{_root}: `{_t}` is a token in tokens.css and is used as a "
                    f"Tailwind utility, but @theme inline never maps it — that "
                    f"utility generates no CSS at all")

print(f"\n{'='*62}\n{len(FAIL)} FAILURE(S) · {len(WARN)} WARNING(S)\n{'='*62}")
for f in FAIL: print(f"  x {f}")
for w in WARN: print(f"  ! {w}")
sys.exit(1 if FAIL else 0)
