#!/usr/bin/env python3
"""
Deep audit — the pass that looks for logic and consistency faults rather
than structure. Structure is already covered by crm-audit.py.
"""
import glob, os, re, sys, json

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
BUGS, WARN, NOTE = [], [], []
def bug(f, m): BUGS.append((os.path.relpath(f, ROOT), m))
def warn(f, m): WARN.append((os.path.relpath(f, ROOT), m))
def note(f, m): NOTE.append((os.path.relpath(f, ROOT), m))

files = {p: open(p).read() for p in glob.glob(os.path.join(ROOT, "**/*.ts*"), recursive=True)}
schema = ""
sp = os.path.join(ROOT, "prisma/schema.prisma")
if os.path.exists(sp): schema = open(sp).read()


# ---------- 1. Money. The one that costs real credibility. ----------
# Fils are stored as BigInt (1 AED = 100 fils). Decimal columns are AED.
FILS_FIELDS = set(re.findall(r'(\w+Fils)\s+BigInt', schema))
DECIMAL_FIELDS = set(re.findall(r'(\w+)\s+Decimal', schema))

for p, s in files.items():
    for m in re.finditer(r'(?:const|function)\s+(\w+)\s*=?\s*\(?(\w+)[^)]*\)?\s*=>\s*`?AED[^;\n]*', s):
        body = m.group(0)
        div = re.search(r'/\s*([\d_]+)', body)
        if div:
            d = int(div.group(1).replace("_", ""))
            name = m.group(1)
            if d == 100:
                note(p, f"money helper `{name}` divides by 100 — correct for fils")
            elif d in (1_000_000, 1000000):
                bug(p, f"money helper `{name}` divides by 1,000,000 — that is only right if the "
                       f"value is already AED. If it is fils this is out by 100x "
                       f"(AED 2.5m would display as AED 250.0M)")
            else:
                warn(p, f"money helper `{name}` divides by {d} — check the unit")

# More than one money formatter across the app is a drift waiting to happen.
formatters = {p: re.findall(r'const (\w+) = \((?:\w+)[^)]*\) =>\s*`?AED', s) for p, s in files.items()}
found = [(p, n) for p, ns in formatters.items() for n in ns]
if len(found) > 1:
    warn("(across files)", f"{len(found)} separate money formatters: " +
         ", ".join(f"{n} in {os.path.basename(p)}" for p, n in found) +
         " — they should be one shared helper")


# ---------- 2. React ----------
for p, s in files.items():
    if not p.endswith(".tsx"): continue
    base = os.path.basename(p)

    if ".map(" in s and re.search(r'\.map\(\([^)]*\)\s*=>\s*<', s):
        for m in re.finditer(r'\.map\(\(([^)]*)\)\s*=>\s*\(?\s*<(\w+)', s):
            seg = s[m.end():m.end()+240]
            if "key=" not in seg:
                line = s[:m.start()].count("\n") + 1
                bug(p, f"line {line}: list rendered with no key prop")

    if "useQuery" in s and "isLoading" not in s and "isPending" not in s:
        warn(p, "useQuery with no loading state handled")

    if "useQuery" in s and "isError" not in s and "error" not in s:
        warn(p, "useQuery with no error state — a failed fetch renders as empty, "
                "which reads as 'no data' rather than 'something broke'")

    if "showModal" in s and "aria-label" not in s and "<h2" not in s:
        warn(p, "dialog with no accessible name")

    for m in re.finditer(r'>([^<>{]*[''"][^<>{]*)<', s):
        if re.search(r"(?<![&\w])['']", m.group(1)) and "&rsquo;" not in m.group(1):
            line = s[:m.start()].count("\n") + 1
            note(p, f"line {line}: raw apostrophe in JSX text — React will warn")

    if "onDrop" in s and "afterLeadId: null" in s and "beforeLeadId" in s:
        bug(p, "drop handler always inserts at the top of the column — "
                "dropping between two cards is not possible")


# ---------- 3. Permission-gated queries in shared UI ----------
gated = set()
for p, s in files.items():
    if "/routers/" not in p: continue
    for m in re.finditer(r'(\w+):\s*requirePermission\("([^"]+)"\)', s):
        router = os.path.basename(p)[:-3]
        gated.add((router, m.group(1), m.group(2)))

for p, s in files.items():
    if "/components/layout/" not in p: continue
    for router, proc, perm in gated:
        if f"api.{router}.{proc}." in s:
            bug(p, f"shared layout calls api.{router}.{proc}, which needs '{perm}'. "
                   f"An agent without it gets a 403 and the whole shell breaks")


