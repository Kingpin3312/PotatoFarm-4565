"""Dark-first mockups.

The measurements forced this. Every bold amber fails AA on a near-white
page and passes comfortably on a dark one — because warmth is luminance,
and darkening a warm colour until it passes is what removes the boldness.

So the page flips. Ground is near-black, the accent gets to be the
colour it actually is, and the light sections become the punctuation
rather than the base.

This is also the more confident position. A dark site is a decision;
a white site with a careful accent is an absence of one.
"""
MOTION = open("motion-v2.js").read()

def page(t):
    return f'''<!DOCTYPE html>
<html lang="en-GB"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Potato — answer every enquiry in seconds</title>
<link rel="canonical" href="https://potato.ai/">
<meta name="description" content="A WhatsApp assistant that answers property enquiries in seconds, qualifies the buyer and books the viewing. Built for UAE brokerages.">
<meta name="theme-color" content="{t['ground']}">
<link rel="preconnect" href="https://rsms.me">
<link rel="stylesheet" href="https://rsms.me/inter/inter.css">
<style>
:root{{
  --ground:{t['ground']}; --sunk:{t['sunk']}; --ink:{t['ink']};
  --secondary:{t['sec']}; --tertiary:{t['ter']}; --hairline:{t['hair']};
  --accent:{t['accent']}; --accent-dk:{t['accentDk']}; --on-accent:{t['onAccent']};
  --sans:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --display:clamp(2.75rem,1.9rem + 4.4vw,5rem);
  --h2:clamp(1.75rem,1.3rem + 2vw,2.5rem);
  --section:clamp(88px,12vw,168px);
  --measure:34rem; --ease:cubic-bezier(.16,1,.3,1);
}}
/* Sections that flip out of the base. On a dark-first page these are the
   light ones — they punctuate rather than being the ground. */
.invert{{--ground:{t['invGround']};--sunk:{t['invSunk']};--ink:{t['invInk']};
  --secondary:{t['invSec']};--tertiary:{t['invTer']};--hairline:{t['invHair']};
  --accent:{t['invAccent']};--on-accent:{t['invOnAccent']};--accent-dk:{t['invAccentDk']}}}

*{{box-sizing:border-box;margin:0;padding:0}}
html{{scroll-behavior:smooth;-webkit-text-size-adjust:100%}}
body{{background:var(--ground);color:var(--secondary);font-family:var(--sans);
  font-size:1.0625rem;line-height:1.6;-webkit-font-smoothing:antialiased;
  font-feature-settings:"cv11","ss01"}}
section{{background:var(--ground);color:var(--secondary);padding:var(--section) 0}}
.wrap{{max-width:1040px;margin:0 auto;padding:0 clamp(20px,5vw,40px)}}
h1,h2,h3{{color:var(--ink);font-weight:600}}
.display{{font-size:var(--display);line-height:1.04;letter-spacing:-.032em;
  color:var(--ink);font-weight:600;max-width:15ch}}
h2{{font-size:var(--h2);line-height:1.1;letter-spacing:-.024em}}
h3{{font-size:1.3125rem;line-height:1.25;letter-spacing:-.01em;font-weight:500}}
.lead{{font-size:1.3125rem;line-height:1.5;max-width:var(--measure);margin-top:24px}}
.eyebrow{{font-size:.8125rem;color:var(--accent);display:block;margin-bottom:12px;font-weight:500}}
.cap{{font-size:.8125rem;color:var(--tertiary)}}

nav{{position:sticky;top:0;z-index:100;height:48px;display:flex;align-items:center;
  background:color-mix(in srgb,var(--ground) 76%,transparent);
  border-bottom:1px solid transparent;transition:border-color .24s}}
@supports not (backdrop-filter:blur(1px)){{nav{{background:var(--ground)}}}}
@supports (backdrop-filter:blur(1px)){{nav{{backdrop-filter:saturate(180%) blur(20px);
  -webkit-backdrop-filter:saturate(180%) blur(20px)}}}}
nav.is-stuck{{border-bottom-color:var(--hairline)}}
nav .wrap{{display:flex;align-items:center;gap:30px;width:100%}}
.brand{{color:var(--ink);font-weight:600;font-size:1.0625rem;letter-spacing:-.01em;
  text-decoration:none;display:flex;align-items:center;gap:8px}}
.brand i{{width:19px;height:19px;border-radius:5px;background:var(--accent);display:grid;
  place-items:center;color:var(--on-accent);font-size:10px;font-style:normal;font-weight:700}}
nav a.link{{color:var(--secondary);text-decoration:none;font-size:.875rem}}
nav a.link:hover{{color:var(--ink)}}
nav .right{{margin-left:auto;display:flex;gap:22px;align-items:center}}
@media(max-width:760px){{nav a.link:not(.keep){{display:none}}}}

.btn{{display:inline-flex;align-items:center;justify-content:center;min-height:44px;
  padding:0 22px;border-radius:980px;font-size:.9375rem;font-weight:600;text-decoration:none;
  border:1px solid transparent;transition:background .24s var(--ease),border-color .24s}}
.btn-primary{{background:var(--accent);color:var(--on-accent)}}
.btn-primary:hover{{background:var(--accent-dk)}}
.btn-quiet{{color:var(--ink);border-color:var(--hairline)}}
.btn-quiet:hover{{border-color:var(--secondary)}}
.btn:focus-visible{{outline:2px solid var(--accent);outline-offset:3px}}
.btn-sm{{min-height:32px;padding:0 15px;font-size:.8125rem}}

.hero{{padding-top:clamp(64px,9vw,128px)}}
.actions{{display:flex;gap:12px;margin-top:36px;flex-wrap:wrap}}

.thread{{margin-top:clamp(52px,8vw,88px);background:var(--sunk);border-radius:20px;
  padding:clamp(20px,4vw,34px);max-width:580px}}
.m{{display:flex;align-items:flex-end;margin-bottom:12px}}
.m.out{{justify-content:flex-end}}
.m .b{{max-width:80%;padding:11px 15px;border-radius:18px;font-size:1rem;line-height:1.45;
  background:{t['bubbleIn']};color:{t['bubbleInText']}}}
.m.out .b{{background:var(--accent);color:var(--on-accent)}}
.m .t{{font-size:.6875rem;color:var(--tertiary);margin:0 8px 3px}}
.thread .foot{{margin-top:18px;padding-top:16px;border-top:1px solid var(--hairline);
  font-size:.8125rem;color:var(--tertiary)}}

.mid{{text-align:center}}
.mid h2{{max-width:20ch;margin:0 auto}}
.mid p{{max-width:var(--measure);margin:24px auto 0}}
.figure{{font-size:clamp(3.25rem,2.6rem + 4vw,5.5rem);line-height:1;letter-spacing:-.04em;
  color:var(--accent);font-weight:600}}

.steps{{display:grid;gap:44px;margin-top:clamp(52px,8vw,80px)}}
@media(min-width:760px){{.steps{{grid-template-columns:repeat(3,1fr);gap:36px}}}}
.step{{border-top:1px solid var(--hairline);padding-top:22px}}
.step .n{{font-size:.8125rem;color:var(--accent);font-variant-numeric:tabular-nums;font-weight:600}}
.step h3{{margin:10px 0 8px}}
.step p{{font-size:1rem}}

.split{{display:grid;gap:44px;align-items:center}}
@media(min-width:880px){{.split{{grid-template-columns:1fr 1fr;gap:76px}}}}
.panel{{background:var(--sunk);border-radius:20px;padding:clamp(24px,4vw,36px)}}
.row{{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:14px 0;
  border-bottom:1px solid var(--hairline)}}
.row:last-of-type{{border-bottom:0}}
.row .k{{font-size:.9375rem}}
.row .v{{color:var(--ink);font-weight:500;font-variant-numeric:tabular-nums}}
.row .v.up{{color:var(--accent);font-weight:600}}

footer{{padding:var(--section) 0 56px;border-top:1px solid var(--hairline)}}
.fgrid{{display:grid;gap:32px}}
@media(min-width:700px){{.fgrid{{grid-template-columns:2fr 1fr 1fr}}}}
footer a{{color:var(--secondary);text-decoration:none;font-size:.9375rem;display:block;padding:5px 0}}
footer a:hover{{color:var(--ink)}}
.fh{{font-size:.8125rem;color:var(--tertiary);font-weight:500;margin-bottom:8px}}

.reveal-ready [data-reveal]{{opacity:0;transform:translateY(24px)}}
.reveal-ready [data-reveal].is-in{{opacity:1;transform:none;
  transition:opacity .6s var(--ease),transform .6s var(--ease)}}
.thread .pending{{opacity:0;transform:translateY(10px)}}
.thread .pending.is-in{{opacity:1;transform:none;
  transition:opacity .42s var(--ease),transform .42s var(--ease)}}
[id]{{scroll-margin-top:72px}}
.skip{{position:absolute;left:-9999px}}
.skip:focus{{left:16px;top:12px;z-index:200;background:var(--accent);color:var(--on-accent);
  padding:10px 16px;border-radius:8px}}
.tag{{position:fixed;right:14px;bottom:14px;z-index:200;background:var(--accent);
  color:var(--on-accent);font-size:.6875rem;padding:7px 13px;border-radius:980px;
  letter-spacing:.04em;font-weight:600}}
@media(prefers-reduced-motion:reduce){{*{{animation:none!important;transition:none!important;
  scroll-behavior:auto!important}}}}
</style></head><body>
<a href="#main" class="skip">Skip to content</a>
<span class="tag">{t['letter']} &middot; {t['name']}</span>

<nav data-nav><div class="wrap">
  <a href="#" class="brand"><i>P</i>Potato</a>
  <a href="#how" class="link">How it works</a>
  <a href="#proof" class="link">Results</a>
  <a href="#pricing" class="link">Pricing</a>
  <div class="right">
    <a href="https://app.potato.ai" class="link keep">Log in</a>
    <a href="#demo" class="btn btn-primary btn-sm">Book a call</a>
  </div>
</div></nav>

<main id="main">
<section class="hero"><div class="wrap">
  <h1 class="display">Every enquiry answered in seconds.</h1>
  <p class="lead">Potato replies on WhatsApp the moment a lead arrives, asks the questions
     your best agent would ask, and books the viewing. Day, night, Friday, Eid.</p>
  <div class="actions">
    <a href="#demo" class="btn btn-primary">Book a call</a>
    <a href="#how" class="btn btn-quiet">See how it works</a>
  </div>
  <div class="thread" data-thread>
    <div class="m" data-msg><div class="b">Hi, is the 3 bed in Marina Gate still available?</div><span class="t">23:14</span></div>
    <div class="m out" data-msg><span class="t">23:14</span><div class="b">It is. Are you looking to buy or rent?</div></div>
    <div class="m" data-msg><div class="b">Buy. Around 2.5 if it's the right one</div><span class="t">23:16</span></div>
    <div class="m out" data-msg><span class="t">23:16</span><div class="b">That works. Free Saturday morning to see it?</div></div>
    <div class="m" data-msg><div class="b">Saturday 10 is good</div><span class="t">23:17</span></div>
    <div class="foot">Booked in three minutes. Omar read it over breakfast.</div>
  </div>
</div></section>

<section class="invert"><div class="wrap mid">
  <p class="figure" data-reveal>63%</p>
  <h2 data-reveal="80" style="margin-top:18px">of enquiries arrive after your team has gone home</h2>
  <p data-reveal="160">By the morning, most buyers have messaged three other agents.
     The one who replied first is showing them a property.</p>
</div></section>

<section id="how"><div class="wrap">
  <div style="max-width:var(--measure)">
    <span class="eyebrow" data-reveal>How it works</span>
    <h2 data-reveal="60">Three things, then it hands over.</h2>
  </div>
  <div class="steps">
    <div class="step" data-reveal><span class="n">01</span><h3>It replies</h3>
      <p>Within seconds of the enquiry landing, in the buyer's language, from your number.</p></div>
    <div class="step" data-reveal="90"><span class="n">02</span><h3>It qualifies</h3>
      <p>Budget, timeframe, whether they're financing. The questions you'd ask on a first call.</p></div>
    <div class="step" data-reveal="180"><span class="n">03</span><h3>It steps back</h3>
      <p>The moment it matters, your agent takes over — with the whole conversation already there.</p></div>
  </div>
</div></section>

<section id="proof"><div class="wrap split">
  <div>
    <span class="eyebrow" data-reveal>What changes</span>
    <h2 data-reveal="60">You'll see it in the first week.</h2>
    <p class="lead" data-reveal="120">We measure your response times before switching anything
       on, so the difference is yours to check rather than ours to claim.</p>
  </div>
  <div class="panel" data-reveal="180">
    <div class="row"><span class="k">Median first reply, before</span><span class="v">4h 12m</span></div>
    <div class="row"><span class="k">Median first reply, after</span><span class="v up">38s</span></div>
    <div class="row"><span class="k">Out-of-hours answered</span><span class="v up">100%</span></div>
    <div class="row"><span class="k">Viewings booked per 100</span><span class="v up">+31%</span></div>
    <p class="cap" style="margin-top:16px">Pilot brokerage, four weeks. Your numbers will differ.</p>
  </div>
</div></section>

<section class="invert"><div class="wrap mid">
  <h2 data-reveal>It never invents a fact about a property.</h2>
  <p data-reveal="80">It answers from your listings and nothing else. If it doesn't know, it
     says so and fetches an agent. There's a stop button on every screen, and pressing it
     stops everything immediately.</p>
</div></section>

<section id="pricing"><div class="wrap mid">
  <span class="eyebrow" data-reveal>Pricing</span>
  <h2 data-reveal="60">Per agent, per month.</h2>
  <p data-reveal="120">No setup fee, no minimum term. Add an agent mid-month and you pay for
     the days they use.</p>
  <p style="margin-top:36px" data-reveal="180"><a href="#demo" class="btn btn-primary">Book a call</a></p>
</div></section>
</main>

<footer><div class="wrap fgrid">
  <div>
    <a href="#" class="brand" style="margin-bottom:12px"><i>P</i>Potato</a>
    <p class="cap" style="max-width:32ch">The WhatsApp assistant for UAE property brokerages.</p>
  </div>
  <div><h3 class="fh">Product</h3><a href="#how">How it works</a><a href="#pricing">Pricing</a><a href="#">Security</a></div>
  <div><h3 class="fh">Company</h3><a href="#">About</a><a href="#">Contact</a><a href="#">Privacy</a></div>
</div>
<div class="wrap" style="margin-top:52px"><p class="cap">&copy; 2026 Potato. Dubai, UAE.</p></div>
</footer>
<script>{MOTION}</script>
</body></html>'''

