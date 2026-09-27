"""Build the training manual HTML from content.py and the captured screens.

python build.py [pages.json]   -> manual.html (pages.json fills the contents page numbers)
"""
import html, json, os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from content import PARTS, ROLES, S, ROUTINES, TROUBLE, GLOSSARY

HERE = os.path.dirname(os.path.abspath(__file__))
RAW, IMG = f"{HERE}/raw", f"{HERE}/img"
os.makedirs(IMG, exist_ok=True)
pages = json.load(open(sys.argv[1])) if len(sys.argv) > 1 and os.path.exists(sys.argv[1]) else {}

CROP_TOP = {"today": 0.74, "person": 0.74, "reports": 0.74}

def img(name):
    """A compressed copy of a capture; returns (file, is_phone, aspect)."""
    src = f"{RAW}/{name}.png"
    im = Image.open(src).convert("RGB")
    w, h = im.size
    if name in CROP_TOP and h / w > 0.8:
        # The top of a long screen, at the size every other screenshot is:
        # squeezing the whole page onto one sheet made it unreadable.
        im = im.crop((0, 0, w, round(w * CROP_TOP[name]))); h = im.size[1]
    phone = w < 1000
    tw = 560 if phone else 1500
    out = f"{IMG}/{name}.jpg"
    if True:
        im.resize((tw, round(h * tw / w)), Image.LANCZOS).save(out, quality=80, optimize=True)
    return f"img/{name}.jpg", phone, h / w

MARK = open("/home/user/PotatoFarm-4565/02-the-project/app/public/favicon.svg").read()
FONTS = f"{HERE}/fonts/package/files"

