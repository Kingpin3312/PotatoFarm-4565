#!/usr/bin/env python3
"""
Money is formatted in one place.

CLAUDE.md states the rule and the reason: *"All money is `BigInt` fils,
formatted only by `lib/money.ts`. There were five formatters and two
assumed AED."* It was a rule in a document and nothing enforced it, so
two more had grown back:

  - `outreach.ts` built a property price by hand for a **WhatsApp message
    to a buyer** — the one place a formatting difference is read by
    somebody outside the company;
  - `aml/rules.ts` did the same for the Real Estate Activity Report
    reason, which an agent and a compliance officer both read beside
    figures the rest of the product formats properly.

Neither produced a wrong number today. That is exactly why a rule like
this needs a check rather than a comment: two formatters agreeing now is
not the same as one formatter, and the previous five agreed right up
until they did not.

## What counts as a violation

Turning fils into dirhams and formatting it: a `/ 100` next to a
`toLocaleString`, an `Intl.NumberFormat` with a currency, or a literal
"AED " built by string interpolation. `lib/money.ts` is where that is
allowed to happen.

Percentages, basis points and chart geometry also divide by a hundred and
are not money. They are excluded by looking for the currency alongside
the arithmetic rather than for the arithmetic on its own.
"""
import os
import re
import sys
import glob

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
SRC = os.path.join(ROOT, "src")

# The formatter itself, and the tests that check it.
ALLOWED = {"lib/money.ts"}

PATTERNS = [
    # A number turned into dirhams and printed in the same breath.
    (re.compile(r'AED[^`"\']{0,12}\$\{[^}]*(?:/\s*100|Number\()'), "a hand-built AED string"),
    (re.compile(r'Intl\.NumberFormat\([^)]*currency'), "a second currency formatter"),
    (re.compile(r'toLocaleString\([^)]*currency'), "a second currency formatter"),
]


def strip_comments(t):
    """Prose is not code — the same lesson `palette.py` and `erasure.py`
    both had to learn. Every one of these files explains the rule in a
    comment that necessarily contains the words it forbids."""
    t = re.sub(r"/\*.*?\*/", " ", t, flags=re.S)
    t = re.sub(r"^[ \t]*//.*$", " ", t, flags=re.M)
    return t


def main():
    if not os.path.isdir(SRC):
        print(f"  no source at {SRC}")
        return 1

    files = glob.glob(f"{SRC}/**/*.ts", recursive=True) + glob.glob(f"{SRC}/**/*.tsx", recursive=True)
    if not files:
        print("  no source files read — this run proved nothing")
        return 1

    bad = []
    for f in files:
        rel = os.path.relpath(f, SRC)
        if rel in ALLOWED or ".test." in rel:
            continue
        s = strip_comments(open(f).read())
        for pat, why in PATTERNS:
            for m in pat.finditer(s):
                bad.append((rel, s[: m.start()].count("\n") + 1, why, m.group(0)[:60]))

    print("Money\n")
    print(f"  {len(files)} source file(s) read, formatted by {', '.join(sorted(ALLOWED))}")

    if not bad:
        print("\n  one formatter.\n")
        return 0

    print(f"\n  {len(bad)} place(s) formatting money outside lib/money.ts:\n")
    for rel, line, why, snip in bad:
        print(f"    x {rel}:{line}  {why}")
        print(f"        {snip}")
    print(
        "\n  Use `aed`, `aedWhole` or `aedShort` from `@/lib/money`. Two\n"
        "  formatters agreeing today is not the same as one formatter —\n"
        "  there were five once, and two of them assumed AED.\n"
    )
    return 1


sys.exit(main())
