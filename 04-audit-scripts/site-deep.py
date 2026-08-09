#!/usr/bin/env python3
"""
Website deep audit — link integrity, orphans, asset resolution, copy
consistency and the backend logic. The structural pass (audit.py) covers
markup and accessibility; this covers everything that is wrong while
being perfectly valid HTML.
"""
import glob, os, re, sys, json
from html.parser import HTMLParser

SITE = sys.argv[1] if len(sys.argv) > 1 else "potato-site"
BUGS, WARN, NOTE = [], [], []
def bug(f, m): BUGS.append((f, m))
def warn(f, m): WARN.append((f, m))
def note(f, m): NOTE.append((f, m))

pages = {os.path.basename(p): open(p).read()
         for p in glob.glob(os.path.join(SITE, "*.html"))
         if not os.path.basename(p).startswith("preview-")}


# ---------- 1. Links ----------
internal, external = {}, set()
for name, s in pages.items():
    for m in re.finditer(r'href="([^"]+)"', s):
        h = m.group(1)
        if h.startswith("http"): external.add(h)
        elif h.startswith("#") or h.startswith("mailto") or h.startswith("tel"): continue
        else: internal.setdefault(h.split("#")[0], set()).add(name)

for target, sources in sorted(internal.items()):
    if not target: continue
    if target not in pages and not os.path.exists(os.path.join(SITE, target)):
        bug(", ".join(sorted(sources)), f"links to {target}, which does not exist")


# ---------- 2. Orphans — the exact fault I criticised in the competitor ----------
linked = set()
for t in internal: linked.add(t)
for name in pages:
    # index is the root; 404 is served by the host on a miss and is
    # correctly linked from nowhere. Neither is an orphan.
    if name in ("index.html", "404.html"): continue
    if name not in linked:
        bug(name, "orphan — nothing on the site links to it. This is the fault "
                  "flagged in the competitor audit; it must not be ours too")


# ---------- 3. Anchors ----------
for name, s in pages.items():
    ids = set(re.findall(r'id="([^"]+)"', s))
    for m in re.finditer(r'href="#([^"]+)"', s):
        if m.group(1) and m.group(1) not in ids:
            bug(name, f"anchor #{m.group(1)} has no matching id on the page")


# ---------- 4. Assets ----------
for name, s in pages.items():
    for m in re.finditer(r'(?:src|href)="(assets/[^"]+)"', s):
        if not os.path.exists(os.path.join(SITE, m.group(1))):
            bug(name, f"references {m.group(1)}, which is missing")
    for m in re.finditer(r'<img[^>]+src="([^"]+)"', s):
        src = m.group(1)
        if not src.startswith("http") and not os.path.exists(os.path.join(SITE, src)):
            bug(name, f"image {src} is missing")


# ---------- 5. Metadata uniqueness — the other competitor fault ----------
#
# Parsed rather than pattern-matched. The first version assumed
# `name="description" content="..."` and every page here writes
# `content="..." name="description"`, so it reported eleven pages as
# having no description at all. That is the third false positive this
# tooling has produced by regexing HTML, and the last one.
def meta(html_text, key, val):
    for tag in re.finditer(r'<meta\b([^>]*)>', html_text):
        attrs = dict(re.findall(r'(\w[\w:-]*)\s*=\s*"([^"]*)"', tag.group(1)))
        if attrs.get(key) == val:
            return attrs.get("content")
    return None

def link_href(html_text, rel):
    for tag in re.finditer(r'<link\b([^>]*)>', html_text):
        attrs = dict(re.findall(r'(\w[\w:-]*)\s*=\s*"([^"]*)"', tag.group(1)))
        if attrs.get("rel") == rel:
            return attrs.get("href")
    return None