css = f"""
@font-face {{ font-family: Inter; font-weight: 400; src: url('file://{FONTS}/inter-latin-400-normal.woff2') format('woff2'); }}
@font-face {{ font-family: Inter; font-weight: 500; src: url('file://{FONTS}/inter-latin-500-normal.woff2') format('woff2'); }}
@font-face {{ font-family: Inter; font-weight: 600; src: url('file://{FONTS}/inter-latin-600-normal.woff2') format('woff2'); }}
@font-face {{ font-family: Inter; font-weight: 700; src: url('file://{FONTS}/inter-latin-700-normal.woff2') format('woff2'); }}
@font-face {{ font-family: Inter; font-weight: 800; src: url('file://{FONTS}/inter-latin-800-normal.woff2') format('woff2'); }}
:root {{
  --ground:#292C32; --deep:#1F2126; --pink:#FF1493; --pinkdeep:#C8106F; --pinksoft:#FFE6F2;
  --ink:#1D2025; --ink2:#454A53; --ink3:#737985; --rule:#E2E4E8; --panel:#F4F5F7; --paper:#FFFFFF;
}}
@page {{ size: A4; margin: 17mm 17mm 21mm 17mm; }}
@page :first {{ margin: 0; }}
@page bleed {{ margin: 0; }}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; background: var(--paper); color: var(--ink2); font-family: Inter, "Liberation Sans", Arial, sans-serif;
  font-size: 10pt; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
b, strong {{ color: var(--ink); font-weight: 600; }}
i {{ font-style: italic; }}
h1, h2, h3 {{ color: var(--ink); margin: 0; line-height: 1.15; letter-spacing: -0.015em; text-wrap: balance; }}
.marker {{ position: absolute; font-size: 2pt; color: #fff; opacity: .01; }}

/* cover */
.cover {{ page: bleed; width: 210mm; height: 297mm; background: var(--ground); color: #fff; position: relative; overflow: hidden; }}
.cover .glow {{ position: absolute; width: 170mm; height: 170mm; right: -60mm; top: -50mm; border-radius: 50%;
  background: radial-gradient(circle, rgba(255,20,147,.28), rgba(255,20,147,0) 65%); }}
.cover .top {{ position: absolute; left: 20mm; top: 22mm; display: flex; align-items: center; gap: 4mm; }}
.cover .top svg {{ width: 15mm; height: 15mm; }}
.word {{ font-weight: 700; font-size: 17pt; color: #fff; letter-spacing: -0.02em; }}
.word em {{ font-style: normal; color: var(--pink); }}
.cover .title {{ position: absolute; left: 20mm; top: 62mm; right: 20mm; }}
.cover .kicker {{ font-size: 9pt; letter-spacing: .18em; text-transform: uppercase; color: var(--pink); font-weight: 600; }}
.cover h1 {{ color: #fff; font-size: 44pt; font-weight: 800; letter-spacing: -0.035em; margin-top: 5mm; line-height: 1.02; }}
.cover .sub {{ color: #C9CCD2; font-size: 13pt; margin-top: 6mm; max-width: 125mm; line-height: 1.45; }}
.cover .shots {{ position: absolute; left: 20mm; right: 0; bottom: 30mm; height: 118mm; }}
.cover .shots .desk {{ position: absolute; left: 0; bottom: 0; width: 158mm; border-radius: 3mm; border: .4mm solid #444852;
  box-shadow: 0 6mm 16mm rgba(0,0,0,.45); }}
.cover .shots .ph {{ position: absolute; right: 16mm; bottom: -8mm; width: 44mm; border-radius: 5mm; border: .8mm solid #444852;
  box-shadow: 0 6mm 16mm rgba(0,0,0,.5); }}
.cover .foot {{ position: absolute; left: 20mm; right: 20mm; bottom: 12mm; display: flex; justify-content: space-between;
  color: #9EA4AE; font-size: 8.5pt; }}

/* back cover */
.back {{ page: bleed; break-before: page; width: 210mm; height: 297mm; background: var(--ground); color: #C9CCD2; position: relative; }}
.back .mid {{ position: absolute; left: 0; right: 0; top: 110mm; text-align: center; }}
.back svg {{ width: 24mm; height: 24mm; }}
.back .word {{ font-size: 22pt; display: block; margin-top: 5mm; }}
.back p {{ margin: 5mm auto 0; max-width: 120mm; font-size: 10.5pt; }}
.back .contact {{ position: absolute; bottom: 22mm; left: 0; right: 0; text-align: center; font-size: 9pt; color: #9EA4AE; }}

/* running pages */
.page {{ break-before: page; }}
.eyebrow {{ font-size: 8pt; letter-spacing: .16em; text-transform: uppercase; color: var(--pinkdeep); font-weight: 600; }}
.lead {{ font-size: 11.5pt; color: var(--ink2); max-width: 160mm; }}
.contents h1, .roles h1, .ref h1 {{ font-size: 26pt; font-weight: 800; margin: 3mm 0 5mm; }}
.toc-part {{ margin-top: 3.2mm; padding-top: 2mm; border-top: .3mm solid var(--rule); display: grid; grid-template-columns: 12mm 1fr 12mm; }}
.toc-part .n {{ color: var(--pink); font-weight: 700; font-size: 11pt; }}
.toc-part .t {{ color: var(--ink); font-weight: 700; font-size: 11pt; }}
.toc-part .p, .toc-row .p {{ text-align: right; font-variant-numeric: tabular-nums; color: var(--ink3); }}
.toc-row {{ display: grid; grid-template-columns: 12mm 1fr 12mm; font-size: 9pt; padding: .45mm 0; }}
.toc-row .t {{ color: var(--ink2); display: flex; gap: 2mm; }}
.toc-row .t::after {{ content: ""; flex: 1; border-bottom: .25mm dotted #C5C9D0; transform: translateY(-1.2mm); }}

table {{ border-collapse: collapse; width: 100%; font-size: 9pt; }}
th, td {{ text-align: left; padding: 2.4mm 2.6mm; border-bottom: .25mm solid var(--rule); vertical-align: top; }}
th {{ color: var(--ink3); font-weight: 600; font-size: 7.5pt; letter-spacing: .08em; text-transform: uppercase; background: var(--panel); }}
td:first-child {{ color: var(--ink); font-weight: 600; }}
.yes {{ color: var(--pinkdeep); font-weight: 700; }}
.no {{ color: #B9BDC5; }}

/* part divider */
.divider {{ break-before: page; height: 257mm; background: var(--ground); border-radius: 4mm; color: #fff; position: relative; overflow: hidden; }}
.divider .glow {{ position: absolute; width: 150mm; height: 150mm; left: -50mm; bottom: -60mm; border-radius: 50%;
  background: radial-gradient(circle, rgba(255,20,147,.30), rgba(255,20,147,0) 65%); }}
.divider .num {{ position: absolute; left: 14mm; top: 14mm; font-size: 90pt; font-weight: 800; color: var(--pink); line-height: 1; letter-spacing: -0.05em; }}
.divider .txt {{ position: absolute; left: 14mm; right: 14mm; bottom: 26mm; }}
.divider h2 {{ color: #fff; font-size: 34pt; font-weight: 800; letter-spacing: -0.03em; }}
.divider p {{ color: #C9CCD2; font-size: 12.5pt; max-width: 120mm; margin-top: 5mm; }}
.divider ul {{ list-style: none; padding: 0; margin: 8mm 0 0; columns: 2; column-gap: 8mm; color: #E4E6EA; font-size: 9.5pt; }}
.divider li {{ padding: 1mm 0; break-inside: avoid; }}
.divider li span {{ color: var(--pink); font-weight: 700; margin-right: 2mm; font-variant-numeric: tabular-nums; }}

/* section */
.sec {{ break-before: page; }}
.sec-head {{ display: flex; align-items: baseline; gap: 4mm; }}
.sec-no {{ font-size: 11pt; font-weight: 700; color: var(--pink); font-variant-numeric: tabular-nums; }}
.sec h2 {{ font-size: 21pt; font-weight: 800; }}
.chips {{ margin: 3mm 0 0; display: flex; gap: 1.6mm; flex-wrap: wrap; }}
.chip {{ font-size: 7.3pt; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--pinkdeep);
  background: var(--pinksoft); border-radius: 10mm; padding: .6mm 2.6mm; }}
.intro {{ margin: 4mm 0 0; font-size: 10.5pt; color: var(--ink2); }}
figure {{ margin: 5mm 0 0; break-inside: avoid; }}
figure img {{ display: block; width: auto; max-width: 100%; max-height: 100mm; margin: 0 auto; border-radius: 2mm; border: .3mm solid #D5D8DD; box-shadow: 0 1.2mm 3.5mm rgba(29,32,37,.12); }}
figure.tall img {{ max-height: 128mm; }}
.phones figure img {{ max-height: 84mm; }}
figcaption {{ text-align: center; }}
figcaption {{ font-size: 8.3pt; color: var(--ink3); margin-top: 2mm; }}
.phones {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; margin-top: 5mm; }}
.phones figure {{ margin: 0; }}
.phones figure img {{ border-radius: 4mm; }}
.pair {{ display: grid; grid-template-columns: 1fr; gap: 0; }}
h3 {{ font-size: 11.5pt; font-weight: 700; margin: 6mm 0 2.5mm; }}
ol.steps {{ list-style: none; margin: 0; padding: 0; counter-reset: s; display: grid; gap: 2.2mm; }}
ol.steps li {{ counter-increment: s; position: relative; padding-left: 9mm; break-inside: avoid; }}
ol.steps li::before {{ content: counter(s); position: absolute; left: 0; top: .2mm; width: 5.6mm; height: 5.6mm; border-radius: 50%;
  background: var(--pink); color: #fff; font-size: 7.6pt; font-weight: 700; text-align: center; line-height: 5.6mm; }}
.tips {{ margin-top: 5mm; background: var(--panel); border-radius: 2.5mm; padding: 3.5mm 4.5mm; break-inside: avoid; }}
.tips .eyebrow {{ color: var(--ink3); }}
.tips ul {{ margin: 1.5mm 0 0; padding-left: 4.5mm; }}
.tips li {{ margin: 1.2mm 0; }}
.tips li::marker {{ color: var(--pink); }}

/* reference */
.routines {{ display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }}
.card {{ border: .3mm solid var(--rule); border-radius: 2.5mm; padding: 4mm; break-inside: avoid; }}
.card h3 {{ margin: 0 0 2mm; font-size: 10.5pt; }}
.card ul {{ list-style: none; padding: 0; margin: 0; }}
.card li {{ padding: 1.2mm 0 1.2mm 6.5mm; position: relative; font-size: 9.3pt; }}
.card li::before {{ content: ""; position: absolute; left: 0; top: 2.1mm; width: 3.4mm; height: 3.4mm; border: .35mm solid var(--pink); border-radius: .8mm; }}
.qa {{ display: grid; gap: 3mm; }}
.qa div {{ border-left: .8mm solid var(--pink); padding: 1mm 0 1mm 4mm; break-inside: avoid; }}
.qa .q {{ display: block; margin-bottom: .8mm; color: var(--ink); font-weight: 600; }}
dl.gl {{ display: grid; grid-template-columns: 46mm 1fr; gap: 2.2mm 5mm; margin: 0; font-size: 9.3pt; }}
dl.gl dt {{ color: var(--ink); font-weight: 600; }}
dl.gl dd {{ margin: 0; }}
"""