# Dark ground, bold accent, black label on the accent — because every one
# of these is light enough that white text on it fails.
def dark(letter, name, accent, accentDk, invAccent, invAccentDk):
    return dict(
      letter=letter, name=name,
      ground="#100E0A", sunk="#1B1712", ink="#F7F4EE", sec="#A9A197", ter="#7E766C",
      hair="#2A241C",
      accent=accent, accentDk=accentDk, onAccent="#100E0A",
      bubbleIn="#2A241C", bubbleInText="#F7F4EE",
      # The light punctuation sections need the darkened accent, because
      # the bold one fails on near-white. Same brand, one step down.
      invGround="#FBF8F2", invSunk="#F2EDE3", invInk="#1A1712",
      invSec="#57504A", invTer="#8B837A", invHair="#E7E0D4",
      invAccent=invAccent, invAccentDk=invAccentDk, invOnAccent="#FFFFFF")

D = dark("D", "Signal orange", "#F97316", "#EA580C", "#C2410C", "#9A3412")
E = dark("E", "Saffron",       "#F0B23F", "#E8A33D", "#A16207", "#854D0E")
F = dark("F", "Ember",         "#F4531F", "#DC4E1E", "#B93A12", "#962E0E")

for t in (D, E, F):
    open(f"option-{t['letter']}-{t['name'].split()[0].lower()}.html","w").write(page(t))
print("built D, E, F")
