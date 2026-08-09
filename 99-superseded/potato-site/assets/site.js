// Shared behaviour. One file, every page.
const hdr=document.getElementById('hdr'), prog=document.getElementById('prog');
addEventListener('scroll',()=>{
  hdr && hdr.classList.toggle('stuck', scrollY>12);
  if(prog){const h=document.documentElement;
    prog.style.width=(h.scrollTop/(h.scrollHeight-h.clientHeight)*100)+'%';}
},{passive:true});

// Mobile menu.
// aria-modal="true" is a promise to assistive technology that focus cannot
// leave the dialog. Setting the attribute without trapping focus is worse
// than not setting it, because a screen reader user is told they are in a
// modal and then silently tabbed out into the page behind it.
const menu = document.getElementById('menu'),
      ob   = document.getElementById('open'),
      cb   = document.getElementById('close');
let lastFocus = null;

if (ob && menu) {
  const FOCUSABLE =
    'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function trap(e) {
    if (e.key !== 'Tab') return;
    const items = [...menu.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open() {
    lastFocus = document.activeElement;
    menu.classList.add('open');
    ob.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    // Hide the rest of the page from assistive tech as well as from view.
    document.querySelectorAll('header, main, footer').forEach((el) => (el.inert = true));
    cb.focus();
    document.addEventListener('keydown', trap);
  }

  function shut() {
    menu.classList.remove('open');
    ob.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    document.querySelectorAll('header, main, footer').forEach((el) => (el.inert = false));
    document.removeEventListener('keydown', trap);
    lastFocus && lastFocus.focus();
  }

  ob.onclick = open;
  cb.onclick = shut;
  menu.querySelectorAll('a').forEach((a) => (a.onclick = shut));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('open')) shut();
  });
}

// Accordion
document.querySelectorAll('.acc-b').forEach(b=>{
  b.onclick=()=>{const open=b.getAttribute('aria-expanded')==='true',p=b.nextElementSibling;
    b.setAttribute('aria-expanded',String(!open));
    p.style.maxHeight=open?'0':p.scrollHeight+'px';};
});

// Reveals — fire once, then stop observing.
const io=new IntersectionObserver(es=>es.forEach(e=>{
  if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}
}),{threshold:.15});
document.querySelectorAll('.rv').forEach(el=>io.observe(el));

// Integration filter
const chips=[...document.querySelectorAll('.chip')];
if(chips.length){
  chips.forEach(c=>c.onclick=()=>{
    chips.forEach(x=>x.setAttribute('aria-pressed',String(x===c)));
    const f=c.dataset.filter;
    document.querySelectorAll('[data-cat]').forEach(el=>{
      el.hidden = f!=='all' && el.dataset.cat!==f;
    });
  });
}

// Demo form. Validates on submit, not on every keystroke — nagging
// someone mid-typing is the fastest way to lose them.
const form=document.getElementById('demoForm');
if(form){
  form.addEventListener('submit',e=>{
    e.preventDefault();
    let bad=null;
    form.querySelectorAll('[required]').forEach(f=>{
      const ok=f.type==='checkbox'?f.checked:f.value.trim().length>1;
      f.setAttribute('aria-invalid',String(!ok));
      const h=f.parentElement.querySelector('.hint');
      if(h)h.classList.toggle('err',!ok);
      if(!ok&&!bad)bad=f;
    });
    if(bad){bad.focus();return;}
    const btn=form.querySelector('button[type=submit]');
    btn.style.width=btn.offsetWidth+'px';btn.disabled=true;btn.textContent='Sending…';
    setTimeout(()=>{
      form.innerHTML='<h3>Thanks — that\u2019s with us.</h3>'+
        '<p style="margin-top:10px">We\u2019ll come back to you on WhatsApp within the hour during '+
        'working hours, and first thing otherwise.</p>';
      form.setAttribute('role','status');
    },900);
  });
}

// ---- Consent -------------------------------------------------------------
// The rule that makes this real rather than decorative: nothing loads until
// a choice is made. A banner shown after the tags have already fired is
// worse than none, because it documents that you knew.
(function () {
  const KEY = "potato.consent";
  if (localStorage.getItem(KEY)) return loadAnalytics();

  const bar = document.createElement("div");
  bar.className = "consent-bar";
  bar.setAttribute("role", "dialog");
  bar.setAttribute("aria-label", "Cookie choices");
  bar.innerHTML =
    '<p>We use analytics to see which pages are useful. Nothing loads until you ' +
    'say yes, and we don\u2019t use it to identify you. ' +
    '<a href="legal.html" class="u-link">What we collect</a></p>' +
    '<div class="consent-actions">' +
    '<button class="btn btn-ghost" data-c="denied">No thanks</button>' +
    '<button class="btn btn-primary" data-c="granted">That\u2019s fine</button></div>';

  document.body.appendChild(bar);
  bar.setAttribute("tabindex", "-1");
  bar.focus();

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-c]");
    if (!btn) return;
    localStorage.setItem(KEY, btn.dataset.c);
    bar.remove();
    if (btn.dataset.c === "granted") loadAnalytics();
  });

  function loadAnalytics() {
    if (localStorage.getItem(KEY) !== "granted") return;
    // Analytics tag mounts here, and only here.
  }
})();