def esc(s): return html.escape(s, quote=True)

out = []
out.append(f"<!doctype html><html lang='en-GB'><head><meta charset='utf-8'><title>PotatoFarm.io Training Manual</title><style>{css}</style></head><body>")

# cover
desk, _, _ = img("inbox-thread")
ph, _, _ = img("m-today")
out.append(f"""<section class="cover"><div class="glow"></div>
<div class="top">{MARK}<span class="word">PotatoFarm<em>.io</em></span></div>
<div class="title"><div class="kicker">Training manual</div><h1>Every enquiry answered.<br>Every deal on track.</h1>
<p class="sub">The complete guide to PotatoFarm.io for agents, managers, owners and compliance officers, on desktop and on your phone.</p></div>
<div class="shots"><img class="desk" src="{desk}" alt=""><img class="ph" src="{ph}" alt=""></div>
<div class="foot"><span>Edition 1 · September 2026</span><span>potatofarm.io</span></div></section>""")

# number sections
num = {}
for pi, (pid, ptitle, _) in enumerate(PARTS, 1):
    k = 0
    for s in S:
        if s["part"] == pid:
            k += 1; num[s["id"]] = f"{pi}.{k}"
ref_items = [("routines", "Routines by role"), ("trouble", "When something looks wrong"), ("glossary", "Words we use")]
for k, (rid, _) in enumerate(ref_items, 1):
    num[rid] = f"{len(PARTS)}.{k}"

