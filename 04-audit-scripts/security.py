#!/usr/bin/env python3
"""
Security review.

The question this asks that no other check does: **where does the tenant
boundary not apply, and is every one of those places safe?**

Row-level security protects every query made through `forOrg()`. It does
not protect `rootDb`, which exists because jobs and webhooks run without
a user session. Every rootDb call is a place where the database will
happily return another brokerage's data if the query does not scope
itself.
"""
import glob, os, re, sys
from collections import defaultdict

ROOT = sys.argv[1] if len(sys.argv) > 1 else "potato-crm"
CRIT, HIGH, MED, OK = [], [], [], []
def crit(f, m): CRIT.append((f, m))
def high(f, m): HIGH.append((f, m))
def med(f, m): MED.append((f, m))

files = {p: open(p).read() for p in glob.glob(os.path.join(ROOT, "src/**/*.ts*"), recursive=True)}
rel = lambda p: p.replace(ROOT + "/", "")


# ---------- 1. The RLS escape hatch ----------
# Every rootDb query must scope itself, because nothing else will.
CROSS_TENANT_OK = {
    # Deliberately cross-tenant: these sweep every brokerage by design.
    "allTenants", "sweepOverdue", "reconcile", "expireGrants", "evaluate",
    "sweepDueReminders", "expireHolds", "checkChannelSilence", "retentionSweep",
    "jobsHealth", "sendDueReminders",
}
for p, s in files.items():
    for m in re.finditer(r'(?<!crossTenant\(")rootDb\.(\w+)\.(findMany|findFirst|findUnique|count|aggregate|groupBy|updateMany|deleteMany)\(([^;]{0,700})', s):
        model, op, body = m.group(1), m.group(2), m.group(3)
        line = s[:m.start()].count("\n") + 1

        # Which function is this inside?
        # Strip comments first. The first version matched a word inside a
        # comment and reported the enclosing function as "rather()", which
        # is the sort of output that makes people stop reading a report.
        before = re.sub(r'/\*.*?\*/', '', s[:m.start()], flags=re.S)
        before = re.sub(r'//.*$', '', before, flags=re.M)
        fn = None
        for fm in re.finditer(r'(?:export\s+)?(?:async\s+)?function\s+(\w+)|^\s{2}(\w+):\s*(?:async\s*)?\(', before, re.M):
            fn = fm.group(1) or fm.group(2)

        if model in ("$queryRaw", "$executeRaw", "auditLog", "jobRun", "paymentEvent"):
            continue
        scoped = "orgId" in body or "where" in body and re.search(r'orgId', body)
        if not scoped:
            if fn in CROSS_TENANT_OK:
                OK.append((rel(p), f"line {line}: rootDb.{model} unscoped inside {fn}() — cross-tenant by design"))
            else:
                crit(rel(p), f"line {line}: rootDb.{model}.{op} with no orgId filter, inside {fn or '?'}(). "
                             f"rootDb bypasses row-level security — this can return another brokerage's data")


# ---------- 2. Raw SQL ----------
for p, s in files.items():
    for m in re.finditer(r'\$(?:queryRaw|executeRaw)(Unsafe)?(<[^>]*>)?\s*(`|\()', s):
        line = s[:m.start()].count("\n") + 1
        if m.group(1):
            crit(rel(p), f"line {line}: $queryRawUnsafe — string-built SQL")
        else:
            # A tagged template parameterises every ${} — that is why it
            # exists. Only Prisma.raw() inside one builds a string, and
            # the first version flagged every safe interpolation, which
            # is how a security report gets ignored.
            seg = s[m.start():m.start()+500]
            if "Prisma.raw" in seg:
                crit(rel(p), f"line {line}: Prisma.raw() inside a tagged template builds SQL by hand")


# ---------- 3. Secrets ----------
for p, s in files.items():
    for pat, what in [
        (r'(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{10,}', "a Stripe key"),
        (r'EAA[A-Za-z0-9]{40,}', "a Meta access token"),
        (r'(?:password|secret|apiKey|token)\s*[:=]\s*"[^"$][^"]{12,}"', "a hardcoded credential"),
    ]:
        for m in re.finditer(pat, s):
            if "process.env" in s[max(0,m.start()-60):m.start()]: continue
            crit(rel(p), f"line {s[:m.start()].count(chr(10))+1}: looks like {what} in source")


# ---------- 4. Webhooks ----------
for p, s in files.items():
    if "/webhooks/" not in p: continue
    if "POST" not in s: continue
    name = rel(p)
    if not re.search(r'verify|Signature|timingSafeEqual|createHmac', s):
        crit(name, "webhook with no signature verification — anyone who finds the URL can post to it")
    elif "timingSafeEqual" not in s and "verify" in s:
        med(name, "signature verified — confirm the comparison is constant-time")


# ---------- 5. SSRF ----------
for p, s in files.items():
    for m in re.finditer(r'fetch\(\s*([a-zA-Z_$][\w.$]*)\s*[,)]', s):
        var = m.group(1)
        if var in ("EXPO_URL", "url") and "http" not in s[max(0,m.start()-200):m.start()]:
            line = s[:m.start()].count("\n") + 1
            med(rel(p), f"line {line}: fetch() to a variable URL — confirm it cannot be attacker-controlled")


# ---------- 6. PII in logs ----------
scrubbed = "lib/health/log"
for p, s in files.items():
    for m in re.finditer(r'console\.(log|info|warn|error)\(', s):
        line = s[:m.start()].count("\n") + 1
        seg = s[m.start():m.start()+200]
        if re.search(r'\b(phone|body|message|email|name|token)\b', seg):
            high(rel(p), f"line {line}: console.{m.group(1)} with what looks like personal data — "
                         f"use log() from health/log.ts, which scrubs")


# ---------- 7. Mass assignment ----------
for p, s in files.items():
    if "/routers/" not in p: continue
    for m in re.finditer(r'data:\s*input\s*[,}]', s):
        line = s[:m.start()].count("\n") + 1
        high(rel(p), f"line {line}: `data: input` passes the whole validated object to Prisma. "
                     f"Safe only if the Zod schema is strict — confirm it cannot carry orgId or id")


# ---------- 8. Public procedures ----------
for p, s in files.items():
    if "/routers/" not in p: continue
    for m in re.finditer(r'(\w+):\s*publicProcedure', s):
        high(rel(p), f"{m.group(1)} is a public procedure — confirm it is meant to be unauthenticated")


# ---------- 9. React injection ----------
for p, s in files.items():
    if not p.endswith(".tsx"): continue
    if "dangerouslySetInnerHTML" in s:
        crit(rel(p), "dangerouslySetInnerHTML")
    for m in re.finditer(r'href=\{([^}]+)\}', s):
        if "http" not in m.group(1) and "/" not in m.group(1):
            med(rel(p), f"href from a variable ({m.group(1)[:28]}) — confirm it cannot be javascript:")


if __name__ == "__main__":
    for label, items in (("CRITICAL", CRIT), ("HIGH", HIGH), ("MEDIUM", MED)):
        seen, out = set(), []
        for f, m in items:
            if (f, m[:60]) in seen: continue
            seen.add((f, m[:60])); out.append((f, m))
        print(f"\n{'='*66}\n{len(out)} {label}\n{'='*66}")
        for f, m in out: print(f"  {f}\n    {m}\n")
    print(f"\n{'='*66}\n{len(OK)} deliberate cross-tenant call(s), verified\n{'='*66}")
    for f, m in OK[:10]: print(f"  {f}: {m.split(': ',1)[1][:70]}")
    sys.exit(1 if CRIT else 0)
