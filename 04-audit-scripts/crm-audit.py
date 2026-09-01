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
# A commented-out variable is documented.
#
# `.env.example` uses `# NAME=value` deliberately for the optional ones —
# AUTH_URL, S3_FORCE_PATH_STYLE — so the name and the explanation are in
# front of an operator without an empty value implying they must fill it
# in. Counting only uncommented lines pushed towards uncommenting them,
# which makes the file worse: a wall of blanks with no signal about which
# actually matter.
documented = (set(re.findall(r'^#?\s*([A-Z0-9_]+)=', read(env_file), re.M))
              if os.path.exists(env_file) else set())

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
def resolve_module(spec, importer):
    """`@/lib/i18n` or a relative `./locale` to a key in `src`."""
    if spec.startswith("@/"):
        base = os.path.join(ROOT, spec.replace("@/", "src/"))
    elif spec.startswith("."):
        base = os.path.normpath(os.path.join(os.path.dirname(importer), spec))
    else:
        return None
    return next((c for c in (base + e for e in (".ts", ".tsx", "/index.ts")) if c in src), None)


def exports_of(path, seen=None):
    """
    Every name a module exports, following `export * from` one module at
    a time.

    **Barrel modules were invisible to this.** `lib/i18n/index.ts` says
    `export * from "./locale"`, and every name re-exported that way was
    read as missing — so the root layout importing `dirOf` from the
    barrel was reported as importing something that does not exist. It
    compiles, `tsc` is happy, and the check says otherwise.

    That is the same false-positive shape the destructured-export case
    below was fixed for, and this file already records why it matters: a
    check that cries wolf is a check whose real findings get waved
    through.
    """
    seen = seen or set()
    if path in seen or path not in src:
        return set()
    seen.add(path)
    body = src[path]

    names = set(re.findall(
        r'export (?:async )?(?:function|const|class|type|interface) (\w+)', body))
    # `export const { handlers, auth } = NextAuth(…)` — a destructured
    # export. Missing this made the NextAuth route look like it
    # imported something that did not exist, which is exactly the
    # class of false positive that gets a real finding ignored.
    for grp in re.findall(r'export const \{([^}]+)\}\s*=', body):
        names |= {n.strip().split(":")[-1].strip() for n in grp.split(",")}
    # Every `export { … }` block, not only the first. `index.ts` has
    # three, and reading `[0]` meant the other two exported nothing as
    # far as this check could tell.
    for grp in re.findall(r'export \{([^}]+)\}', body):
        names |= {n.strip() for n in grp.split(",")}
    for spec in re.findall(r'export \*(?:\s+as\s+\w+)?\s+from\s+"([^"]+)"', body):
        target = resolve_module(spec, path)
        if target:
            names |= exports_of(target, seen)

    return {n.replace("type ", "").split(" as ")[-1].strip() for n in names if n.strip()}


for p2, s2 in src.items():
    for m2 in re.finditer(r'import \{([^}]+)\} from "(@/[^"]+)"', s2):
        hit = resolve_module(m2.group(2), p2)
        if not hit: continue
        exported = exports_of(hit)
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
# A check that pins its clock must not also read the wall clock.
#
# `buyers.check.ts` froze `NOW` at a written date — correctly, because
# the send-window rules refuse to run outside working hours and an
# unpinned check is a coin toss — and then built its fixtures with
# `ago(d) = Date.now() - d days`. The two agree on the day it was
# written and drift one day per day after.
#
# Three days later the requirement meant to have *expired* sat two days
# in the frozen clock's future, the matcher correctly included it, and
# the assertion "an expired search does not appear at all" failed. It
# reads as a product regression and is a calendar.
#
# A pinned clock is only pinned if everything reads it.
# Globbed here rather than read from `src`, which holds `src/**` only —
# the first version of this rule iterated `src` looking for
# `/scripts/` and therefore read nothing at all. It reported zero
# failures against the exact file it was written for, which is the
# failure shape this whole suite exists to catch, committed inside a
# new check.
for _p in glob.glob(os.path.join(ROOT, "scripts/*.ts")):
    _s = read(_p)
    if not re.search(r'const NOW = new Date\("', _s):
        continue
    _code = re.sub(r"/\*.*?\*/|//[^\n]*", "", _s, flags=re.S)
    if "Date.now()" in _code or re.search(r"new Date\(\s*\)", _code):
        fail(f"{os.path.basename(_p)} pins NOW and also reads the wall clock — "
             f"the two drift apart one day per day")

# Reachability is transitive, and the one-hop version was wrong.
#
# This asked whether a router, a job or a route handler mentioned
# `lib/<mod>/` *directly*. Most modules are reached that way, so it
# looked correct for a long time. `lib/pipeline` is not: signup calls
# it, WhatsApp ingest calls it, the portal feed calls it — and all three
# are themselves libraries, reached in turn from the billing router and
# the webhook route handlers. A module two hops from an entry point is
# reachable by every meaning of the word, and reporting it as dead sends
# somebody to delete working code.
#
# So the frontier is walked rather than read once. The check still fails
# for a genuine island, which is the thing it was written to catch.
def _is_mounted(p2):
    """A file Next mounts at a URL — a route handler *or* a page.

    The comment further up makes exactly this argument and then applied
    it to `route.ts` alone. So the first module reachable only from a
    page was reported as an island: `lib/listings/public.ts`, behind
    `/p/[slug]/[reference]`, which had been fetched over HTTP and had
    returned a rendered property while this said nothing could reach it.

    A page is an entry point by the same reasoning as a route handler,
    and being wrong about it is expensive in the one direction that
    matters — it invites somebody to delete working code.
    """
    u = p2.replace(os.sep, "/")
    if "/app/" not in u:
        return False
    return u.endswith("/route.ts") or u.endswith("/page.tsx") or u.endswith("/layout.tsx")


