#!/usr/bin/env python3
"""
Interface language and direction — the checks that catch a half-done
translation.

Arabic support fails in three ways, and only one of them is visible to
somebody reading English screens:

**A key with no translation.** `tsc` catches this today, because `ar.ts`
is typed `Record<MessageKey, string>`. It is checked here as well because
the type is one `as any` away from silence, and because this script is
what CI runs against a tree it has not compiled.

**A physical direction class.** `ml-2` is "margin-left" in every
language. Set `dir="rtl"` on the document and the text flows one way
while the spacing stays put — a layout that is subtly wrong everywhere
and obviously wrong nowhere. The logical spellings (`ms-`, `me-`, `ps-`,
`pe-`, `border-s-`, `border-e-`, `start-`, `end-`) follow the document's
direction, which is the whole point of setting it in one place.

**A key nothing reads.** The same failure this codebase has now found ten
times in other shapes: eleven routers written and none mounted, a
rate-limit rule invoked by nothing, an alerting system ending in
`log.warn`. A catalogue entry no screen renders is that shape again, and
it is worth catching for the reason the others were — it means a string
was translated and the screen still shows English.

## What this deliberately does not check

**Whether the Arabic is *good*.** It cannot. `ar.ts` says so at the top:
the strings have not been read by a native speaker, and no script can
substitute for that. What this can prove is that they are complete,
reachable, and rendered in a document that knows which way it runs.

**Hardcoded English in screens not yet converted.** Stage 1 converted the
frame — the layout, the shell, the nav lists, the palette. Flagging every
remaining literal across 43 screens would be 350 failures on a tree where
that is the known, stated position, and a check that is red for a reason
everybody already knows is a check people learn to skip. It becomes a
failure when the screens are converted, and `CONVERTED` below is the list
that grows.

    python3 04-audit-scripts/i18n.py <repo-root>
"""
import os, re, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
APP = os.path.join(ROOT, "02-the-project", "app")
SRC = os.path.join(APP, "src")
FAILS, NOTES = [], []


def read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def walk(root, exts=(".ts", ".tsx")):
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ("node_modules", ".next", "dist")]
        for f in sorted(files):
            if f.endswith(exts):
                yield os.path.join(base, f)


# ---------------------------------------------------------------------
# 1. The catalogues agree.
# ---------------------------------------------------------------------
KEY = re.compile(r'^\s{2}"([^"]+)":', re.M)

en_src = read(os.path.join(SRC, "lib", "i18n", "en.ts"))
ar_src = read(os.path.join(SRC, "lib", "i18n", "ar.ts"))

if not en_src or not ar_src:
    print("i18n audit\n\n  x cannot read src/lib/i18n — wrong path?\n")
    sys.exit(1)

en_keys = KEY.findall(en_src)
ar_keys = KEY.findall(ar_src)

for dupe in {k for k in en_keys if en_keys.count(k) > 1}:
    FAILS.append(f"en.ts declares '{dupe}' twice — the second wins silently")

en_set, ar_set = set(en_keys), set(ar_keys)
for missing in sorted(en_set - ar_set):
    FAILS.append(f"ar.ts has no translation for '{missing}'")
for extra in sorted(ar_set - en_set):
    FAILS.append(f"ar.ts translates '{extra}', which en.ts does not define")

# A value identical in both catalogues is usually a forgotten string —
# but not always: a language's own name is deliberately the same in
# every catalogue so somebody stranded in the wrong one can find their
# way out. Those are the two `settings.language.<code>` entries.
VALUE = re.compile(r'^\s{2}"([^"]+)":\s*\n?\s*"([^"]*)"', re.M)
ENDONYMS = {"settings.language.en", "settings.language.ar"}
en_values = dict(VALUE.findall(en_src))
ar_values = dict(VALUE.findall(ar_src))
for key, value in sorted(en_values.items()):
    if key in ENDONYMS or not value.strip():
        continue
    if ar_values.get(key) == value:
        FAILS.append(f"ar.ts leaves '{key}' in English: \"{value[:48]}\"")

