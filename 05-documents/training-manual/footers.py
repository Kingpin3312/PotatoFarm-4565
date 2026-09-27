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
@font-face{{font-family:Inter;font-weight:600;src:url('file://{F}/inter-latin-600-normal.woff2')}}
@page{{size:A4;margin:0}} body{{margin:0;font-family:Inter,sans-serif}}
.pg{{width:210mm;height:297mm;position:relative;break-after:page}}
.f{{position:absolute;left:17mm;right:17mm;bottom:10mm;display:flex;justify-content:space-between;align-items:baseline;
 font-size:6.4pt;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:#8B919B}}
.f em{{font-style:normal;color:#FF1493}} .n{{color:#16191D;font-variant-numeric:tabular-nums;letter-spacing:.06em;font-size:7.4pt;margin-left:3mm}}"""
body = "".join(f'<div class="pg"><div class="f"><span>PotatoFarm<em>.io</em> &nbsp;·&nbsp; Training manual</span><span>{part_of(i)}<span class="n">{i:02d}</span></span></div></div>' for i in range(1, n + 1))
open(f"{HERE}/footers.html", "w").write(f"<!doctype html><html><head><meta charset='utf-8'><style>{css}</style></head><body>{body}</body></html>")
