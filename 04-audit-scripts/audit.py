#!/usr/bin/env python3
"""
Static audit of the built site.

This runs against the real HTML rather than trusting that the templates
were right. It catches the class of mistake that survives a code review
and fails in a screen reader: a skipped heading level, an input with no
label, a link that just says "here".
"""
import glob, json, os, re, sys
from bs4 import BeautifulSoup

FAILS, WARNS = [], []

def fail(page, msg): FAILS.append(f"{page}: {msg}")
def warn(page, msg): WARNS.append(f"{page}: {msg}")


# ---------- contrast ----------
def luminance(hexcol):
    r, g, b = (int(hexcol[i:i+2], 16) / 255 for i in (1, 3, 5))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def ratio(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def check_contrast():
    print("\n--- Contrast (WCAG AA needs 4.5:1 body, 3:1 large) ---")
    base, raised, high = "#F4F1EA", "#FBFAF7", "#F4F1EA"
    pairs = [
        ("ink on paper",         "#16181C", base,   4.5),
        ("secondary on paper",   "#4A4E57", base,   4.5),
        ("tertiary on paper",    "#6A6E78", base,   4.5),
        ("secondary on card",    "#4A4E57", raised, 4.5),
        ("tertiary on card",     "#6A6E78", raised, 4.5),
        ("seal on paper",        "#A83226", base,   4.5),
        ("seal on card",         "#A83226", raised, 4.5),
        ("paper text on seal",   "#F4F1EA", "#A83226", 4.5),
        ("consent text on ink",  "#CFCEC9", "#16181C", 4.5),
        ("error on card",        "#A83226", raised, 4.5),
    ]
    for name, fg, bg, need in pairs:
        r = ratio(fg, bg)
        ok = r >= need
        print(f"  {'PASS' if ok else 'FAIL'}  {name:22} {r:5.2f}:1  (needs {need})")
        if not ok:
            FAILS.append(f"contrast: {name} is {r:.2f}:1, needs {need}:1")


# ---------- markup ----------
def check_pages(folder):
    print("\n--- Markup ---")
    for path in sorted(glob.glob(os.path.join(folder, "*.html"))):
        page = os.path.basename(path)
        soup = BeautifulSoup(open(path).read(), "html.parser")

        if not soup.html or not soup.html.get("lang"):
            fail(page, "no lang attribute on <html>")

        h1s = soup.find_all("h1")
        if len(h1s) != 1:
            fail(page, f"{len(h1s)} h1 elements, expected exactly 1")

        # Heading order: never skip a level going down.
        levels = [int(h.name[1]) for h in soup.find_all(re.compile("^h[1-6]$"))]
        for a, b in zip(levels, levels[1:]):
            if b > a + 1:
                warn(page, f"heading jumps from h{a} to h{b}")
                break

        # Every image needs alt. Decorative ones need alt="" or aria-hidden.
        for img in soup.find_all("img"):
            if img.get("alt") is None and not img.get("aria-hidden"):
                fail(page, f"<img> with no alt: {str(img)[:60]}")

        # Inputs need a programmatic label.
        for f_ in soup.find_all(["input", "select", "textarea"]):
            if f_.get("type") in ("hidden", "submit", "button"):
                continue
            fid = f_.get("id")
            labelled = (
                (fid and soup.find("label", attrs={"for": fid}))
                or f_.get("aria-label")
                or f_.get("aria-labelledby")
                or f_.find_parent("label")
            )
            # A field that is aria-hidden AND out of tab order is
            # deliberately outside the accessibility tree — a honeypot.
            # Requiring a label for one is not merely wrong, it defeats
            # the thing: a labelled field is one a careful bot reads.
            #
            # Both attributes together, never one alone. `aria-hidden` on
            # a focusable element IS a real fault and this must not start
            # excusing it.
            honeypot = f_.get("aria-hidden") == "true" and f_.get("tabindex") == "-1"
            if not labelled and not honeypot:
                fail(page, f"unlabelled field: {str(f_)[:60]}")

        # Interactive elements need an accessible name.
        for b in soup.find_all("button"):
            if not (b.get_text(strip=True) or b.get("aria-label")):
                fail(page, f"button with no accessible name: {str(b)[:60]}")

        for a in soup.find_all("a"):
            txt = a.get_text(strip=True) or a.get("aria-label") or ""
            if not txt:
                fail(page, f"link with no text: {str(a)[:60]}")
            elif txt.lower() in {"click here", "here", "read more", "more", "link"}:
                warn(page, f"vague link text: '{txt}'")

        ids = [e["id"] for e in soup.find_all(attrs={"id": True})]
        dups = {i for i in ids if ids.count(i) > 1}
        if dups:
            fail(page, f"duplicate ids: {sorted(dups)}")

        title = soup.find("title")
        if not title or not title.get_text(strip=True):
            fail(page, "no <title>")
        desc = soup.find("meta", attrs={"name": "description"})
        if not desc:
            fail(page, "no meta description")
        elif not (70 <= len(desc.get("content", "")) <= 160):
            warn(page, f"meta description is {len(desc.get('content',''))} chars (aim 70-160)")

        # A 404 carries noindex and correctly has no canonical. Pointing
        # one at itself tells a crawler the error page is a real
        # destination, which is worse than having none.
        noindex = soup.find("meta", attrs={"name": "robots"})
        is_error = "404" in page or (noindex and "noindex" in noindex.get("content", ""))
        if not is_error and not soup.find("link", attrs={"rel": "canonical"}):
            fail(page, "no canonical")

        for s in soup.find_all("script", attrs={"type": "application/ld+json"}):
            try:
                json.loads(s.string.replace("\\u003c", "<"))
            except Exception as e:
                fail(page, f"JSON-LD does not parse: {e}")

        if not soup.find("a", class_="skip"):
            warn(page, "no skip link")

        print(f"  checked {page}")


if __name__ == "__main__":
    folder = sys.argv[1] if len(sys.argv) > 1 else "."
    check_contrast()
    check_pages(folder)

    print("\n" + "=" * 58)
    if FAILS:
        print(f"{len(FAILS)} FAILURE(S)")
        for f_ in FAILS: print("  x", f_)
    else:
        print("0 failures")
    if WARNS:
        print(f"\n{len(WARNS)} warning(s)")
        for w in WARNS: print("  !", w)
    sys.exit(1 if FAILS else 0)


# ---------- assistant safety invariants ----------
def check_tipping_off(root):
    """Agent-facing screens must never name a sanctions reason.

    Telling an agent "possible terrorist financing match" is how a
    subject gets tipped off, which is an offence under UAE AML rules —
    separate from, and often more serious than, the underlying matter.

    The router already returns a deliberately bland message for a held
    screening. This checks nothing downstream enriches it: an agent
    screen must not contain the vocabulary at all.
    """
    import glob, re, os
    # "financing" is an ordinary offer field — cash or mortgage — and
    # has nothing to do with sanctions. Including it flagged three
    # perfectly correct screens, which is how a check teaches people to
    # ignore it.
    BANNED = ["sanction", "terrorist financ", "PEP match", "watchlist",
              "CONFIRMED_MATCH", "POSSIBLE_MATCH", "listName", "matchedOn"]
    # Compliance screens are gated on compliance:read and are allowed
    # every one of these. Only the agent surfaces are checked.
    AGENT = [f for f in glob.glob(os.path.join(root, "src/app/**/*.tsx"), recursive=True)
             if "/compliance/" not in f.replace("\\", "/")]
    ok = True
    for f in AGENT:
        body = open(f).read()
        # Comments explaining the rule are not violations of it. This
        # check flagged its own documentation on the first run.
        body = re.sub(r'/\*.*?\*/', '', body, flags=re.S)
        body = re.sub(r'^\s*//.*$', '', body, flags=re.M)
        hits = [w for w in BANNED if re.search(rf'"[^"]*{re.escape(w)}', body, re.I)
                or re.search(rf'>[^<]*{re.escape(w)}', body, re.I)]
        if hits:
            print(f"  FAIL  {os.path.basename(f)} names {', '.join(hits)} on an agent screen")
            ok = False
    if ok:
        print(f"  PASS  no agent screen names a sanctions reason ({len(AGENT)} checked)")
    return ok


def check_blackbook(root):
    """The blackbook privacy invariants.

    Two claims are made to the agent: their notes are private, and the
    book is scoped to them. Both are worth nothing as documentation and
    everything as a check — a single dropped `agentId` filter turns a
    private note into a manager's report, and nobody would notice.
    """
    import glob, re, os
    src = {p2: open(p2).read()
           for p2 in glob.glob(os.path.join(root, "src/server/api/routers/blackbook.ts"))}
    if not src:
        print("  SKIP  no blackbook router"); return True
    body = list(src.values())[0]

    ok = True
    # 1. Every procedure that touches the table scopes to the caller.
    #
    #    Sliced by brace depth from each procedure name. The first
    #    version cut a fixed number of characters and truncated before
    #    reaching the `where` clause, so a correctly-scoped procedure
    #    reported as unscoped. Guessing at block boundaries is how a
    #    check cries wolf.
    starts = [(m.group(1), m.start())
              for m in re.finditer(r'^  (\w+): require', body, re.M)]
    for i, (name, at) in enumerate(starts):
        end = starts[i + 1][1] if i + 1 < len(starts) else len(body)
        blk = body[at:end]
        if ".blackbookEntry." not in blk:
            continue
        if "ctx.userId" not in blk:
            print(f"  FAIL  blackbook.{name} touches the table without scoping "
                  f"to ctx.userId")
            ok = False

    # 2. The private note is never audited.
    note_blk = body[body.index("  note:"):] if "  note:" in body else ""
    note_blk = note_blk[:note_blk.find("exportMine")] if "exportMine" in note_blk else note_blk
    if "audit(" in note_blk:
        print("  FAIL  the private note is audited — an audit row is a record a "
              "manager can read, which makes the note public")
        ok = False
    else:
        print("  PASS  private note is not audited")

    if ok:
        print("  PASS  every blackbook procedure is scoped to the calling agent")
    return ok


def check_assistant(root):
    """
    Two invariants that must never regress, checked structurally rather
    than by reading the code and hoping.
    """
    import os
    print("\n--- Assistant invariants ---")
    ok = True

    replay = os.path.join(root, "src/server/assistant/replay.ts")
    if os.path.exists(replay):
        src = open(replay).read()
        banned = [b for b in ("sendText", "sendTemplate", "getChannelCredentials", "whatsapp") if b in src]
        if banned:
            FAILS.append(f"replay.ts can reach a send path: {banned}")
            ok = False
        else:
            print("  PASS  replay has no send capability")

    run = os.path.join(root, "src/server/assistant/run.ts")
    if os.path.exists(run):
        src = open(run).read()
        # The control gate must come before any model call.
        gate_at = src.find("await gate(")
        model_at = src.find("callModel(")
        if gate_at == -1 or (model_at != -1 and gate_at > model_at):
            FAILS.append("run.ts calls the model before checking the kill switch")
            ok = False
        else:
            print("  PASS  kill switch is checked before any model call")

    # Same invariant, one level down. An agent muting a conversation is
    # worthless if the model is called anyway.
    # open(), not read() — there is no read() helper in this module and
    # the first version threw a NameError that I only did not see because
    # I piped stderr into a grep for PASS and FAIL. A check that crashes
    # silently is worse than no check.
    run_path = os.path.join(root, "src/server/assistant/run.ts")
    run_src = open(run_path).read() if os.path.exists(run_path) else ""
    mute_at = run_src.find("isMuted")
    call_at = run_src.find("api.anthropic.com")
    if mute_at == -1:
        FAILS.append("conversation mute is never checked in the reply path")
        print("  FAIL  conversation mute is checked before any model call")
        ok = False
    elif call_at != -1 and mute_at > call_at:
        FAILS.append("conversation mute is checked after the model call")
        print("  FAIL  conversation mute is checked before any model call")
        ok = False
    else:
        print("  PASS  conversation mute is checked before any model call")
    return ok
