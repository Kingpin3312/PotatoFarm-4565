"""Every screen the manual shows was captured with content on it, not a
loading placeholder. Documents and Reports went into edition 2 as grey
blocks: their placeholders do not say "Loading", they are marked
aria-busy, and the capture waited only for the word."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content import S
texts = json.load(open(sys.argv[1]))
chrome = re.compile(r"^(Skip to content|PotatoFarm\.io|PotatoFarm|\.io|Today|Inbox|Leads|Listings|Pipeline|Diary|Settings|Search|Ctrl K|Ctrl|K|Marina Bay Properties|Demo.*|More)$")
bad = []
for s in S:
    for name, _ in s["imgs"]:
        body = " ".join(l for l in texts.get(name, {}).get("text", "").split("\n") if l.strip() and not chrome.match(l.strip()))
        if len(body) < 80 or re.search(r"\bLoading\b", body): bad.append((s["id"], name, len(body)))
for b in bad: print("EMPTY OR LOADING:", b)
print(f"{sum(len(s['imgs']) for s in S)} screenshots checked, {len(bad)} empty or loading")
