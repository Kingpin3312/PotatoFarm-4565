"""Edition 2 of the training manual: the same words, set the way a
top-end agency's printed material is set.

python build.py [pages.json]  -> manual.html
"""
import html, json, os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content import PARTS, ROLES, S, ROUTINES, TROUBLE, GLOSSARY

HERE = os.path.dirname(os.path.abspath(__file__))
RAW, IMG = f"{HERE}/raw", f"{HERE}/img"
os.makedirs(IMG, exist_ok=True)
pages = json.load(open(sys.argv[1])) if len(sys.argv) > 1 and os.path.exists(sys.argv[1]) else {}
F = f"{HERE}/fonts/package/files"
# A flat image of the potato: the inline SVG blurs and fades, which a PDF
# carries as translucent layers that Apple's viewer draws as grey boxes.
MARK = '<img class="mark" src="img/mark_flat.png" alt="">'

# Per-section treatment, measured by .tmp/overflow.mjs: crop = keep the top
# of the screen at this height/width ratio; w = frame width in mm; wide =
# steps in two columns with the notes underneath.
TREAT = {
    "setup": {"crop": .42, "wide": True}, "today": {"crop": .52}, "thread": {"crop": .42, "wide": True},
    "leads": {"crop": .5}, "person": {"crop": .47, "wide": True}, "listings": {"crop": .6},
    "reports": {"crop": .58}, "compliance": {"w": 108}, "set-assistant": {"crop": .5}, "layout": {"crop": .6}, "phone": {"wide": True},
}
CROP = {}

def img(name):
    im = Image.open(f"{RAW}/{name}.png").convert("RGB")
    w, h = im.size
    if name in CROP and h / w > CROP[name]:
        im = im.crop((0, 0, w, round(w * CROP[name]))); h = im.size[1]
    phone = w < 1000
    tw = 700 if phone else 1800
    out = f"{IMG}/{name}.jpg"
    im.resize((tw, round(h * tw / w)), Image.LANCZOS).save(out, quality=84, optimize=True)
    return f"img/{name}.jpg", phone

URL = {"pub": "potatofarm.io"}
def url_for(name, cap):
    return "app.potatofarm.io"

css = f"""
@font-face {{ font-family: Inter; font-weight: 300; src: url('file://{F}/inter-latin-400-normal.woff2') format('woff2'); }}
"""
# Inter at 300 is not in the pack; fetch the light cut if it is there.
light = f"{F}/inter-latin-300-normal.woff2"
if os.path.exists(light):
    css = f"@font-face {{ font-family: Inter; font-weight: 300; src: url('file://{light}') format('woff2'); }}\n"
for wgt in (400, 500, 600, 700):
    css += f"@font-face {{ font-family: Inter; font-weight: {wgt}; src: url('file://{F}/inter-latin-{wgt}-normal.woff2') format('woff2'); }}\n"

