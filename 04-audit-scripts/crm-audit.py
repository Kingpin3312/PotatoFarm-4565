#!/usr/bin/env python3
"""
Consistency audit across the CRM.

Written after a long build, because that is exactly when drift appears:
a permission used but never defined, a router written but never
registered, an environment variable read but never documented. None of it
shows up in review — each file is fine on its own.
"""
import glob, os, re, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
FAILS, WARNS = [], []
def fail(m): FAILS.append(m)
def warn(m): WARNS.append(m)

def read(p):
    return open(p).read()

src = {p: read(p) for p in glob.glob(os.path.join(ROOT, "src/**/*.ts"), recursive=True)}
src.update({p: read(p) for p in glob.glob(os.path.join(ROOT, "src/**/*.tsx"), recursive=True)})
allsrc = "\n".join(src.values())
schema = read(os.path.join(ROOT, "prisma/schema.prisma"))


# 1. Every router must be registered somewhere.
routers = {os.path.basename(p)[:-3] for p in src if "/routers/" in p}
root = [p for p in src if p.endswith("root.ts") or p.endswith("_app.ts")]
if not root:
    fail(f"no root router — {len(routers)} routers exist and none are mounted: {sorted(routers)}")
else:
    mounted = read(root[0])
    for r in routers:
        if r not in mounted:
            fail(f"router '{r}' is never mounted on the root router")


# 2. Permissions used vs defined.
rbac = next((s for p, s in src.items() if p.endswith("rbac.ts")), "")
defined = set(re.findall(r'"([a-z]+:[a-z:]+)"', rbac.split("export type Permission")[0]))
# Both ways a permission is checked. `requirePermission()` gates a
# procedure; `can(role, "…")` asks the same question inside one, which is
# how the leaderboard decides whether you see the whole team. Counting
# only the first reported seven permissions as dead that are in daily
# use — and a warning that is wrong seven times is one nobody reads the
# eighth time.
used = set(re.findall(r'requirePermission\("([^"]+)"\)', allsrc))
used |= set(re.findall(r'can\(\s*[\w.]+\s*,\s*"([^"]+)"', allsrc))
# `leadScope()` is the read:own / read:all split expressed as a Prisma
# filter rather than a gate.
if "leadScope" in allsrc:
    used |= {"lead:read:all", "lead:read:own"}
for p in sorted(used - defined):
    fail(f"permission '{p}' is used but never defined in rbac.ts")
for p in sorted(defined - used - {"org:delete", "org:billing", "lead:read:own", "conversation:read"}):
    warn(f"permission '{p}' is defined but never used")


# 3. Notification kinds used vs the enum.
enum_kinds = set(re.findall(r'^\s+([A-Z_]+)\s*(?://.*)?$',
    schema.split("enum NotificationKind {")[1].split("}")[0], re.M)) if "enum NotificationKind" in schema else set()
# `kind:` is not unique to notifications — AttachmentKind uses it too,
# and the first version reported BROCHURE as a missing notification.
# Only count it when it is going through the notify path.
used_kinds = set()
for m in re.finditer(r'kind:\s*"([A-Z_]+)"', allsrc):
    window = allsrc[max(0, m.start() - 400):m.start() + 200]
    if re.search(r'notify|Notification|dispatch', window):
        used_kinds.add(m.group(1))
for k in sorted(used_kinds - enum_kinds):
    fail(f"notification kind '{k}' is dispatched but not in the enum")


# 4. Prisma models referenced from code must exist.
models = set(re.findall(r'^model (\w+)', schema, re.M))
lower = {m[0].lower() + m[1:]: m for m in models}
for ref in sorted(set(re.findall(r'(?:db|tx|rootDb)\.(\w+)\.(?:find|create|update|upsert|delete|count|aggregate|groupBy)', allsrc))):
    if ref not in lower and ref not in {"$queryRaw", "$executeRaw", "$transaction"}:
        fail(f"code calls db.{ref} but there is no matching Prisma model")


# 5. Relations must resolve to a real model.
for m in re.finditer(r'@relation\(fields: \[(\w+)\], references: \[\w+\]', schema):
    pass  # field-level, checked by prisma itself
for line in schema.splitlines():
    m = re.match(r'\s+\w+\s+(\w+)(\[\])?\s+@relation', line)
    if m and m.group(1) not in models and m.group(1) not in {"Unsupported"}:
        fail(f"relation points at unknown model '{m.group(1)}'")


# 6. Env vars read vs documented.
env_used = set(re.findall(r'process\.env\.([A-Z0-9_]+)', allsrc))
# The app's own .env.example. This pointed at `../potato-prod/.env.example`,
# a directory that has never existed in this repository — so `documented`
# was always empty and **every** variable read anywhere was reported as
# undocumented. Sixteen false positives, which is how a check stops being
# read.
env_file = os.path.join(ROOT, ".env.example")
documented = set(re.findall(r'^([A-Z0-9_]+)=', read(env_file), re.M)) if os.path.exists(env_file) else set()