def pg(key): return str(pages.get(key, "")) if pages else ""

# contents
out.append('<section class="page contents"><div class="marker">§contents§</div><div class="eyebrow">Contents</div><h1>What’s inside</h1>')
out.append(f'<div class="toc-row"><span></span><span class="t">Who does what</span><span class="p">{pg("roles")}</span></div>')
for pi, (pid, ptitle, _) in enumerate(PARTS, 1):
    out.append(f'<div class="toc-part"><span class="n">{pi}</span><span class="t">{esc(ptitle)}</span><span class="p">{pg("part-"+pid)}</span></div>')
    items = [(s["id"], s["title"]) for s in S if s["part"] == pid] + (ref_items if pid == "ref" else [])
    for sid, t in items:
        out.append(f'<div class="toc-row"><span class="p" style="text-align:left">{num[sid]}</span><span class="t">{esc(t)}</span><span class="p">{pg(sid)}</span></div>')
out.append('</section>')

# roles
R = [
    ("See every lead in the brokerage", "", "no", "yes", "yes", "yes", "yes"),
    ("See their own leads and message them", "", "yes", "yes", "yes", "yes", "no"),
    ("Add and edit leads, book viewings", "", "yes", "yes", "yes", "yes", "no"),
    ("Give leads to agents, import and export", "", "no", "yes", "yes", "yes", "no"),
    ("Add and change listings", "", "no", "yes", "yes", "yes", "no"),
    ("See the brokerage's revenue", "", "no", "yes", "yes", "yes", "no"),
    ("Invite people", "", "no", "yes", "yes", "yes", "no"),
    ("Remove people, change channels, settle commission", "", "no", "no", "yes", "yes", "no"),
    ("Billing", "", "no", "no", "no", "yes", "no"),
    ("Open Compliance and decide on reports", "", "no", "no", "no", "no", "yes"),
]
out.append('<section class="page roles"><div class="marker">§roles§</div><div class="eyebrow">Before you start</div><h1>Who does what</h1>')
out.append('<p class="lead">Everybody signs in to the same system and sees what their role needs. Each section of this manual is marked with the roles it is for.</p>')
out.append('<table style="margin-top:6mm"><thead><tr><th style="width:44%">What</th><th>Agent</th><th>Manager</th><th>Admin</th><th>Owner</th><th>Compliance officer</th></tr></thead><tbody>')
for row in R:
    cells = "".join(f'<td class="{c}">{"●" if c=="yes" else "–"}</td>' for c in row[2:])
    out.append(f"<tr><td>{esc(row[0])}</td>{cells}</tr>")
out.append('</tbody></table>')
out.append('<div class="tips" style="margin-top:7mm"><div class="eyebrow">Good to know</div><ul>'
           '<li>A <b>Viewer</b> can read leads, conversations and listings and change nothing: for a partner or an auditor.</li>'
           '<li>Owners and admins cannot open Compliance. By law, the compliance officer’s reports are kept from everybody else: telling a client a report has been filed is an offence.</li>'
           '<li>Agents see their own leads; managers and owners see everybody’s. An agent handling another piece of business with a person (a letting alongside a purchase) can read that person’s page, but changes to the lead stay with its own agent.</li>'
           '</ul></div></section>')

CAP = {"layout": 80, "setup": 78, "thread": 84, "set-assistant": 84, "set-channels": 64, "today": 88, "person": 80}

