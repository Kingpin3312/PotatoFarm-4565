#!/usr/bin/env python3
"""
Change the accent colour everywhere it is declared, and nowhere it is
merely discussed.

    python3 03-brand/recolour.py '#C65A1E' '#FF5A00'          # report
    python3 03-brand/recolour.py '#C65A1E' '#FF5A00' --apply

## Why this is not find-and-replace

Every file below explains its own palette, and several of them name
colours that were *rejected*:

    "This used to be a four-step ramp — #E86A2C, #CF5A22, #B94E1F"
    "White on the brand orange is 3.22:1 and fails"

A blanket replace rewrites that history into a claim that the new colour
was one of the old ones, which is worse than leaving it alone: it is a
document that lies about how the decision was reached. So comment
regions are masked and only real declarations are touched.

## Why this lives in the repository

The accent has changed four times. The first three were done with a
script written in a scratch directory, and it was rewritten from nothing
each time because the container wiped it — three times, identically,
including the same bug twice.

**That bug is worth naming, because it is invisible.** The first version
applied `re.S` to the line-comment pattern as well as the block one, so
`^\\s*//.*$` matched a comment and then everything to the end of the
file. One comment near the top masked every declaration below it, and
the script reported "0 values to change" for files holding ninety
between them. A tool that silently finds nothing looks exactly like a
codebase that needs no change.

## What it does not touch

The logo. `03-brand/logo/mark.py` owns the mark's geometry and colour
and propagates it to 26 surfaces; run it after this, then
`03-brand/logo/build.mjs` to rebuild the rasters. `04-audit-scripts/
palette.py` then fails the build if a single warm value disagrees.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Everything that declares the accent outside the logo artwork. These
# are files rather than directories on purpose: a colour declaration is
# a deliberate thing in a known place, and a directory sweep here would
# reach the audit scripts, which name every colour the brand has ever
# rejected.
TARGETS = [
    "02-the-project/app/src/styles/tokens.css",
    "02-the-project/app/src/styles/globals.css",
    "02-the-project/app/src/components/brand/logo.tsx",
    "02-the-project/app/src/server/lib/mail.ts",
    "02-the-project/app/src/app/layout.tsx",
    "02-the-project/app/public/site.webmanifest",
    "02-the-project/website/site.webmanifest",
    "02-the-project/app/preview-mobile.html",
    "02-the-project/app/mobile/lib/theme.ts",
    "02-the-project/app/mobile/components/wordmark.tsx",
    "02-the-project/website/assets/site.css",
    "03-brand/design-system/dashboard-v4.html",
    "03-brand/design-system/homepage-v4.html",
    "03-brand/logo/mark.py",
    "03-brand/logo/build.mjs",
]


def comment_spans(text, ext):
    """Character ranges that are prose, so a colour inside one survives.

    Block patterns need DOTALL and line patterns must not have it. See
    the docstring: applying it to both is the bug that made this script
    report nothing, twice.
    """
    block = [r"/\*.*?\*/", r"<!--.*?-->"]
    line = [r"^[ \t]*//.*$"]
    if ext == ".py":
        block = [r'"""(?:.|\n)*?"""']
        line = [r"^[ \t]*#.*$"]

    spans = []
    for pat in block:
        spans += [(m.start(), m.end()) for m in re.finditer(pat, text, re.S)]
    for pat in line:
        spans += [(m.start(), m.end()) for m in re.finditer(pat, text, re.M)]
    return spans


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        print(__doc__)
        return 2
    old, new = args[0].upper(), args[1].upper()
    if not re.fullmatch(r"#[0-9A-F]{6}", old) or not re.fullmatch(r"#[0-9A-F]{6}", new):
        print("Both arguments must be six-digit hex, like '#C65A1E'.")
        return 2
    apply = "--apply" in sys.argv

    total, touched, missing = 0, [], []
    for rel in TARGETS:
        p = ROOT / rel
        if not p.exists():
            missing.append(rel)
            continue
        src = p.read_text(encoding="utf-8")
        spans = comment_spans(src, p.suffix)

        out, last, n = [], 0, 0
        for m in re.finditer(re.escape(old), src, re.I):
            if any(a <= m.start() < b for a, b in spans):
                continue
            out.append(src[last:m.start()])
            out.append(new)
            last = m.end()
            n += 1
        out.append(src[last:])

        if n:
            total += n
            touched.append((rel, n))
            if apply:
                p.write_text("".join(out), encoding="utf-8")

    print(f"\nRecolour  {old} -> {new}\n")
    for rel, n in touched:
        print(f"  {'wrote' if apply else 'would':<6} {rel:<52} {n}")

    # A target that has vanished is reported rather than skipped: this
    # list is how the script knows where colour lives, and a file that
    # moved is a surface that silently stops being recoloured.
    for rel in missing:
        print(f"  MISSING  {rel}")

    print(f"\n{total} declared value(s) across {len(touched)} file(s)"
          f"{'' if apply else '  — run again with --apply'}")
    if apply:
        print("\nNow run:  python3 03-brand/logo/mark.py --apply")
        print("          node 03-brand/logo/build.mjs")
        print("          python3 04-audit-scripts/palette.py .")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