# The Prisma schema reads env too — `directUrl = env("DATABASE_URL_DIRECT")`
# is a genuine, required variable that never appears as `process.env`.
# Without this the reverse check below would report it as dead config and
# somebody would helpfully delete it, which breaks every migration.
schema_env = set(re.findall(r'env\("([A-Z0-9_]+)"\)', schema))

# Set by the framework, not by an operator, so neither list should carry
# them.
FRAMEWORK = {"NODE_ENV", "NEXT_RUNTIME"}

# Read by a dependency rather than by this codebase.
#
# `AUTH_SECRET` is the clearest case: NextAuth reads it itself and
# refuses to start in production without it, so it is both genuinely
# required and genuinely absent from our source. The reverse check found
# it on its first run and called it dead configuration, which is exactly
# the wrong answer — deleting it means nobody can sign in.
#
# `instrumentation.ts` does check it, but through `process.env[name]`
# with the name in a data table, which no regex over source is going to
# see. Naming it here is the honest way to say "we know, and it is
# consumed elsewhere".
LIBRARY_READ = {
    "AUTH_SECRET",   # NextAuth v5 signs every session cookie with it
    "AUTH_URL",      # NextAuth, only needed behind a host-rewriting proxy
}

# ---------------------------------------------------------------------
# Read but not documented: a failure, not a warning.
#
# `.env.example` states in its own header that anything absent from it
# and present in the code is a bug, and it is right — the whole shape of
# this product's failures is silence. An unset variable does not throw,
# it sends `undefined` in a header, gets a 401 back, and surfaces three
# layers away as "the assistant handed this conversation to a person".
#
# This was a `warn()`, which meant the build stayed green while the file
# that tells an operator what to provision was incomplete. That is the
# one thing this check exists to prevent.
# ---------------------------------------------------------------------
for e in sorted(env_used - documented - FRAMEWORK):
    fail(f"env var {e} is read in code but is not in .env.example — "
         f"nobody deploying this will know to set it")

# ---------------------------------------------------------------------
# Documented but never read: the other direction, and a warning.
#
# `.env.example` used to carry twenty of these — Sanity, Turnstile,
# Upstash, a CRM endpoint, Google Analytics — inherited from a marketing
# site this application has never been. Dead configuration is worse than
# none: it invites somebody to go and provision services the product does
# not use, and it hides the handful that genuinely matter.
#
# A warning rather than a failure because a variable can legitimately
# lead its implementation by a commit or two.
# ---------------------------------------------------------------------
for e in sorted(documented - env_used - schema_env - FRAMEWORK - LIBRARY_READ):
    warn(f"env var {e} is in .env.example and nothing reads it — "
         f"dead configuration invites somebody to provision it")


# 7. Jobs registered vs cron.
jobs_file = os.path.join(ROOT, "src/server/jobs/index.ts")
if os.path.exists(jobs_file):
    registered = set(re.findall(r'"([\w.\-]+)": \(\) => run', read(jobs_file)))
    cron = set(re.findall(r'/api/cron/([\w.\-]+)"', read(os.path.join(ROOT, "vercel.json"))))
    for j in sorted(registered ^ cron):
        fail(f"job/cron mismatch: '{j}'")


# 7b. The health module's expected schedule must cover every job.
#
# The schedule moved into lib/health to break a jobs <-> health cycle,
# which created a drift risk in exchange. This is the check that pays
# for it.
health_jobs = os.path.join(ROOT, "src/server/lib/health/jobs.ts")
if os.path.exists(health_jobs) and os.path.exists(jobs_file):
    expected = set(re.findall(r'"([\w.\-]+)":\s*[\d*\s]+,', read(health_jobs)))
    registered = set(re.findall(r'"([\w.\-]+)": \(\) => run', read(jobs_file)))
    for j in sorted(registered - expected):
        fail(f"job '{j}' has no entry in lib/health/jobs.ts — nothing will notice if it stops")
    for j in sorted(expected - registered):
        warn(f"lib/health/jobs.ts expects '{j}', which is not a registered job")


# 7c. No bare rootDb outside the client itself.
#
# rootDb bypasses row-level security. Every use must go through
# crossTenant(reason), so the next reader knows which of the four cases
# they are looking at rather than reconstructing the argument.
for p2, s2 in src.items():
    if p2.endswith("db/client.ts"): continue
    for m2 in re.finditer(r'\brootDb\.', s2):
        line2 = s2[:m2.start()].count("\n") + 1
        fail(f"{os.path.basename(p2)}:{line2}: bare rootDb — use crossTenant(reason) "
             f"so the RLS bypass is declared, not assumed")


