"""One A4 page per body page, each carrying only its footer."""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content import PARTS
n, pages = int(sys.argv[1]), json.load(open(sys.argv[2]))
HERE = os.path.dirname(os.path.abspath(__file__)); F = f"{HERE}/fonts/package/files"
starts = sorted((pages.get("part-" + pid, 10**6), t) for pid, t, _ in PARTS)
def part_of(i):
    cur = "Before you start"
    for p, t in starts:
        if i >= p: cur = t
    return cur
css = f"""@font-face{{font-family:Inter;font-weight:500;src:url('file://{F}/inter-latin-500-normal.woff2')}}
@font-face{{font-family:Inter;font-weight:700;src:url('file://{F}/inter-latin-700-normal.woff2')}}
@page{{size:A4;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
.pg{{width:210mm;height:297mm;position:relative;break-after:page}}
.f{{position:absolute;left:17mm;right:17mm;bottom:9mm;display:flex;justify-content:space-between;align-items:center;
 font-size:7.4pt;color:#737985;border-top:.25mm solid #E2E4E8;padding-top:2.4mm}}
.f b{{color:#1D2025;font-weight:700}} .f em{{font-style:normal;color:#FF1493;font-weight:700}} .n{{color:#1D2025;font-weight:700;font-variant-numeric:tabular-nums}}"""
body = "".join(f'<div class="pg"><div class="f"><span><b>PotatoFarm<em>.io</em></b> &nbsp;Training manual</span><span>{part_of(i)} &nbsp;·&nbsp; <span class="n">{i}</span></span></div></div>' for i in range(1, n + 1))
open(f"{HERE}/footers.html", "w").write(f"<!doctype html><html><head><meta charset='utf-8'><style>{css}</style></head><body>{body}</body></html>")