# ---------------------------------------------------------------------
# 1b. Counted strings carry every form the language uses.
#
# `plural()` falls back to `other` for a category the catalogue omits,
# which is correct for English — it has no dual — and silently wrong for
# Arabic, where a missing `few` renders "١٣ نتائج" instead of "١٣ نتيجة".
# Nothing about that is visible from an English screen, and the fallback
# means it never throws. So the six are required by name.
#
# `en.ts` is checked only for `other`, because which categories a
# language has is a fact about the language and not a thing to enforce.
# ---------------------------------------------------------------------
ARABIC_CATEGORIES = {"zero", "one", "two", "few", "many", "other"}
PLURAL_BLOCK = re.compile(r'"([\w.]+)":\s*\{(.*?)\}', re.S)

for name, src, required in (
    ("enPlurals", en_src, {"other"}),
    ("arPlurals", ar_src, ARABIC_CATEGORIES),
):
    # Only the plural export, not the message table above it.
    marker = f"export const {name}"
    if marker not in src:
        FAILS.append(f"{name} is not exported — counted strings have no catalogue")
        continue
    body = src.split(marker, 1)[1]
    # Blank the *values* before matching braces. The forms contain `{n}`
    # — that is the whole point of them — so a naive `\{(.*?)\}` stops
    # inside the first placeholder and reports the categories after it as
    # missing. Keys stay, because they are what is being counted.
    body = re.sub(r':\s*"[^"]*"', ': ""', body)
    for key, forms in PLURAL_BLOCK.findall(body):
        present = set(re.findall(r"(\w+)\s*:", forms))
        for missing in sorted(required - present):
            FAILS.append(
                f"{name}['{key}'] has no '{missing}' form"
                + (" — it will silently fall back to `other`" if missing != "other" else "")
            )

# ---------------------------------------------------------------------
# 2. Every key is read by something, and everything read is defined.
# ---------------------------------------------------------------------
usage = {}
for path in walk(SRC):
    if "/lib/i18n/" in path.replace(os.sep, "/"):
        continue  # the catalogues are the definition, not a use
    body = read(path)
    for key in re.findall(r'"((?:nav|shell|palette|settings)\.[A-Za-z0-9.]+)"', body):
        usage.setdefault(key, []).append(os.path.relpath(path, ROOT))

for key in sorted(en_set):
    if key not in usage:
        FAILS.append(f"'{key}' is translated but nothing renders it")
for key in sorted(usage):
    if key not in en_set:
        where = usage[key][0]
        FAILS.append(f"{where} asks for '{key}', which no catalogue defines")

# ---------------------------------------------------------------------
# 3. No physical direction anywhere in src/.
#
# Zero-tolerance rather than a list of converted files, because a list is
# a second thing to keep in step and this codebase's documentation has
# already drifted three different ways. The escape hatch is per-line and
# has to say why.
# ---------------------------------------------------------------------
#
# The leading `-?` is the negative-margin case and it is not cosmetic:
# without it this pattern misses `-ml-4`, and the tree carried four of
# them while the check reported zero. A check with a hole in it is worse
# than no check, because it is read as evidence.
#
# `ml`, `pl`, `left` and friends must carry a value. A bare `left` is the
# English word — "3 days left", "left in the pool" — and matching it made
# the first version of the conversion rewrite prose into nonsense that
# still compiled.
#
# The suffix on a spacing or inset utility is a *value*, not a word:
# a number, a fraction, `auto`/`full`/`px`/`screen`, or an arbitrary
# `[…]`. Spelling that out rather than accepting `[\w-]+` is what stops
# the check reading English out of a string literal — `"right-to-left"`
# in a test name was flagged as a class, and the only fix a reader has
# for that is to make the prose worse.
#
# `border-l` and `rounded-r` take a colour or a width and may appear
# bare, so they keep the looser suffix.
_V = r"(?:\d+(?:\.\d+)?(?:\/\d+)?|auto|full|px|screen|min|max|fit|\[[^\]]*\])"
_C = r"[\w./%\[\]()-]+"
PHYSICAL = re.compile(
    rf"""(?<![\w-])-?(
        m[lr]-{_V}                  | p[lr]-{_V} |
        border-[lr](?:-{_C})?       | rounded-[lr](?:-{_C})? |
        text-(?:left|right)         | float-(?:left|right) |
        space-x-{_V}                | divide-x(?:-{_C})? |
        (?:left|right)-{_V}
    )(?![\w-])""",
    re.X,
)

