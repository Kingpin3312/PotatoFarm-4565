#!/usr/bin/env python3
"""
UX audit. Things that break for a person, not for a compiler.
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


ROOT = sys.argv[1] if len(sys.argv) > 1 else "potato-crm"
ISSUES, NOTES = [], []
def issue(f, m): ISSUES.append((f, m))
def note(f, m): NOTES.append((f, m))

files = {p: open(p).read() for p in
         ours(glob.glob(f"{ROOT}/src/**/*.tsx", recursive=True)) +
         ours(glob.glob(f"{ROOT}/mobile/**/*.tsx", recursive=True))}

for p, s in files.items():
    b = os.path.basename(p)

    # 1. iOS zooms the whole page when an input under 16px is focused.
    #    An agent typing a reply on a phone watches the layout jump.
    for m in re.finditer(r'<(?:input|textarea|select)\b[^>]*', s, re.S):
        tag = m.group(0)
        size = re.search(r'text-\[(\d+)px\]|fontSize:\s*(\d+)', tag)
        cls = re.search(r'className="([^"]*)"', tag)
        ctx = cls.group(1) if cls else ""
        px = re.search(r'text-\[(\d+)px\]', ctx)
        if px and int(px.group(1)) < 16:
            issue(b, f"input at {px.group(1)}px — iOS zooms the page on focus below 16px")

    # 2. A dialog that opens without moving focus strands a keyboard or
    #    screen-reader user behind it.
    # Native showModal focuses the first focusable descendant, which is
    # rarely the right thing — it can land somebody on a destructive
    # button, and it never announces what the dialog is. What we want is
    # focus on the dialog with an aria-labelledby pointing at its
    # heading.
    # `showModal()` with the parentheses, not the bare word. The bare
    # word matched a comment in shell.tsx explaining why that component
    # deliberately does *not* use showModal, and reported the file for
    # the thing it had just been written to avoid. A dialog being opened
    # is always a call.
    if "showModal()" in s:
        labelled = "aria-labelledby" in s or "aria-label" in s
        focused = re.search(r'showModal\(\)[^}]{0,80}focus\(\)', s) or "autoFocus" in s
        if not (labelled and focused):
            issue(b, "dialog opens without both a label and focus moved into it")

    # 3. Escape must close a dialog. <dialog> gives this free; a div does not.
    if "role=\"dialog\"" in s and "Escape" not in s:
        issue(b, "custom dialog with no Escape handler")

    # 4. An empty list with no explanation reads as broken.
    if ("FlatList" in s or ".map(" in s) and "Empty" not in s and "empty" not in s and "length === 0" not in s:
        note(b, "list with no empty state")

    # 5. Destructive actions need confirmation or undo.
    for word in ("Delete", "Remove", "Erase"):
        if f">{word}" in s and "confirm" not in s.lower() and "dialog" not in s.lower():
            issue(b, f"'{word}' action with no confirmation")

    # 6. Colour alone carrying meaning.
    # Colour alone is only a problem when nothing says the same thing in
    # words. The first version looked for an aria attribute and missed
    # the visible label sitting next to it — "Ready", "Blocked", "Reply
    # window closed" were all present and all reported as failures.
    for m in re.finditer(r'text-(danger|success|accent)\b', s):
        window = s[max(0, m.start()-300):m.start()+300]
        has_words = re.search(r'>[A-Z][a-z]{2,}|aria-label|sr-only|role="alert"', window)
        if not has_words:
            note(b, "state shown by colour with no words alongside")

    # 7. Tap targets in web components.
    for m in re.finditer(r'min-h-\[(\d+)px\]|minHeight:\s*(\d+)', s):
        v = int(m.group(1) or m.group(2))
        if 0 < v < 44:
            issue(b, f"tap target {v}px — under the 44px minimum")

# 8. First run. The most-seen screen in the product's life and the least
#    designed, because it only appears once per customer.
today = files.get(f"{ROOT}/mobile/app/(tabs)/index.tsx", "")
# Looked for the substring "first", which matches "firstName" and
# reported the screen as handled. Look for the state instead.
if today and "everActive" not in today and "firstRun" not in today:
    issue("Today", "no first-run state — a new agent sees 'Nothing is waiting on you' "
                   "with no idea whether that is good, broken, or not set up yet")

# 9. Permission asked at the right moment.
push = files.get(f"{ROOT}/mobile/lib/push.ts", "") or open(f"{ROOT}/mobile/lib/push.ts").read()
if "requestPermissions" in push:
    root = files.get(f"{ROOT}/mobile/app/_layout.tsx", "")
    if "registerForPush" in root:
        issue("_layout.tsx", "push permission requested at launch — before the agent knows "
                             "what the app is for. On iOS a denial is close to permanent")

# A Button variant that does not exist, and a bespoke class with no rule.
#
# `variant="ghost"` was used fourteen times and was never one of the
# five defined variants — every one would have rendered unstyled. The
# markup is correct, the value is not, and nothing else here could see
# it.
import glob as _g, re as _re, os as _os


_btn = _os.path.join(ROOT, "src/components/ui/button.tsx")
if _os.path.exists(_btn):
    _m = _re.search(r'variant:\s*\{(.*?)\n      \}', open(_btn).read(), _re.S)
    _defined = set(_re.findall(r'^\s+(\w+):', _m.group(1), _re.M)) if _m else set()
    for _f in _g.glob(_os.path.join(ROOT, "src/**/*.tsx"), recursive=True):
        for _v in set(_re.findall(r'variant="(\w+)"', open(_f).read())):
            if _defined and _v not in _defined:
                issue(_os.path.basename(_f),
                      f'uses variant="{_v}" — defined are '
                      f'{", ".join(sorted(_defined))}')

_css_path = _os.path.join(ROOT, "src/styles/globals.css")
if _os.path.exists(_css_path):
    _css = open(_css_path).read()
    _TW = _re.compile(r'^(flex|grid|text|bg|border|rounded|p|px|py|m|mt|mb|ml|mr|mx|my|w|h|min'
                      r'|max|gap|items|justify|font|leading|tracking|space|overflow|shrink|grow'
                      r'|basis|sr|hover|focus|aria|accent|size|animate|decoration|whitespace'
                      r'|inline|block|absolute|relative|sticky|fixed|top|bottom|left|right|z'
                      r'|opacity|cursor|select|pointer|transition|duration|ease|shadow|ring'
                      r'|outline|col|row|self|place|object|truncate|line|list|order|divide|not'
                      r'|no|resize|snap|scroll|backdrop|caret|appearance)-')
    _used = set()
    for _f in _g.glob(_os.path.join(ROOT, "src/**/*.tsx"), recursive=True):
        for _m2 in _re.finditer(r'className="([^"{]+)"', open(_f).read()):
            _used |= set(_m2.group(1).split())
    for _c in sorted(_used):
        if _re.fullmatch(r'[a-z]+(-[a-z]+)+', _c) and not _TW.match(_c) and f".{_c}" not in _css:
            issue("globals.css", f"class '{_c}' is used in markup with no CSS rule")


# The top nav has drifted past seven items three separate times, each
# time because a new screen looked like it belonged there. The rule is
# written in the file and gets broken anyway, so it is a check now.
#
# Seven is the ceiling: a bar an agent scans between viewings, not a
# site map.
_shell = _os.path.join(ROOT, "src/components/layout/shell.tsx")
if _os.path.exists(_shell):
    _sb = open(_shell).read()
    if "const NAV = [" in _sb:
        _nav = _sb.split("const NAV = [")[1].split("];")[0]
        _items = _re.findall(r'label: "([\w ]+)"', _nav)
        if len(_items) > 7:
            issue("shell.tsx",
                  f"{len(_items)} top-level nav items ({', '.join(_items)}) — "
                  f"seven is the ceiling; the rest belong under Settings")


if __name__ == "__main__":
    print(f"{len(files)} screens and components\n")
    for label, items in (("ISSUE", ISSUES), ("NOTE", NOTES)):
        seen, out = set(), []
        for f, m in items:
            if (f, m[:50]) in seen: continue
            seen.add((f, m[:50])); out.append((f, m))
        print(f"{'='*62}\n{len(out)} {label}{'S' if len(out)!=1 else ''}\n{'='*62}")
        for f, m in out: print(f"  {f}\n    {m}\n")
    sys.exit(1 if ISSUES else 0)