css += """
:root {
  --char:#292C32; --char2:#23262B; --char3:#1C1E22; --line:#3A3E46;
  --ink:#16191D; --body:#474C54; --muted:#8B919B; --hair:#E4E5E8; --paper:#FFFFFF;
  --pink:#FF1493; --pinkdeep:#C8106F;
}
@page { size: A4; margin: 0; }
/* Every page is a fixed A4 sheet with its own inner spacing: this renderer
   ignores per-page margin rules, so nothing is left to the page box. */
section { width: 210mm; height: 297mm; overflow: hidden; position: relative; break-before: page; }
section:first-child { break-before: auto; }
.front, .refp { padding: 18mm 17mm 26mm; }
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--paper); color: var(--body); font-family: Inter, "Liberation Sans", Arial, sans-serif;
  font-size: 9.4pt; line-height: 1.62; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-feature-settings: "cv11", "ss01"; }
b, strong { color: var(--ink); font-weight: 600; }
h1, h2, h3 { margin: 0; color: var(--ink); font-weight: 300; letter-spacing: -0.022em; line-height: 1.08; text-wrap: balance; }
.marker { position: absolute; left: 3mm; bottom: 2mm; font-size: 2pt; line-height: 1; color: #fff; }
.cover .marker, .divider .marker, .back .marker { color: var(--char); }
.cap { font-size: 6.8pt; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; }
.rule { width: 14mm; height: .45mm; background: var(--pink); }

/* ---------- frames ---------- */
.browser { background: var(--char3); border: .35mm solid #50545D; border-radius: 2.6mm; overflow: hidden; outline: 1.2mm solid #2F3238; }
.browser .bar { height: 5.2mm; display: flex; align-items: center; gap: 1.4mm; padding: 0 2.6mm; background: #202226; border-bottom: .25mm solid var(--line); }
.browser .bar i { width: 1.6mm; height: 1.6mm; border-radius: 50%; background: #474B53; display: block; }
.browser .bar span { margin: 0 auto; transform: translateX(-4mm); font-size: 5.4pt; color: #8B919B; letter-spacing: .02em;
  background: #2A2D33; border-radius: 1mm; padding: .3mm 6mm; }
.browser img { display: block; width: 100%; }
.phone { background: #0E0F11; border-radius: 6.5mm; padding: 1.5mm; border: .35mm solid #50545D; }
.phone img { display: block; width: 100%; border-radius: 5.2mm; }

/* ---------- cover ---------- */
.cover { background: var(--char);
  color: #fff; position: relative; overflow: hidden; }
.cover .brand { position: absolute; left: 20mm; top: 20mm; display: flex; align-items: center; gap: 3mm; }
.cover .brand .mark { width: 9mm; height: 9mm; }
.word { font-weight: 600; font-size: 12pt; letter-spacing: -0.015em; color: #fff; }
.word em { font-style: normal; color: var(--pink); }
.cover .ed { position: absolute; right: 20mm; top: 22.5mm; color: #9EA4AE; }
.cover .t { position: absolute; left: 20mm; top: 58mm; right: 20mm; }
.cover .t .cap { color: #B8BDC5; }
.cover h1 { color: #fff; font-size: 50pt; line-height: 1.0; letter-spacing: -0.035em; margin-top: 7mm; }
.cover h1 span { color: #9EA4AE; }
.cover .t .rule { margin-top: 9mm; }
.cover .t p { color: #B8BDC5; font-size: 11.5pt; line-height: 1.55; max-width: 118mm; margin: 7mm 0 0; font-weight: 400; }
.cover .dev { position: absolute; left: 20mm; right: 20mm; bottom: 36mm; height: 104mm; }
.cover .dev .browser { position: absolute; left: 0; bottom: 0; width: 146mm; }
.cover .dev .phone { position: absolute; right: 2mm; bottom: -10mm; width: 43mm; }
.cover .foot { position: absolute; left: 20mm; right: 20mm; bottom: 14mm; display: flex; justify-content: space-between; color: #8B919B; }

.back { background: var(--char); position: relative; color: #B8BDC5; }
.back .mid { position: absolute; left: 0; right: 0; top: 118mm; text-align: center; }
.back .mark { width: 16mm; height: 16mm; }
.back .word { display: block; font-size: 17pt; margin-top: 5mm; }
.back p { max-width: 110mm; margin: 6mm auto 0; font-size: 10pt; line-height: 1.6; }
.back .rule { margin: 8mm auto 0; }
.back .foot { position: absolute; bottom: 18mm; left: 0; right: 0; text-align: center; color: #8B919B; }

/* ---------- front matter ---------- */
.front { }
.front .cap { color: var(--pinkdeep); }
.front h1 { font-size: 30pt; margin: 4mm 0 0; }
.front .rule { margin: 6mm 0 7mm; }
.front .lead { font-size: 11pt; color: var(--body); max-width: 150mm; margin: 0; }
.toc { columns: 2; column-gap: 12mm; margin-top: 2mm; }
.toc .part { break-inside: avoid; margin-bottom: 4.2mm; }
.toc .ph { display: flex; align-items: baseline; gap: 3mm; border-bottom: .25mm solid var(--hair); padding-bottom: 1.2mm; margin-bottom: 1.2mm; }
.toc .ph b { font-weight: 300; font-size: 15pt; color: var(--pink); letter-spacing: -0.02em; width: 8mm; }
.toc .ph span { color: var(--ink); font-weight: 600; font-size: 9.6pt; flex: 1; }
.toc .ph em, .toc .row em { font-style: normal; color: var(--muted); font-variant-numeric: tabular-nums; font-size: 8.6pt; }
.toc .row { display: flex; gap: 3mm; font-size: 8.2pt; padding: .15mm 0; line-height: 1.5; }
.toc .row i { font-style: normal; color: var(--muted); width: 8mm; font-variant-numeric: tabular-nums; }
.toc .row span { flex: 1; color: var(--body); }
table { border-collapse: collapse; width: 100%; font-size: 8.8pt; margin-top: 4mm; }
th { text-align: center; font-size: 6.4pt; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--muted);
  padding: 0 1.5mm 3mm; border-bottom: .3mm solid var(--ink); vertical-align: bottom; }
th:first-child { text-align: left; }
td { padding: 2.6mm 1.5mm; border-bottom: .25mm solid var(--hair); text-align: center; }
td:first-child { text-align: left; color: var(--ink); }
.dot { display: inline-block; width: 2.2mm; height: 2.2mm; border-radius: 50%; background: var(--pink); }
.dash { display: inline-block; width: 2.4mm; height: .3mm; background: #C9CDD3; vertical-align: middle; }
.notes { margin-top: 9mm; display: grid; grid-template-columns: repeat(3, 1fr); gap: 7mm; }
.notes div { border-top: .3mm solid var(--ink); padding-top: 3mm; font-size: 8.6pt; }
.notes .cap { display: block; color: var(--muted); margin-bottom: 1.6mm; }
.illus { margin-top: 10mm; font-size: 7.8pt; color: var(--muted); border-top: .25mm solid var(--hair); padding-top: 3mm; }

/* ---------- part divider ---------- */
.divider { background: var(--char);
  position: relative; color: #fff; overflow: hidden; }
.divider .n { position: absolute; left: 20mm; top: 22mm; font-size: 120pt; font-weight: 300; line-height: .9; color: var(--pink); letter-spacing: -0.06em; }
.divider .txt { position: absolute; left: 20mm; right: 20mm; bottom: 34mm; }
.divider .cap { color: #9EA4AE; }
.divider h2 { color: #fff; font-size: 40pt; margin-top: 5mm; letter-spacing: -0.03em; }
.divider .rule { margin-top: 8mm; }
.divider p { color: #B8BDC5; font-size: 11pt; max-width: 120mm; margin: 7mm 0 0; }
.divider ul { list-style: none; margin: 10mm 0 0; padding: 0; columns: 2; column-gap: 10mm; }
.divider li { break-inside: avoid; display: flex; gap: 3mm; padding: 1.8mm 0; border-top: .25mm solid #3A3E46; font-size: 9pt; color: #D7DADF; }
.divider li span { color: #8B919B; font-variant-numeric: tabular-nums; width: 8mm; }

/* ---------- section: one fixed A4 sheet each, laid out like print ---------- */
.sec { }
.stage { padding: 15mm 17mm 8mm; background: var(--char); position: relative; overflow: hidden; }
.stage .shots { position: relative; display: flex; justify-content: center; align-items: flex-end; }
.stage .main { width: 150mm; }
.stage.two .shots { justify-content: flex-start; padding-bottom: 6mm; }
.stage.two .main { width: 132mm; }
.stage .inset { position: absolute; right: 0; bottom: 0; width: 74mm; }
.stage .phones { display: flex; gap: 7mm; justify-content: center; }
.stage .phones .phone { width: 44mm; }
.stage .phones.four .phone { width: 34mm; }
.stage .legend { margin-top: 5.5mm; color: #8B919B; font-size: 6.9pt; }
.stage .legend b { color: #C9CDD3; font-weight: 500; }
.body { padding: 0 17mm; }
.head { margin-top: 7mm; display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 6mm; }
.head .no { font-size: 8pt; color: var(--pinkdeep); font-weight: 600; letter-spacing: .14em; }
.head h2 { font-size: 23pt; margin-top: 2mm; }
.head .for { text-align: right; color: var(--muted); }
.head .for .cap { display: block; margin-bottom: 1mm; }
.head .for span.r { font-size: 8.4pt; color: var(--ink); }
.body > .rule { margin: 4.5mm 0 5mm; }
.cols { display: grid; grid-template-columns: 1.55fr 1fr; gap: 10mm; }
.cols.wide { grid-template-columns: 1fr; gap: 3mm; }
.cols.wide ol.steps { columns: 2; column-gap: 8mm; }
.cols.wide ol.steps li { break-inside: avoid; }
.cols.wide .side { columns: 2; column-gap: 8mm; }
.cols.wide .side .cap { column-span: all; }
.intro { margin: 0 0 4mm; font-size: 9.8pt; color: var(--body); }
ol.steps { list-style: none; margin: 0; padding: 0; counter-reset: s; }
ol.steps li { counter-increment: s; display: grid; grid-template-columns: 8mm 1fr; gap: 1mm; padding: 2mm 0; border-top: .25mm solid var(--hair); break-inside: avoid; }
ol.steps li::before { content: counter(s, decimal-leading-zero); color: var(--pink); font-weight: 300; font-size: 10.5pt; line-height: 1.35; font-variant-numeric: tabular-nums; }
.side .cap { color: var(--muted); display: block; margin-bottom: 2.4mm; }
.side .note { border-left: .45mm solid var(--pink); padding: .4mm 0 .4mm 3.4mm; margin-bottom: 3.6mm; font-size: 8.7pt; color: var(--body); line-height: 1.55; break-inside: avoid; }

/* ---------- reference ---------- */
.refp { }
.refp .no { font-size: 8pt; color: var(--pinkdeep); font-weight: 600; letter-spacing: .14em; }
.refp h2 { font-size: 26pt; margin-top: 2mm; }
.refp .rule { margin: 6mm 0 7mm; }
.refp .intro { max-width: 150mm; }
.routines { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm 10mm; }
.routines .r { border-top: .3mm solid var(--ink); padding-top: 3mm; break-inside: avoid; }
.routines h3 { font-size: 11pt; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 2mm; }
.routines ul { list-style: none; margin: 0; padding: 0; }
.routines li { display: grid; grid-template-columns: 6mm 1fr; padding: 1.3mm 0; font-size: 8.8pt; border-bottom: .25mm solid var(--hair); }
.routines li::before { content: ""; width: 2.8mm; height: 2.8mm; border: .3mm solid var(--pink); border-radius: .5mm; margin-top: .9mm; }
.qa { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm 10mm; }
.qa div { border-top: .3mm solid var(--ink); padding-top: 2.6mm; font-size: 8.8pt; break-inside: avoid; }
.qa .q { display: block; color: var(--ink); font-weight: 600; margin-bottom: 1.2mm; font-size: 9.2pt; }
dl.gl { display: grid; grid-template-columns: 44mm 1fr; margin: 0; }
dl.gl dt, dl.gl dd { margin: 0; padding: 2.1mm 0; border-top: .25mm solid var(--hair); font-size: 8.9pt; }
dl.gl dt { color: var(--ink); font-weight: 600; }
"""

