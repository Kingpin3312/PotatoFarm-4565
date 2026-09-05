#!/usr/bin/env python3
"""
Static responsive and robustness checks.

Important limitation, stated up front: this reasons about the CSS and the
markup. It does not render anything. It cannot tell you a layout looks
wrong on an iPhone SE — only that something in the code is likely to make
it wrong. Real device testing is not optional and this does not replace it.
"""
import glob, os, re, sys
from bs4 import BeautifulSoup

ISSUES, NOTES = [], []
def issue(m): ISSUES.append(m)
def note(m): NOTES.append(m)

# Narrowest common viewport in use. Everything has to survive this.
IPHONE_SE = 375
GUTTER = 24 * 2

def check_css(path):
    css = open(path).read()
    name = os.path.basename(path)

    # Fixed widths wide enough to overflow the smallest phone.
    for m in re.finditer(r'(?<!max-)(?<!min-)width:\s*(\d{3,})px', css):
        w = int(m.group(1))
        if w > IPHONE_SE - GUTTER:
            issue(f"{name}: fixed width:{w}px overflows a {IPHONE_SE}px viewport")

    # A `min-width` PROPERTY on an element is the usual cause of a
    # horizontal scrollbar. `@media (min-width: ...)` is the opposite —
    # mobile-first, and the reason a layout adapts at all.
    #
    # The first version matched both, so a correct mobile-first
    # breakpoint was reported as an overflow risk. Three of them, on a
    # stylesheet that has none.
    for m in re.finditer(r'(?<!@media)(?<!@media\s)(?<!@media\s\()min-width:\s*(\d{3,})px', css):
        # Walk back to the nearest brace or at-rule; if it is a media
        # query, this is a breakpoint rather than a fixed width.
        before = css[max(0, m.start() - 40):m.start()]
        if "@media" in before or "and (" in before:
            continue
        w = int(m.group(1))
        if w > IPHONE_SE - GUTTER:
            ctx = css[max(0, m.start() - 200):m.start()]
            scrollable = "overflow-x:auto" in ctx or "overflow-x: auto" in ctx
            if not scrollable:
                issue(f"{name}: min-width:{w}px with no scroll container")
            else:
                note(f"{name}: min-width:{w}px inside a scroll container (fine)")

    # 100vh is wrong on mobile browsers — the toolbar makes it lie.
    if re.search(r'height:\s*100vh', css):
        issue(f"{name}: uses 100vh. Use 100dvh, or the address bar clips it")

    # Fixed elements at the bottom need the safe area on notched phones.
    for m in re.finditer(r'\.([\w-]+)\s*\{[^}]*position:\s*fixed[^}]*\}', css):
        block = m.group(0)
        if re.search(r'bottom:\s*0', block) and "env(safe-area-inset-bottom)" not in block:
            issue(f"{name}: .{m.group(1)} is fixed to the bottom with no safe-area inset")

    # Breakpoint coverage.
    bps = sorted({int(x) for x in re.findall(r'max-width:\s*(\d+)px', css)})
    note(f"{name}: breakpoints {bps}")
    if bps and min(bps) > 480:
        note(f"{name}: no breakpoint below 480px — check the small phones by hand")


def check_html(path):
    name = os.path.basename(path)
    soup = BeautifulSoup(open(path).read(), "html.parser")

    vp = soup.find("meta", attrs={"name": "viewport"})
    if not vp:
        issue(f"{name}: no viewport meta")
    else:
        c = vp.get("content", "")
        if "user-scalable=no" in c or "maximum-scale=1" in c:
            issue(f"{name}: viewport blocks zoom (WCAG 1.4.4 failure)")
        if "viewport-fit=cover" not in c:
            note(f"{name}: no viewport-fit=cover — safe-area insets won't apply")

    # aria-modal without a focus trap is a promise to assistive tech that
    # the markup does not keep.
    for d in soup.find_all(attrs={"aria-modal": "true"}):
        note(f"{name}: aria-modal present — focus trap must be verified in JS")

    # Inline styles are where responsive bugs hide, because no breakpoint
    # can override them without !important.
    inline = [e for e in soup.find_all(style=True)
              if re.search(r'width:\s*\d{3,}px', e.get("style", ""))]
    for e in inline:
        issue(f"{name}: hardcoded pixel width in an inline style: {str(e)[:70]}")


def check_js(paths, root):
    """A trap only has to exist somewhere in the bundle, not in every file."""
    html = " ".join(open(f).read() for f in glob.glob(os.path.join(root, "*.html")))
    if 'aria-modal="true"' not in html:
        return
    bundle = " ".join(open(p).read() for p in paths)
    if "e.key !== 'Tab'" in bundle or '"Tab"' in bundle or "'Tab'" in bundle:
        note("focus trap present in the bundle")
    else:
        issue("a dialog is marked aria-modal but Tab is never intercepted "
              "— focus is not trapped")


if __name__ == "__main__":
    root = sys.argv[1]
    for f in sorted(glob.glob(os.path.join(root, "assets", "*.css"))):
        check_css(f)
    for f in sorted(glob.glob(os.path.join(root, "*.html"))):
        if f.count("preview-"):
            continue
        check_html(f)
    check_js(sorted(glob.glob(os.path.join(root, "assets", "*.js"))), root)

    print(f"\n{len(ISSUES)} issue(s)")
    for i in sorted(set(ISSUES)): print("  x", i)
    print(f"\n{len(set(NOTES))} note(s)")
    for n in sorted(set(NOTES)): print("  -", n)
    sys.exit(1 if ISSUES else 0)