def section(s):
    o = [f'<section class="sec"><div class="marker">§{s["id"]}§</div>',
         f'<div class="sec-head"><span class="sec-no">{num[s["id"]]}</span><h2>{esc(s["title"])}</h2></div>',
         '<div class="chips">' + "".join(f'<span class="chip">{ROLES[r]}</span>' for r in s["roles"]) + '</div>',
         f'<p class="intro">{s["intro"]}</p>']
    phones = [(n, c) for n, c in s["imgs"] if img(n)[1]]
    desks = [(n, c) for n, c in s["imgs"] if not img(n)[1]]
    for n, c in desks:
        f, _, a = img(n)
        cls = "tall" if a > 0.9 else ""
        cap = CAP.get(s["id"])
        style = f' style="max-height:{cap}mm"' if cap else ""
        o.append(f'<figure class="{cls}"><img src="{f}"{style} alt="{esc(c)}"><figcaption>{esc(c)}</figcaption></figure>')
    if phones:
        o.append('<div class="phones">' + "".join(f'<figure><img src="{img(n)[0]}" alt="{esc(c)}"><figcaption>{esc(c)}</figcaption></figure>' for n, c in phones) + '</div>')
    if s["steps"]:
        o.append('<h3>How to</h3><ol class="steps">' + "".join(f"<li>{x}</li>" for x in s["steps"]) + "</ol>")
    if s["tips"]:
        o.append('<div class="tips"><div class="eyebrow">Good to know</div><ul>' + "".join(f"<li>{x}</li>" for x in s["tips"]) + "</ul></div>")
    o.append("</section>")
    return "".join(o)

for pi, (pid, ptitle, pdesc) in enumerate(PARTS, 1):
    items = [(num[s["id"]], s["title"]) for s in S if s["part"] == pid] + ([(num[r], t) for r, t in ref_items] if pid == "ref" else [])
    lis = "".join(f"<li><span>{n}</span>{esc(t)}</li>" for n, t in items)
    out.append(f'<section class="divider"><div class="marker">§part-{pid}§</div><div class="glow"></div><div class="num">{pi:02d}</div>'
               f'<div class="txt"><h2>{esc(ptitle)}</h2><p>{esc(pdesc)}</p><ul>{lis}</ul></div></section>')
    for s in S:
        if s["part"] == pid:
            out.append(section(s))
    if pid == "ref":
        out.append(f'<section class="sec ref"><div class="marker">§routines§</div><div class="sec-head"><span class="sec-no">{num["routines"]}</span><h2>Routines by role</h2></div>'
                   '<p class="intro">Tick through these until they are habit. They are the difference between a CRM that is filled in and one that is used.</p><div class="routines" style="margin-top:5mm">')
        for t, items in ROUTINES:
            out.append(f'<div class="card"><h3>{esc(t)}</h3><ul>' + "".join(f"<li>{esc(x)}</li>" for x in items) + "</ul></div>")
        out.append("</div></section>")
        out.append(f'<section class="sec ref"><div class="marker">§trouble§</div><div class="sec-head"><span class="sec-no">{num["trouble"]}</span><h2>When something looks wrong</h2></div><div class="qa" style="margin-top:5mm">')
        for q, a in TROUBLE:
            out.append(f"<div><span class=\"q\">{esc(q)}</span>{a}</div>")
        out.append('</div><div class="tips" style="margin-top:7mm"><div class="eyebrow">Still stuck?</div><ul><li>Email <b>hello@potatofarm.io</b> from the address you sign in with, and a person will reply.</li></ul></div></section>')
        out.append(f'<section class="sec ref"><div class="marker">§glossary§</div><div class="sec-head"><span class="sec-no">{num["glossary"]}</span><h2>Words we use</h2></div><dl class="gl" style="margin-top:6mm">')
        for t, d in GLOSSARY:
            out.append(f"<dt>{esc(t)}</dt><dd>{esc(d)}</dd>")
        out.append("</dl></section>")

out.append(f"""<section class="back"><div class="marker">§back§</div><div class="mid">{MARK}<span class="word">PotatoFarm<em>.io</em></span>
<p>Every property enquiry answered in seconds, qualified in the buyer’s own language, and carried through to transfer.</p></div>
<div class="contact">hello@potatofarm.io · potatofarm.io · Dubai, United Arab Emirates</div></section>""")
out.append("</body></html>")
open(f"{HERE}/manual.html", "w").write("".join(out))
print("sections", len(S), "images", len(os.listdir(IMG)))
