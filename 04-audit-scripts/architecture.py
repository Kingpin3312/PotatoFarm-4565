#!/usr/bin/env python3
"""
Architectural analysis. Computes the real dependency graph from imports
and looks for structural faults — cycles, layering violations, god
modules, and single points of failure.

Nothing here is style. All of it is structure.
"""
import glob, os, re, sys
from collections import defaultdict

ROOT = sys.argv[1] if len(sys.argv) > 1 else "potato-crm"
# Test files are excluded, and the reason is the unreachable check.
#
# A `*.test.ts` is an entry point — vitest runs it, no application module
# imports it — so to a graph built from imports it looks exactly like the
# thing this script exists to catch: a module nothing can reach. Counting
# them would mean one false "unreachable" per test file, and the fix
# somebody reaches for after the third one is to stop reading the output.
#
# Nothing is lost by leaving them out. A test importing a deep module is
# not a layering violation, and a test is not a dependency of the product.
files = {
    p: open(p).read()
    for p in glob.glob(os.path.join(ROOT, "src/**/*.ts*"), recursive=True)
    if not p.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"))
}

# Layers, outermost first. An inner layer must never import an outer one.
def layer(path):
    p = path.replace(ROOT + "/", "")
    # Middleware is an entry point — the very edge of the request, outside
    # even the route handlers. It was unclassified, so it fell to the
    # `other` bucket at 9, which the layering rule treats as the innermost
    # layer of all. The moment it imported anything from `src/lib` that
    # read as an inner layer reaching outward and failed the build. The
    # import was correct; the map had a hole in it.
    if p == "src/middleware.ts":     return 1, "http"
    if p.startswith("src/app/api/"): return 1, "http"
    if p.startswith("src/app/"):     return 0, "ui"
    if "/api/routers/" in p:         return 2, "router"
    if p.startswith("src/server/api/"): return 2, "router"
    if p.startswith("src/server/jobs/"): return 2, "job"
    if p.startswith("src/server/assistant/"): return 3, "assistant"
    if p.startswith("src/server/lib/"): return 3, "domain"
    if p.startswith("src/server/auth/"): return 4, "auth"
    if p.startswith("src/server/db/"): return 5, "db"
    if p.startswith("src/lib/"):     return 6, "shared"
    if p.startswith("src/components/"): return 0, "ui"
    return 9, "other"

def mod(path):
    p = path.replace(ROOT + "/", "")
    if "/lib/" in p and p.startswith("src/server/lib/"):
        rest = p[len("src/server/lib/"):]
        return "lib/" + (rest.split("/")[0] if "/" in rest else rest.replace(".ts",""))
    for pre, name in [("src/server/api/routers/", "routers"), ("src/server/api/", "api"),
                      ("src/server/assistant/", "assistant"), ("src/server/jobs/", "jobs"),
                      ("src/server/auth/", "auth"), ("src/server/db/", "db"),
                      ("src/app/api/", "http"), ("src/app/", "ui"),
                      ("src/components/", "ui"), ("src/lib/", "shared"),
                      # Files the framework calls, not files anything
                      # imports. Without these they classified as "other"
                      # and were then reported unreachable — which is
                      # true of every entry point by definition.
                      ("src/instrumentation", "boot"),
                      ("src/middleware", "boot"),
                      ("src/types/", "types")]:
        if p.startswith(pre): return name
    return "other"

edges = defaultdict(set)          # module -> modules it imports
file_edges = defaultdict(set)     # file -> files
resolved = {}

for p in files:
    key = p.replace(ROOT + "/", "").replace("src/", "@/")
    for ext in (".ts", ".tsx"):
        if key.endswith(ext): resolved[key[:-len(ext)]] = p
    if key.endswith("/index.ts"): resolved[key[:-len("/index.ts")]] = p

for p, s in files.items():
    # Known gap, recorded rather than left to be discovered: this matches
    # `import … from "@/x"` and not a side-effect import, `import "@/x"`.
    # The latter is a real runtime dependency and would not be counted.
    # Today the only one in the tree is `import "@/styles/globals.css"` in
    # the root layout, which is a stylesheet and not a layer, so the hole
    # is currently empty. Widen the pattern if a side-effect import of a
    # TypeScript module ever appears.
    for m in re.finditer(r'(import\s+(?:type\s+)?[^;]*?from\s+)"(@/[^"]+)"', s):
        # A type-only import is erased at compile time. `lib/trpc.ts`
        # importing `AppRouter` is the standard tRPC pattern and is not a
        # runtime dependency — counting it reported a layering violation
        # that does not exist.
        if re.search(r'\bimport\s+type\b', m.group(1)): continue
        target = resolved.get(m.group(2))
        if not target or target == p: continue
        file_edges[p].add(target)
        a, b = mod(p), mod(target)
        if a != b: edges[a].add(b)

print(f"{len(files)} files · {len(set(mod(p) for p in files))} modules · "
      f"{sum(len(v) for v in edges.values())} module-level edges\n")

FAIL = []