descs, titles, canons = {}, {}, {}
for name, s in pages.items():
    dv = meta(s, "name", "description")
    d = type("M", (), {"group": lambda self, n, v=dv: v})() if dv else None
    t = re.search(r'<title>([^<]*)</title>', s)
    cv = link_href(s, "canonical")
    c = type("M", (), {"group": lambda self, n, v=cv: v})() if cv else None
    if d: descs.setdefault(d.group(1), []).append(name)
    else: bug(name, "no meta description")
    if t: titles.setdefault(t.group(1), []).append(name)
    else: bug(name, "no title")
    if c: canons.setdefault(c.group(1), []).append(name)
    else: warn(name, "no canonical")

for d, ns in descs.items():
    if len(ns) > 1:
        bug(", ".join(ns), f"share one meta description — the exact fault found on the competitor site")
    if len(d) > 160: warn(ns[0], f"meta description is {len(d)} chars, over the 160 that display")
    if len(d) < 70: warn(ns[0], f"meta description is only {len(d)} chars")
for t, ns in titles.items():
    if len(ns) > 1: bug(", ".join(ns), "share one title")
for c, ns in canons.items():
    if len(ns) > 1: bug(", ".join(ns), f"share canonical {c}")


# ---------- 6. Copy consistency — the competitor's contradictory stats ----------
stats = {}
for name, s in pages.items():
    text = re.sub(r'<[^>]+>', ' ', s)
    for m in re.finditer(r'\b(\d[\d,]*\+?)\s*(leads?|brokerages?|agents?|enquir\w+|seconds?|minutes?)', text, re.I):
        key = m.group(2).lower().rstrip("s")
        stats.setdefault(key, {}).setdefault(m.group(1), set()).add(name)

for unit, values in stats.items():
    if len(values) > 1:
        detail = "; ".join(f"{v} on {', '.join(sorted(ns))}" for v, ns in values.items())
        warn("(across pages)", f"different figures for '{unit}': {detail} — check they are meant to differ")


# ---------- 7. Placeholders that must not ship ----------
for name, s in pages.items():
    for pat, why in [(r'lorem ipsum', "placeholder latin"),
                     (r'TODO|FIXME|XXX', "a developer note"),
                     (r'example\.com', "an example domain"),
                     (r'\[insert', "an unfilled bracket")]:
        if re.search(pat, s, re.I):
            bug(name, f"contains {why} in the shipped page")
    # Deliberate pending markers are fine — they are visible and gated.
    n = len(re.findall(r'class="pending"', s))
    if n: note(name, f"{n} pending marker(s) — visible on purpose, blocks launch until filled")


# ---------- 8. The backend ----------
back = {p: open(p).read() for p in glob.glob("potato-backend/src/**/*.ts*", recursive=True)}
for p, s in back.items():
    b = os.path.basename(p)
    if "rate-limit" in b:
        if "evict" not in s and "delete" not in s:
            bug(b, "rate limiter with no eviction — the map grows without bound")
    if "spam" in b:
        if "timingSafeEqual" not in s and "turnstile" in s.lower():
            note(b, "token comparison — confirm it is constant-time")
    if "route.ts" in p and "POST" in s:
        if "rateLimit" not in s and "limit" not in s:
            bug(b, "public POST route with no rate limiting")
    if re.search(r'\.json\(\)', s) and "try" not in s:
        warn(b, "response parsed without a try/catch")

# Validation must be the same schema on both sides, or the client accepts
# what the server rejects.
client = [s for p, s in back.items() if p.endswith(".tsx")]
server = [s for p, s in back.items() if "/api/" in p]
if client and server:
    if not any("validation" in s or "schema" in s for s in client):
        bug("demo-form.tsx", "client does not import the shared schema — two sources of truth")


if __name__ == "__main__":
    print(f"{len(pages)} pages, {len(back)} backend files\n")
    for label, items in (("BUG", BUGS), ("WARNING", WARN), ("NOTE", NOTE)):
        seen, out = set(), []
        for f, m in items:
            if (f, m[:60]) in seen: continue
            seen.add((f, m[:60])); out.append((f, m))
        print(f"{'='*64}\n{len(out)} {label}{'S' if len(out)!=1 else ''}\n{'='*64}")
        for f, m in out: print(f"  {f}\n    {m}\n")
    sys.exit(1 if BUGS else 0)