# ---------------------------------------------------------------------
# The check checks itself.
#
# This file has already been wrong twice in the direction that matters:
# it missed `-ml-4` entirely, and an earlier version flagged class names
# quoted inside explanatory comments. Both failures look identical from
# the outside — a green run — which is the failure mode this codebase
# keeps rediscovering under different names.
#
# So the pattern is asserted against cases before it is trusted against
# the tree. If somebody tightens or loosens it later, this is what tells
# them which.
# ---------------------------------------------------------------------
MUST_FLAG = ["ml-2", "-ml-4", "pl-[22px]", "border-l-accent", "border-l",
             "text-left", "left-0", "mr-1", "-mr-2", "rounded-r-lg",
             "ml-auto", "left-1/2", "pl-3.5", "-ml-[3px]", "pr-px"]
MUST_NOT_FLAG = ["ms-2", "-ms-4", "ps-3", "border-s-accent", "text-start",
                 "start-0", "rounded-lg", "border-rule", "overflow-x-auto",
                 "items-start", "justify-end", "inset-x-0",
                 # English prose that happens to live in a string.
                 "days left", "left in the pool", "usually right",
                 "right-to-left", "left-hand side", "top-right corner"]
SELF = [f"`{c}` should be flagged as physical and is not"
        for c in MUST_FLAG if not PHYSICAL.search(c)]
SELF += [f"`{c}` is flagged as physical and should not be"
         for c in MUST_NOT_FLAG if PHYSICAL.search(c)]
# Kept out of FAILS on purpose: a broken *check* is a different kind of
# problem from a failing *tree*, it exits 2 rather than 1, and reporting
# it as one of the tree's findings is how it would get fixed by editing
# the tree.
if SELF:
    print("i18n audit\n\n  the check itself is broken:\n")
    for f in SELF:
        print(f"    x {f}")
    print()
    sys.exit(2)
LOGICAL = {
    "ml": "ms", "mr": "me", "pl": "ps", "pr": "pe",
    "border-l": "border-s", "border-r": "border-e",
    "rounded-l": "rounded-s", "rounded-r": "rounded-e",
    "text-left": "text-start", "text-right": "text-end",
    "left": "start", "right": "end",
}


def suggest(cls):
    for physical, logical in LOGICAL.items():
        if cls == physical or cls.startswith(physical + "-"):
            return logical + cls[len(physical):]
    return None


def string_literals(line):
    """
    The quoted spans of a line, skipping comments.

    This codebase explains itself at length, and the explanations quote
    class names: `layout.tsx` documents that `ml-` is banned, and
    `listings/page.tsx` describes why a button is pushed to one side.
    A check that reads those as code reports a failure whose only
    available fix is to make the prose wrong — so it has to know the
    difference. `//` outside a quote ends the line; `/* */` is tracked
    across lines by the caller.
    """
    spans, i, n = [], 0, len(line)
    while i < n:
        c = line[i]
        if c == "/" and i + 1 < n and line[i + 1] == "/":
            break
        if c in "\"'`":
            quote, start = c, i + 1
            i += 1
            while i < n:
                if line[i] == "\\":
                    i += 2
                    continue
                if line[i] == quote:
                    break
                i += 1
            spans.append(line[start:i])
        i += 1
    return spans


physical_hits = 0
for path in walk(SRC):
    rel = os.path.relpath(path, ROOT)
    in_block = False
    for n, line in enumerate(read(path).splitlines(), 1):
        # Blank out the comment half of the line before looking at it.
        if in_block:
            if "*/" in line:
                in_block, code = False, line.split("*/", 1)[1]
            else:
                code = ""
        elif "/*" in line and "*/" not in line.split("/*", 1)[1]:
            in_block, code = True, line.split("/*", 1)[0]
        else:
            code = line

        if not code.strip() or "i18n: physical" in line:
            continue  # deliberate, and the line says why

        for chunk in string_literals(code):
            for hit in PHYSICAL.findall(chunk):
                cls = hit if isinstance(hit, str) else hit[0]
                physical_hits += 1
                fix = suggest(cls)
                FAILS.append(
                    f"{rel}:{n} uses `{cls}`"
                    + (f" — logical spelling is `{fix}`" if fix else "")
                )