def esc(s): return html.escape(s, quote=True)
def pg(k): return str(pages.get(k, "")) if pages else ""

def browser(name):
    f, _ = img(name)
    return f'<div class="browser"><div class="bar"><i></i><i></i><i></i><span>app.potatofarm.io</span></div><img src="{f}" alt=""></div>'
def phone(name):
    f, _ = img(name)
    return f'<div class="phone"><img src="{f}" alt=""></div>'

o = [f"<!doctype html><html lang='en-GB'><head><meta charset='utf-8'><title>PotatoFarm.io Training Manual</title><style>{css}</style></head><body>"]

# numbering
num = {}
for pi, (pid, _, _) in enumerate(PARTS, 1):
    k = 0
    for s in S:
        if s["part"] == pid:
            k += 1; num[s["id"]] = f"{pi}.{k}"
REF = [("routines", "Routines by role"), ("trouble", "When something looks wrong"), ("glossary", "Words we use")]
for k, (rid, _) in enumerate(REF, 1):
    num[rid] = f"{len(PARTS)}.{k}"

# cover
o.append(f"""<section class="cover">
<div class="brand">{MARK}<span class="word">PotatoFarm<em>.io</em></span></div>
<div class="ed cap">Edition 1 · 2026</div>
<div class="t"><div class="cap">The training manual</div>
<h1>Every enquiry answered.<br><span>Every deal on track.</span></h1>
<div class="rule"></div>
<p>The complete guide for agents, managers, owners and compliance officers — at the desk and in the car.</p></div>
<div class="dev">{browser("today")}{phone("m-inbox")}</div>
<div class="foot cap"><span>For the brokerage team</span><span>potatofarm.io</span></div>
</section>""")