_entry = {
    p2 for p2 in src
    if "/routers/" in p2 or p2.endswith("root.ts") or "/jobs/" in p2
    or _is_mounted(p2)
}

_IMPORT_RE = re.compile(r"""from\s+["']([^"']+)["']""")


def _mod_of(path):
    """The `lib/<mod>` a file belongs to, if any."""
    m = re.search(r"src/server/lib/([^/]+)/", path.replace(os.sep, "/"))
    return m.group(1) if m else None


def _lib_imports(path, body):
    """Which lib modules this file imports, by alias or by relative path."""
    out = set()
    here = _mod_of(path)
    for spec in _IMPORT_RE.findall(body):
        # The trailing slash is optional, and that mattered.
        #
        # This required one, so a module written as `lib/x/index.ts` and
        # imported as `@/server/lib/x` — no slash — registered as
        # importing nothing. It went unnoticed while every lib module
        # was a directory with named files inside it; the first time one
        # was converted from `x.ts` to `x/index.ts`, the module went
        # unreachable in the graph while every caller still imported it.
        #
        # A check that calls a live module dead is the same failure as
        # one that calls a dead module live: both stop being read.
        m = re.match(r"@/server/lib/([^/]+)(?:/|$)", spec)
        if m:
            out.add(m.group(1))
        elif spec.startswith("."):
            # A relative hop out of one module and into a sibling.
            resolved = os.path.normpath(
                os.path.join(os.path.dirname(path.replace(os.sep, "/")), spec))
            m2 = re.search(r"src/server/lib/([^/]+)/", resolved + "/")
            if m2 and m2.group(1) != here:
                out.add(m2.group(1))
    return out


_edges = {p2: _lib_imports(p2, s2) for p2, s2 in src.items()}
_by_mod = {}
for _p in src:
    _m = _mod_of(_p)
    if _m:
        _by_mod.setdefault(_m, []).append(_p)

_reached = set()
_frontier = set()
for _p in _entry:
    _frontier |= _edges.get(_p, set())
while _frontier:
    _mod = _frontier.pop()
    if _mod in _reached:
        continue
    _reached.add(_mod)
    for _f in _by_mod.get(_mod, []):
        _frontier |= _edges.get(_f, set()) - _reached

for mod in sorted(lib_dirs):
    if mod not in _reached:
        fail(f"module 'lib/{mod}' is not reachable — no path from any router, "
             f"job or route handler reaches it")


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


# ---------------------------------------------------------------------
# A string-union member that nothing ever compares against.
#
# `Urgency = "urgent" | "normal" | "digest"` was declared, assigned to
# every notification kind, and consulted in exactly one place:
#
#     if (quiet && !(rule.urgency === "urgent" && p.urgentOverridesQuiet))
#
# So "normal" and "digest" changed no behaviour anywhere. A kind marked
# `digest` — "sent at a civilised hour" — pushed the instant it was
# raised, exactly like an urgent one. The field looked like a policy and
# was a comment.
#
# **A declared value that nothing branches on is the same shape as a
# module nothing imports**, and it is the shape this suite exists for.
#
# Advisory, never a failure. A union member can legitimately be data
# rather than a branch — rendered to a screen, stored, sent to an API —
# and CLAUDE.md is explicit that checks phrased "this is broken" have
# been wrong nine times here. This one says "confirm this".
_UNION = _re.compile(r'export type (\w+) = ((?:"[a-z_-]+"\s*\|\s*)+"[a-z_-]+")\s*;')
for _path, _body in src.items():
    for _m in _UNION.finditer(_body):
        _name, _members = _m.group(1), _re.findall(r'"([a-z_-]+)"', _m.group(2))
        if len(_members) < 3:
            continue                      # a two-value union is a boolean
        for _v in _members:
            # Compared against anywhere at all: ===, !==, switch case, or
            # an inclusion test. Searched across the whole codebase,
            # because the declaration and the branch are rarely together.
            if _re.search(rf'(?:===|!==|case)\s*"{_re.escape(_v)}"', allsrc) \
               or _re.search(rf'"{_re.escape(_v)}"\s*(?:===|!==)', allsrc) \
               or _re.search(rf'\.includes\("{_re.escape(_v)}"\)', allsrc):
                continue
            warn(f'{_name}."{_v}" is declared and nothing branches on it — '
                 f"confirm it is meant to be data rather than a decision "
                 f"({_os.path.relpath(_path, ROOT)})")


if __name__ == "__main__":
    print(f"{len(src)} source files, {len(models)} models, {len(routers)} routers\n")
    print(f"{len(FAILS)} failure(s)")
    for f in sorted(set(FAILS)): print("  x", f)
    print(f"\n{len(set(WARNS))} warning(s)")
    for w in sorted(set(WARNS)): print("  !", w)
    sys.exit(1 if FAILS else 0)