# ---------------------------------------------------------------------
# 3b. The same rule in the stylesheets.
#
# Tailwind is most of the layout, but not all of it: `.skip` is
# hand-written CSS, and it positioned the skip link with `left`. In
# Arabic that put the first thing a keyboard user meets on the wrong
# edge of the screen — the one place where "subtly mirrored" is not a
# cosmetic problem.
# ---------------------------------------------------------------------
CSS_PHYSICAL = re.compile(
    r"(?<![\w-])("
    r"margin-(?:left|right)|padding-(?:left|right)|border-(?:left|right)"
    r"|(?:left|right)|text-align\s*:\s*(?:left|right)"
    r")\s*:",
    re.I,
)
CSS_LOGICAL = {
    "margin-left": "margin-inline-start", "margin-right": "margin-inline-end",
    "padding-left": "padding-inline-start", "padding-right": "padding-inline-end",
    "border-left": "border-inline-start", "border-right": "border-inline-end",
    "left": "inset-inline-start", "right": "inset-inline-end",
}
styles = os.path.join(SRC, "styles")
for path in walk(styles, exts=(".css",)):
    rel = os.path.relpath(path, ROOT)
    in_block = False
    for n, line in enumerate(read(path).splitlines(), 1):
        if in_block:
            if "*/" in line:
                in_block, code = False, line.split("*/", 1)[1]
            else:
                code = ""
        elif "/*" in line and "*/" not in line.split("/*", 1)[1]:
            in_block, code = True, line.split("/*", 1)[0]
        else:
            code = line
        if not code.strip() or "i18n: physical" in line:
            continue
        for prop in CSS_PHYSICAL.findall(code):
            physical_hits += 1
            key = prop.split(":")[0].strip().lower()
            fix = CSS_LOGICAL.get(key)
            FAILS.append(
                f"{rel}:{n} sets `{key}`"
                + (f" — logical property is `{fix}`" if fix else "")
            )

# ---------------------------------------------------------------------
# 4. The document declares its language and direction, from the locale.
# ---------------------------------------------------------------------
layout = read(os.path.join(SRC, "app", "layout.tsx"))
html_tag = re.search(r"<html[^>]*>", layout)
if not html_tag:
    FAILS.append("src/app/layout.tsx has no <html> element")
else:
    tag = html_tag.group(0)
    if "dir=" not in tag:
        FAILS.append("<html> carries no dir — Arabic would render left-to-right")
    if "lang=" not in tag:
        FAILS.append("<html> carries no lang")
    # Hardcoded values are the trap: `lang="en-GB" dir="ltr"` satisfies
    # "has a dir" and is wrong in exactly one language.
    if re.search(r'\b(?:lang|dir)="[a-z-]+"', tag):
        FAILS.append(
            "<html> hardcodes lang or dir — both must come from the resolved locale"
        )

# ---------------------------------------------------------------------
print("i18n audit\n")
files_using = {f for paths in usage.values() for f in paths}
print(f"  {len(en_set)} keys · 2 catalogues")
print(f"  {sum(len(v) for v in usage.values())} key uses across {len(files_using)} files")
print(f"  {physical_hits} physical direction class(es) in src/\n")

for note in NOTES:
    print(f"  · {note}")

if FAILS:
    # Forty is enough to act on and short enough to read in CI output.
    # `I18N_FULL=1` prints all of them, which is what you want when
    # working through a conversion rather than reading a regression.
    shown = FAILS if os.environ.get("I18N_FULL") else FAILS[:40]
    print(f"  {len(FAILS)} problem(s):\n")
    for f in shown:
        print(f"    x {f}")
    if len(FAILS) > len(shown):
        print(f"    … and {len(FAILS) - len(shown)} more")
    print()
    sys.exit(1)

print("  the interface is translatable and direction-neutral.\n")