# 7d. An imported name that the target file does not export.
#
# Three invented APIs in one file today: a `portalChannel` model that is
# called `channel`, a `report(orgId, {...})` signature that does not
# exist, and a `source` field that was not on the type. All three were
# written from memory instead of read from the code, and all three would
# have compiled nowhere.
for p2, s2 in src.items():
    for m2 in re.finditer(r'import \{([^}]+)\} from "(@/[^"]+)"', s2):
        target = os.path.join(ROOT, m2.group(2).replace("@/", "src/"))
        cand = [target + e for e in (".ts", ".tsx", "/index.ts")]
        hit = next((c for c in cand if c in src), None)
        if not hit: continue
        exported = set(re.findall(r'export (?:async )?(?:function|const|class|type|interface) (\w+)', src[hit]))
        # `export const { handlers, auth } = NextAuth(…)` — a destructured
        # export. Missing this made the NextAuth route look like it
        # imported something that did not exist, which is exactly the
        # class of false positive that gets a real finding ignored.
        for grp in re.findall(r'export const \{([^}]+)\}\s*=', src[hit]):
            exported |= {n.strip().split(":")[-1].strip() for n in grp.split(",")}
        exported |= set(re.findall(r'export \{([^}]+)\}', src[hit])[0].split(",")) \
                    if re.search(r'export \{', src[hit]) else set()
        exported = {e.strip() for e in exported}
        # `{ sweep as notifySweep }` — check the exported name, which is
        # the left side. Ignoring the alias made every renamed import
        # look like a missing export.
        for raw in m2.group(1).split(","):
            name = raw.strip().replace("type ", "").split(" as ")[0].strip()
            if name and name not in exported:
                fail(f"{os.path.basename(p2)} imports '{name}' from {m2.group(2)}, "
                     f"which does not export it")


# 8. Every domain module must be reachable from somewhere.
#
# A module with no router and no job is code that runs nowhere. It looks
# finished, it passes every other check, and nothing can call it. This is
# the same failure as the unmounted routers, one level up.
lib_dirs = {
    os.path.basename(os.path.dirname(p2))
    for p2 in glob.glob(os.path.join(ROOT, "src/server/lib/*/*.ts"))
}
router_src = "\n".join(s2 for p2, s2 in src.items() if "/routers/" in p2 or p2.endswith("root.ts"))
jobs_src = "\n".join(s2 for p2, s2 in src.items() if "/jobs/" in p2)

# Every route handler, not only the webhooks.
#
# This listed `/webhooks/` and nothing else, which is one kind of route
# handler out of several. When the marketing site's two form endpoints
# moved into the app — `api/demo` and `api/subscribe`, the only public
# conversion path the product has — the module behind them was reported
# as reachable from nowhere. A file Next mounts at a URL is reachable by
# definition; that is the whole job of the App Router.
route_src = "\n".join(
    s2 for p2, s2 in src.items()
    if p2.replace(os.sep, "/").endswith("/route.ts") and "/app/api/" in p2.replace(os.sep, "/")
)
reachable = router_src + jobs_src + route_src

for mod in sorted(lib_dirs):
    if f"lib/{mod}/" not in reachable:
        fail(f"module 'lib/{mod}' is not reachable — no router, no job, no route handler imports it")


# 9. Imports must resolve.
for p, s in src.items():
    for imp in re.findall(r'from "(@/[^"]+)"', s):
        target = os.path.join(ROOT, "src", imp[2:])
        if not any(os.path.exists(target + ext) for ext in (".ts", ".tsx", "/index.ts", ".sql")):
            fail(f"{os.path.basename(p)}: imports '{imp}' which does not exist")


# An enum member with no rule in a Record keyed by that enum.
#
# `DEAL_AT_RISK` and `PORTAL_SILENT` were dispatched from live jobs with
# no entry in RULES — `RULES[kind]` returned undefined and the next line
# read a property off it. Both would have thrown the first time a deal
# slipped or a feed went quiet, and nothing here could see it.
import re as _re, os as _os
_schema = _os.path.join(ROOT, "prisma/schema.prisma")
_rules  = _os.path.join(ROOT, "src/server/lib/notify/rules.ts")
if _os.path.exists(_schema) and _os.path.exists(_rules):
    _s = open(_schema).read()
    _m = _re.search(r"enum NotificationKind \{(.*?)\n\}", _s, _re.S)
    if _m:
        _kinds = set(_re.findall(r"^\s+([A-Z_]+)", _m.group(1), _re.M))
        _ruled = set(_re.findall(r"^  ([A-Z_]+): \{", open(_rules).read(), _re.M))
        for _k in sorted(_kinds - _ruled):
            fail(f"NotificationKind.{_k} has no entry in RULES — "
                 f"dispatch() reads RULES[kind].afterMinutes and will throw")


if __name__ == "__main__":
    print(f"{len(src)} source files, {len(models)} models, {len(routers)} routers\n")
    print(f"{len(FAILS)} failure(s)")
    for f in sorted(set(FAILS)): print("  x", f)
    print(f"\n{len(set(WARNS))} warning(s)")
    for w in sorted(set(WARNS)): print("  !", w)
    sys.exit(1 if FAILS else 0)