# contents
o.append('<section class="front"><div class="marker">§contents§</div><div class="cap">Contents</div><h1>What’s inside</h1><div class="rule"></div><div class="toc">')
o.append(f'<div class="part"><div class="ph"><b></b><span>Who does what</span><em>{pg("roles")}</em></div></div>')
for pi, (pid, t, _) in enumerate(PARTS, 1):
    items = [(s["id"], s["title"]) for s in S if s["part"] == pid] + (REF if pid == "ref" else [])
    rows = "".join(f'<div class="row"><i>{num[i]}</i><span>{esc(tt)}</span><em>{pg(i)}</em></div>' for i, tt in items)
    o.append(f'<div class="part"><div class="ph"><b>{pi:02d}</b><span>{esc(t)}</span><em>{pg("part-"+pid)}</em></div>{rows}</div>')
o.append("</div></section>")

# roles
R = [("See every lead in the brokerage", "-", "y", "y", "y", "y"),
     ("See their own leads and message them", "y", "y", "y", "y", "-"),
     ("Add and edit leads, book viewings", "y", "y", "y", "y", "-"),
     ("Give leads to agents, import and export", "-", "y", "y", "y", "-"),
     ("Add and change listings", "-", "y", "y", "y", "-"),
     ("See the brokerage’s revenue", "-", "y", "y", "y", "-"),
     ("Invite people", "-", "y", "y", "y", "-"),
     ("Remove people, change channels, settle commission", "-", "-", "y", "y", "-"),
     ("Billing", "-", "-", "-", "y", "-"),
     ("Open Compliance and decide on reports", "-", "-", "-", "-", "y")]
