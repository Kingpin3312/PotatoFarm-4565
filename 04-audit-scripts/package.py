#!/usr/bin/env python3
"""
The deployable copy matches the site it was built from.

`potatofarm-site.zip` is the archive somebody is handed or deploys, and
it is the least-examined artefact in the repository — it is gitignored,
so `git status` is always clean about it, and nothing reads inside it.

It has now been wrong twice in ways that were invisible:

  - it sat holding a complete site on an accent five generations old,
    **and missing ten files** the live site had by then, including the
    favicon and every product screenshot;
  - a container reset restored an August copy over a September one, and
    the only reason anybody noticed was that `palette.py` reads its
    colours.

`palette.py` catches the first kind of drift and only that kind. A page
whose *words* changed, a script that was added, an asset that was
removed — none of it shows up as a colour. This compares the file list
and the bytes.

## Why it does not simply rebuild

Rebuilding here would make the check always pass, which is the one thing
a check must not do. It reports the difference and names the command.
"""
import hashlib
import os
import sys
import zipfile

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
SITE = os.path.join(ROOT, "02-the-project/website")
ZIP = os.path.join(ROOT, "potatofarm-site.zip")

# The same exclusions `package-site.sh` applies, and for its reasons:
# the generators and the local server are development tools, and
# shipping them would put a web server into a public bundle. Kept in
# step by hand — the shell script is the authority, and this list
# disagreeing with it is itself worth a failure, which is what the
# unexpected-extras check below catches.
# `.zip` is here because the packaged archive was once written into the
# website directory by a mis-scoped copy, and `package-site.sh` excludes
# neither — so the next build would have shipped a 502KB copy of the
# previous site inside the new one. Excluded in both places.
SKIP_EXT = {".mjs", ".zip"}
SKIP_NAMES = {"package-site.sh", "DEPLOY.md", ".DS_Store"}


def digest(data):
    return hashlib.sha256(data).hexdigest()[:16]


def main():
    if not os.path.isdir(SITE):
        print(f"  no website at {SITE}")
        return 1
    if not os.path.exists(ZIP):
        print("  potatofarm-site.zip does not exist.")
        print("  Build it:  bash 02-the-project/website/package-site.sh")
        return 1

    expected = {}
    for base, _, files in os.walk(SITE):
        for f in files:
            if f in SKIP_NAMES or os.path.splitext(f)[1] in SKIP_EXT:
                continue
            full = os.path.join(base, f)
            rel = os.path.relpath(full, SITE)
            with open(full, "rb") as fh:
                expected[rel] = digest(fh.read())

    with zipfile.ZipFile(ZIP) as z:
        packed = {
            i.filename: digest(z.read(i))
            for i in z.infolist()
            if not i.is_dir()
        }

    missing = sorted(set(expected) - set(packed))
    extra = sorted(set(packed) - set(expected))
    stale = sorted(f for f in set(expected) & set(packed) if expected[f] != packed[f])

    print("Deployment package\n")
    print(f"  {len(expected)} file(s) in the site, {len(packed)} in the archive")

    if not (missing or extra or stale):
        print("\n  the package is the site.\n")
        return 0

    for label, items, why in (
        ("missing from the package", missing,
         "these exist on the site and would not be deployed"),
        ("in the package and not on the site", extra,
         "these would be deployed and nothing produces them any more"),
        ("different in the package", stale,
         "the deployed copy would not be what this repository says"),
    ):
        if not items:
            continue
        print(f"\n  {len(items)} {label} — {why}:")
        for f in items[:12]:
            print(f"    x {f}")
        if len(items) > 12:
            print(f"    … and {len(items) - 12} more")

    print("\n  Rebuild it:  bash 02-the-project/website/package-site.sh")
    print("  It is gitignored, so nothing else will tell you.\n")
    return 1


sys.exit(main())