# ---------- 1. Layering ----------
print("=" * 64); print("LAYERING"); print("=" * 64)
violations = []
for p, targets in file_edges.items():
    la, na = layer(p)
    for t in targets:
        lb, nb = layer(t)
        # Lower number = outer. An inner layer importing an outer one is
        # backwards and makes the inner one untestable in isolation.
        if lb < la and na != nb:
            violations.append((p.replace(ROOT+"/",""), na, t.replace(ROOT+"/",""), nb))
if violations:
    for a, na, b, nb in sorted(set(violations))[:12]:
        print(f"  {nb} <- {na}   {os.path.basename(a)} imports {os.path.basename(b)}")
        FAIL.append(f"layering: {na} imports {nb}")
else:
    print("  clean — no inner layer imports an outer one")

# ---------- 2. Cycles ----------
print("\n" + "=" * 64); print("CYCLES"); print("=" * 64)
def find_cycles(g):
    seen, stack, out = set(), [], []
    def walk(n):
        if n in stack:
            out.append(stack[stack.index(n):] + [n]); return
        if n in seen: return
        seen.add(n); stack.append(n)
        for m in sorted(g.get(n, ())): walk(m)
        stack.pop()
    for n in sorted(g): walk(n)
    return out
cyc = find_cycles(edges)
if cyc:
    for c in cyc[:6]:
        print("  " + " -> ".join(c)); FAIL.append("cycle: " + " -> ".join(c))
else:
    print("  none at module level")

file_cyc = find_cycles({k: v for k, v in file_edges.items()})
if file_cyc:
    print(f"\n  {len(file_cyc)} file-level cycle(s):")
    for c in file_cyc[:4]:
        print("    " + " -> ".join(os.path.basename(x) for x in c))

# ---------- 3. Coupling ----------
print("\n" + "=" * 64); print("COUPLING"); print("=" * 64)
incoming = defaultdict(int)
for a, bs in edges.items():
    for b in bs: incoming[b] += 1
print("  Most depended upon (a change here touches everything):")
for m, n in sorted(incoming.items(), key=lambda x: -x[1])[:6]:
    bar = "#" * n
    print(f"    {m:20} {n:2}  {bar}")
print("\n  Depends on the most (hardest to reason about in isolation):")
for m, bs in sorted(edges.items(), key=lambda x: -len(x[1]))[:6]:
    print(f"    {m:20} {len(bs):2}  {', '.join(sorted(bs))[:52]}")

# ---------- 4. Unreachable ----------
print("\n" + "=" * 64); print("REACHABILITY"); print("=" * 64)
# `boot` is Next's own hooks — instrumentation.ts and middleware.ts are
# invoked by the framework and imported by nothing. `types` is ambient
# declarations, which are consumed by the compiler rather than at runtime.
entry = {"routers", "jobs", "http", "ui", "api", "boot", "types"}
reach, queue = set(entry), list(entry)
while queue:
    n = queue.pop()
    for m in edges.get(n, ()):
        if m not in reach: reach.add(m); queue.append(m)
all_mods = set(mod(p) for p in files)
orphans = sorted(all_mods - reach)
if orphans:
    for o in orphans:
        print(f"  {o} — nothing reaches it from a router, job or page")
        FAIL.append(f"unreachable: {o}")
else:
    print("  every module is reachable from an entry point")

# ---------- 4b. Utilities buried in domain modules ----------
#
# A cross-cutting utility inside a domain module is a cycle waiting for a
# second consumer. `log.ts` lived in lib/health until portals needed it,
# and that closed health -> portals -> health.
print("\n" + "=" * 64); print("BURIED UTILITIES"); print("=" * 64)
buried = []
for p2 in files:
    if "/server/lib/" not in p2: continue
    base = os.path.basename(p2)
    if base not in ("log.ts", "cn.ts", "money.ts", "format.ts", "time.ts"): continue
    consumers = {mod(a) for a, bs in file_edges.items() if p2 in bs}
    if len(consumers) > 2:
        buried.append((p2.replace(ROOT+"/",""), len(consumers)))
if buried:
    for f, n in buried:
        print(f"  {f} is imported by {n} modules — move it to src/lib")
        FAIL.append(f"buried utility: {f}")
else:
    print("  none — cross-cutting utilities live in src/lib")

# ---------- 5. Single points of failure ----------
print("\n" + "=" * 64); print("BLAST RADIUS"); print("=" * 64)
def dependents(target):
    out, queue = set(), [target]
    while queue:
        n = queue.pop()
        for a, bs in edges.items():
            if n in bs and a not in out:
                out.add(a); queue.append(a)
    return out
for critical in ["db", "lib/whatsapp", "auth", "shared"]:
    if critical in all_mods or critical in incoming:
        d = dependents(critical)
        print(f"  {critical:16} breaks {len(d):2} module(s): {', '.join(sorted(d))[:48]}")

print("\n" + "=" * 64)
print(f"{len(FAIL)} structural fault(s)")
print("=" * 64)
for f in FAIL: print("  x", f)
sys.exit(1 if FAIL else 0)