o.append('<section class="front"><div class="marker">§roles§</div><div class="cap">Before you start</div><h1>Who does what</h1><div class="rule"></div>'
         '<p class="lead">Everybody signs in to the same system and sees what their role needs. Each section of this manual says who it is for.</p>'
         '<table style="margin-top:8mm"><thead><tr><th style="width:46%">&nbsp;</th><th>Agent</th><th>Manager</th><th>Admin</th><th>Owner</th><th>Compliance<br>officer</th></tr></thead><tbody>')
for r in R:
    o.append("<tr><td>" + esc(r[0]) + "</td>" + "".join(f'<td>{"<span class=dot></span>" if c=="y" else "<span class=dash></span>"}</td>' for c in r[1:]) + "</tr>")
o.append('</tbody></table><div class="notes">'
         '<div><span class="cap">Viewer</span>Reads leads, conversations and listings and changes nothing: for a partner or an auditor.</div>'
         '<div><span class="cap">Compliance</span>Owners and admins cannot open it. By law the compliance officer’s reports are kept from everybody else.</div>'
         '<div><span class="cap">Visibility</span>Agents see their own leads; managers and owners see everybody’s. Changes to a lead stay with its own agent.</div>'
         '</div><p class="illus">The screens in this manual show Marina Bay Properties, a sample brokerage. Its people, properties and figures are illustrative.</p></section>')

