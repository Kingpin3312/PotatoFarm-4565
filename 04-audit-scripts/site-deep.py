#!/usr/bin/env python3
"""
Website deep audit — link integrity, orphans, asset resolution, copy
consistency and the backend logic. The structural pass (audit.py) covers
markup and accessibility; this covers everything that is wrong while
being perfectly valid HTML.
"""
import glob, os, re, sys, json

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

from html.parser import HTMLParser



SITE = sys.argv[1] if len(sys.argv) > 1 else "potato-site"
BUGS, WARN, NOTE = [], [], []
def bug(f, m): BUGS.append((f, m))
def warn(f, m): WARN.append((f, m))
def note(f, m): NOTE.append((f, m))

pages = {os.path.basename(p): open(p).read()
         for p in glob.glob(os.path.join(SITE, "*.html"))
         if not os.path.basename(p).startswith("preview-")}



# ---------- how the host resolves a path ----------
#
# The site links to `/product`, not `product.html`, because that is what
# every canonical tag and every sitemap entry says the page is. A static
# host only knows that because `_redirects` says so — so any check that
# asks "does this link go anywhere" has to read the routing table, not
# just the filesystem.
#
# The link check below did not, and reported all 144 clean URLs as broken
# the moment they became canonical. One resolver now, used by both.
def _rules():
    rp = os.path.join(SITE, "_redirects")
    if not os.path.exists(rp):
        return []
    out = []
    for line in open(rp, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) >= 3:
            out.append((parts[0], parts[2].rstrip("!")))
    return out


REDIRECT_RULES = _rules()


def serves(path):
    """Would the deployed host return a page for this path?"""
    if path in ("", "/"):
        return os.path.exists(os.path.join(SITE, "index.html"))
    if os.path.exists(os.path.join(SITE, path.lstrip("/"))):
        return True
    return any(src == path and code in ("200", "301", "302")
               for src, code in REDIRECT_RULES)


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
    if target in pages:
        continue
    # Absolute paths go through the routing table; a bare filename is a
    # relative link and is still just a file.
    resolved = serves(target if target.startswith("/") else "/" + target)
    if not resolved and not os.path.exists(os.path.join(SITE, target)):
        bug(", ".join(sorted(sources)), f"links to {target}, which nothing serves")


# ---------- 2. Orphans — the exact fault I criticised in the competitor ----------
#
# Link targets and filenames are no longer the same string. The site
# links to `/product`; the file is `product.html`. Both forms are folded
# to the filename before comparing, or every page reads as an orphan the
# moment the links become canonical — which is what happened.
def _as_file(target):
    t = target.split("#")[0].split("?")[0]
    if t in ("", "/"):
        return "index.html"
    t = t.lstrip("/")
    return t if t.endswith(".html") else f"{t}.html"


linked = set()
for t in internal:
    linked.add(t)
    linked.add(_as_file(t))
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
back = {p: open(p).read() for p in ours(glob.glob("potato-backend/src/**/*.ts*", recursive=True))}
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



# ---------------------------------------------------------------------
# Every published URL must actually be servable.
#
# The site canonicalises to extensionless paths — /trakheesi-permits, not
# /trakheesi-permits.html — and a static host only knows that because
# `_redirects` says so. Three of the eight rules were missing, so the
# three guide pages sat in the sitemap, carried canonical tags, were
# linked from the guides index, and would have returned 404 the day the
# domain was pointed at the host. The entire content-marketing surface,
# dead on arrival, while actively asking Google to index it.
#
# Nothing in the HTML can show that. It is only visible by reading the
# published URLs against the routing table.
# ---------------------------------------------------------------------
def _url_routing():
    rp = os.path.join(SITE, "_redirects")
    if not os.path.exists(rp):
        bug("_redirects", "missing — every extensionless URL will 404")
        return

    rules = REDIRECT_RULES

    sm = os.path.join(SITE, "sitemap.xml")
    if os.path.exists(sm):
        for loc in re.findall(r"<loc>([^<]+)</loc>", open(sm, encoding="utf-8").read()):
            path = re.sub(r"^https?://[^/]+", "", loc) or "/"
            if not serves(path):
                bug("sitemap.xml", f"lists {loc} but nothing serves {path}")

    for f in sorted(glob.glob(os.path.join(SITE, "*.html"))):
        body = open(f, encoding="utf-8").read()
        m = re.search(r'rel="canonical" href="([^"]+)"', body)
        if not m:
            continue
        url = m.group(1)
        name = os.path.basename(f)
        if "www." in url:
            bug(name, f"canonical uses www ({url}) — the apex is canonical")
        path = re.sub(r"^https?://[^/]+", "", url) or "/"
        if not serves(path):
            bug(name, f"canonical {url} but nothing serves {path}")

    # The registered domain is www; both hosts resolving is duplicate content.
    if not any(src.startswith("https://www.") for src, _ in rules):
        bug("_redirects", "no www → apex redirect, and the domain is registered as www")

    # Internal links must already be canonical.
    #
    # Every one of the 144 internal links pointed at `product.html`,
    # which 301s to `/product`. That is a wasted round trip on every
    # click and crawl budget spent on redirects instead of pages. The
    # .html rules stay in `_redirects` as a safety net for links that
    # escaped into the wild; nothing on the site should need them.
    for f in sorted(glob.glob(os.path.join(SITE, "*.html"))):
        body = open(f, encoding="utf-8").read()
        stale = sorted(set(re.findall(r'href="([a-z0-9-]+\.html)(?:#[^"]*)?"', body)))
        if stale:
            bug(os.path.basename(f),
                f"links to {', '.join(stale[:3])} — use the canonical /path, not the .html")


_url_routing()

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