# ---------- 4. Async and error handling ----------
for p, s in files.items():
    # Read the whole call rather than a fixed window. The first version
    # looked 400 chars back and 600 forward, which missed options declared
    # above the call and reported five files that were already correct.
    # A noisy audit gets ignored, which costs more than it ever finds.
    # Only the global fetch. `export.ts` has a local callback parameter
    # named `fetch`, and matching it sent me to add a `signal` option to a
    # Prisma query — a false positive that produced a real bug. The tool
    # caused the fault it was written to prevent.
    for m in re.finditer(r'await\s+fetch\(\s*[`"\'h]', s):
        depth, i = 0, m.end() - 2
        while i < len(s):
            if s[i] == "(": depth += 1
            elif s[i] == ")":
                depth -= 1
                if depth == 0: break
            i += 1
        seg = s[m.start():i + 1]
        if "AbortSignal.timeout" not in seg:
            line = s[:m.start()].count("\n") + 1
            warn(p, f"line {line}: fetch with no timeout — a hung third party hangs the request")

    for m in re.finditer(r'JSON\.parse\(', s):
        seg = s[max(0, m.start()-300):m.start()+300]
        if "try" not in seg and "catch" not in seg:
            line = s[:m.start()].count("\n") + 1
            warn(p, f"line {line}: JSON.parse with no try/catch")

    if "void " in s and re.search(r'void\s+\w+\([^)]*\)\s*;', s):
        for m in re.finditer(r'void\s+(\w+)\(', s):
            note(p, f"fire-and-forget call to {m.group(1)}() — confirm it cannot swallow an error silently")


# ---------- 5. Schema ----------
if schema:
    for m in re.finditer(r'^model (\w+) \{(.*?)^\}', schema, re.S | re.M):
        name, body = m.group(1), m.group(2)
        if '"orgId"' in body or "orgId " in body:
            if "@@index" not in body and "@@unique" not in body:
                warn("schema.prisma", f"{name} has orgId but no index — every query on it is a scan")
        if re.search(r'\bDecimal\b', body) and "Fils" not in body:
            for f in re.findall(r'(\w+)\s+Decimal', body):
                if f not in ("position",):
                    note("schema.prisma", f"{name}.{f} is Decimal — confirm the unit is AED not fils")

    declared = set(re.findall(r'^model (\w+)', schema, re.M))
    for mdl in sorted(declared):
        camel = mdl[0].lower() + mdl[1:]
        used = any(f".{camel}." in s for s in files.values())
        # NextAuth owns these through its adapter. We never query them
        # directly and a warning here is noise that trains people to
        # ignore the rest.
        ADAPTER_OWNED = {"Account", "Session", "VerificationToken", "User"}
        if not used and mdl not in ADAPTER_OWNED:
            warn("schema.prisma", f"model {mdl} is declared and never queried — "
                 f"either it is genuinely unfinished, or it is dead")


# ---------- 6. Design tokens ----------
site_css = ""
sp2 = os.path.join(ROOT, "..", "potato-site", "assets", "site.css")
if os.path.exists(sp2): site_css = open(sp2).read()
crm_css = ""
cp2 = os.path.join(ROOT, "src/styles/tokens.css")
if os.path.exists(cp2): crm_css = open(cp2).read()

if site_css and crm_css:
    def toks(css):
        return {k: v.strip() for k, v in re.findall(r'--([\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})', css)}
    a, b = toks(site_css), toks(crm_css)
    # The site and the CRM duplicate the palette because the site is
    # static and has no build step to import from. This is the check
    # that keeps the duplication honest.
    site_map = {"navy":"navy","ocean":"ocean","royal":"royal","teal":"teal",
                "cyan":"cyan","grey":"grey","teal-deep":"teal-deep",
                "royal-deep":"royal-deep","teal-lift":"teal-lift"}
    for k, v in site_map.items():
        if k in a and v in b and a[k].upper() != b[v].upper():
            bug("tokens", f"--{k} is {a[k]} on the website and {b[v]} in the CRM — they must match")

    for p, s in files.items():
        for m in re.finditer(r'#[0-9A-Fa-f]{6}', s):
            if "tokens.css" in p: continue
            line = s[:m.start()].count("\n") + 1
            warn(p, f"line {line}: hardcoded colour {m.group(0)} instead of a token")


if __name__ == "__main__":
    for label, items in (("BUG", BUGS), ("WARNING", WARN), ("NOTE", NOTE)):
        seen, out = set(), []
        for f, m in items:
            k = (f, m[:70])
            if k in seen: continue
            seen.add(k); out.append((f, m))
        print(f"\n{'='*66}\n{len(out)} {label}{'S' if len(out)!=1 else ''}\n{'='*66}")
        for f, m in out:
            print(f"  {f}\n    {m}\n")
    sys.exit(1 if BUGS else 0)