def section(s):
    t = TREAT.get(s["id"], {})
    for n, _ in s["imgs"]:
        if "crop" in t: CROP[n] = t["crop"]
    desks = [(n, c) for n, c in s["imgs"] if not img(n)[1]]
    phones = [(n, c) for n, c in s["imgs"] if img(n)[1]]
    if phones:
        cls = "phones four" if len(phones) > 3 else "phones"
        stage = f'<div class="stage"><div class="{cls}">' + "".join(phone(n) for n, _ in phones) + "</div>"
        legend = " · ".join(esc(c) for _, c in phones[:3])
    elif len(desks) == 1:
        stage = f'<div class="stage"><div class="shots"><div class="main" style="width:{t.get("w", 150)}mm">{browser(desks[0][0])}</div></div>'
        legend = esc(desks[0][1])
    else:
        stage = (f'<div class="stage two"><div class="shots"><div class="main" style="width:{t.get("w", 132)}mm">{browser(desks[0][0])}</div>'
                 f'<div class="inset">{browser(desks[1][0])}</div></div>')
        legend = f"{esc(desks[0][1])} <b>Inset:</b> {esc(desks[1][1])}"
    stage += f'<div class="legend"><span>{legend}</span></div></div>'
    part = dict((p, t) for p, t, _ in PARTS)[s["part"]]
    who = " · ".join(ROLES[r] for r in s["roles"])
    steps = "".join(f"<li><span>{x}</span></li>" for x in s["steps"])
    side = "".join(f'<div class="note">{x}</div>' for x in s["tips"])
    return (f'<section class="sec"><div class="marker">§{s["id"]}§</div>{stage}'
            f'<div class="body"><div class="head"><div><div class="no">{num[s["id"]]} &nbsp;·&nbsp; {esc(part.upper())}</div><h2>{esc(s["title"])}</h2></div>'
            f'<div class="for"><span class="cap">For</span><span class="r">{esc(who)}</span></div></div><div class="rule"></div>'
            f'<div class="cols{" wide" if t.get("wide") else ""}"><div><p class="intro">{s["intro"]}</p>' + (f'<ol class="steps">{steps}</ol>' if steps else "") + "</div>"
            f'<div class="side">' + (f'<span class="cap">Good to know</span>{side}' if side else "") + "</div></div></div></section>")

for pi, (pid, t, d) in enumerate(PARTS, 1):
    items = [(num[s["id"]], s["title"]) for s in S if s["part"] == pid] + ([(num[r], tt) for r, tt in REF] if pid == "ref" else [])
    lis = "".join(f"<li><span>{n}</span>{esc(tt)}</li>" for n, tt in items)
    o.append(f'<section class="divider"><div class="marker">§part-{pid}§</div><div class="n">{pi:02d}</div>'
             f'<div class="txt"><div class="cap">Part {pi}</div><h2>{esc(t)}</h2><div class="rule"></div><p>{esc(d)}</p><ul>{lis}</ul></div></section>')
    for s in S:
        if s["part"] == pid:
            o.append(section(s))
    if pid == "ref":
        o.append(f'<section class="refp"><div class="marker">§routines§</div><div class="no">{num["routines"]} &nbsp;·&nbsp; ROUTINES AND REFERENCE</div><h2>Routines by role</h2><div class="rule"></div>'
                 '<p class="intro">Tick through these until they are habit. They are the difference between a CRM that is filled in and one that is used.</p><div class="routines" style="margin-top:6mm">')
        for tt, items in ROUTINES:
            o.append(f'<div class="r"><h3>{esc(tt)}</h3><ul>' + "".join(f"<li><span>{esc(x)}</span></li>" for x in items) + "</ul></div>")
        o.append("</div></section>")
        o.append(f'<section class="refp"><div class="marker">§trouble§</div><div class="no">{num["trouble"]} &nbsp;·&nbsp; ROUTINES AND REFERENCE</div><h2>When something looks wrong</h2><div class="rule"></div><div class="qa">')
        for q, a in TROUBLE:
            o.append(f'<div><span class="q">{esc(q)}</span>{a}</div>')
        o.append('</div><p class="illus" style="margin-top:9mm">Still stuck? Email <b>hello@potatofarm.io</b> from the address you sign in with, and a person will reply.</p></section>')
        o.append(f'<section class="refp"><div class="marker">§glossary§</div><div class="no">{num["glossary"]} &nbsp;·&nbsp; ROUTINES AND REFERENCE</div><h2>Words we use</h2><div class="rule"></div><dl class="gl">')
        for tt, dd in GLOSSARY:
            o.append(f"<dt>{esc(tt)}</dt><dd>{esc(dd)}</dd>")
        o.append("</dl></section>")

o.append(f"""<section class="back"><div class="marker">§back§</div><div class="mid">{MARK}<span class="word">PotatoFarm<em>.io</em></span>
<div class="rule"></div><p>Every property enquiry answered in seconds, qualified in the buyer’s own language, and carried through to transfer.</p></div>
<div class="foot cap">hello@potatofarm.io &nbsp;·&nbsp; potatofarm.io &nbsp;·&nbsp; Dubai</div></section>""")
o.append("</body></html>")
open(f"{HERE}/manual.html", "w").write("".join(o))
print("sections", len(S))
