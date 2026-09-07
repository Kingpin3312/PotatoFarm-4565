#!/usr/bin/env python3
"""
Claims audit.

The question no other check asks: **does the website promise anything
the product cannot do?**

Correctness checks ask whether the code works. Security checks ask
whether it leaks. Nothing asked whether the marketing is true — and the
homepage was attributing four hard performance figures to a pilot
brokerage that does not exist.
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


SITE = sys.argv[1] if len(sys.argv) > 1 else "potato-launch"
CODE = sys.argv[2] if len(sys.argv) > 2 else "potato-crm"
FAILS, WARNS = [], []

pages = {os.path.basename(p): open(p).read()
         for p in glob.glob(f"{SITE}/*.html") if "preview" not in p}
src = "\n".join(open(p).read() for p in
                ours(glob.glob(f"{CODE}/src/**/*.ts*", recursive=True)))

# 1. A performance figure attributed to a customer, when there are none.
#
#    This is the one that matters. An invented statistic on a live page
#    is not a bug, it is a claim the company cannot stand behind — and
#    the first brokerage owner who asks "which brokerage?" ends the
#    meeting.
CUSTOMER_WORDS = ("pilot brokerage", "our customers", "clients report", "on average our")
for name, html in pages.items():
    body = re.search(r"<main.*?</main>", html, re.S)
    if not body: continue
    text = re.sub(r"<[^>]+>", " ", body.group(0)).lower()
    figures = re.findall(r"\b\d+(?:\.\d+)?%|\b\d+h \d+m|\+\d+%|\b\d+s\b", text)
    figures = [f for f in figures if f not in ("5%",)]   # VAT is a fact
    attributed = any(w in text for w in CUSTOMER_WORDS)
    if figures and attributed:
        FAILS.append(f"{name}: performance figures {sorted(set(figures))} attributed to a "
                     f"customer. Confirm that customer exists and consented.")
    elif figures:
        WARNS.append(f"{name}: unattributed figures {sorted(set(figures))} — where are they from?")

# 2. A capability named on the site with no code behind it.
CAPS = {
    "trakheesi": "permit",
    "sanctions": "screening",
    "append-only": "REVOKE",
    "24 hours": "messagingWindow",
    "erasure|delete your data|deletion": "erase",
}
for claim, marker in CAPS.items():
    on_site = [n for n, h in pages.items() if re.search(claim, h, re.I)]
    if on_site and marker.lower() not in src.lower():
        FAILS.append(f"'{claim}' claimed on {len(on_site)} page(s) with no '{marker}' in the code")

# 3. Certifications. The one nobody should ever fudge.
for name, html in pages.items():
    for badge in ("SOC 2", "ISO 27001", "PCI DSS certified", "GDPR certified"):
        if badge.lower() in html.lower() and "we hold none" not in html.lower():
            FAILS.append(f"{name}: claims {badge}. Do we hold it, in writing?")

# 4. One name per concept, across all three surfaces.
#
#    The reply window had three names and the stop control had four —
#    and two of those four are different features. An agent told about
#    "the stop button" who then finds a "kill switch" and a "mute" has
#    to work out which is which in the moment they most need to be sure.
import itertools
web = "\n".join(open(p2).read() for p2 in ours(glob.glob(f"{CODE}/src/app/**/*.tsx", recursive=True)))
mob = "\n".join(open(p2).read() for p2 in ours(glob.glob(f"{CODE}/mobile/**/*.tsx", recursive=True)))
site_all = "\n".join(pages.values())

ONE_NAME = {
    "the reply window": ["reply window", "messaging window"],
    "stopping everything": ["stop everything", "kill switch"],
}
for concept, variants in ONE_NAME.items():
    seen = {v for v in variants
            for body in (site_all, web, mob)
            if re.search(rf"\b{re.escape(v)}\b", body, re.I)}
    if len(seen) > 1:
        FAILS.append(f"'{concept}' is called {sorted(seen)} across surfaces — pick one")


# A price with no overage rate beside it.
#
# The code charges 35 fils past the allowance and the site never said
# so — a brokerage would meet it on an invoice. Stating a price while
# omitting what it does not cover is the failure mode this file exists
# to catch.
import glob as _g, re as _re, os as _os


for _f in _g.glob(_os.path.join(SITE, "*.html")):
    if "preview" in _os.path.basename(_f):
        continue
    _b = open(_f).read()
    if "$70" in _b and not _re.search(r'\d+\s*fils', _b):
        FAILS.append(f"{_os.path.basename(_f)} states the price with no overage rate")


if __name__ == "__main__":
    print(f"{len(pages)} pages checked against the codebase\n")
    print(f"{'='*62}\n{len(FAILS)} FAILURE(S)\n{'='*62}")
    for f in FAILS: print(f"  x {f}")
    print(f"\n{'='*62}\n{len(WARNS)} WARNING(S)\n{'='*62}")
    for w in WARNS: print(f"  ! {w}")
    sys.exit(1 if FAILS else 0)
