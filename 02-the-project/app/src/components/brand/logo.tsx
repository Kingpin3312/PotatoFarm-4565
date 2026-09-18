"use client";

/**
 * The lockup, in one place.
 *
 * There were two React copies of the mark — the app shell had one and
 * nothing else had any, so the five screens outside the shell
 * (sign in, check your email, the error page, sign up and accepting an
 * invite) carried no logo whatsoever. Those are the first five screens
 * a brokerage owner ever sees, and they looked like an unbranded form.
 *
 * The potato below is generated: `03-brand/logo/mark.py` owns the
 * geometry and rewrites every inlined copy across the repository from
 * that one definition, this file included. Edit the potato there, run
 * `python3 03-brand/logo/mark.py --apply`, and every surface moves
 * together. `consistency.py` fingerprints the body path, so a surface
 * that gets missed fails the build instead of quietly becoming a
 * second logo.
 */

/** The potato alone. Decorative — the word beside it carries the name. */
export function Mark({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"
         width={size} height={size} className={className}>
      <defs><linearGradient id="shl" x1="18%" y1="6%" x2="88%" y2="96%"><stop offset="0" stopColor="#FFD04A"/><stop offset="0.42" stopColor="#FCA51B"/><stop offset="0.72" stopColor="#F2760A"/><stop offset="1" stopColor="#D24500"/></linearGradient><linearGradient id="rml" x1="18%" y1="6%" x2="88%" y2="96%"><stop offset="0" stopColor="#E8620A"/><stop offset="1" stopColor="#9E2A00"/></linearGradient><filter id="bll" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter><filter id="sdl" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5"/></filter><filter id="spl" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.1"/></filter><filter id="dpl" x="-35%" y="-35%" width="180%" height="180%"><feDropShadow dx="0" dy="2" stdDeviation="2.2" floodColor="#B83400" floodOpacity="0.22"/></filter><clipPath id="cpl"><path d="M27.6,3.0 C34.6,3.0 40.6,6.6 44.0,11.6 C46.6,17.2 48.8,23.6 50.8,29.8 C53.0,35.6 55.4,40.6 54.6,45.8 C53.4,53.0 47.2,58.6 39.8,60.5 C32.8,62.2 25.4,61.6 19.8,58.6 C13.4,55.2 9.4,49.0 8.9,42.0 C8.4,35.0 10.2,28.0 12.4,21.6 C14.6,15.2 17.0,8.0 21.4,5.2 C23.2,4.0 25.0,3.0 27.6,3.0 Z"/></clipPath></defs><path d="M27.6,3.0 C34.6,3.0 40.6,6.6 44.0,11.6 C46.6,17.2 48.8,23.6 50.8,29.8 C53.0,35.6 55.4,40.6 54.6,45.8 C53.4,53.0 47.2,58.6 39.8,60.5 C32.8,62.2 25.4,61.6 19.8,58.6 C13.4,55.2 9.4,49.0 8.9,42.0 C8.4,35.0 10.2,28.0 12.4,21.6 C14.6,15.2 17.0,8.0 21.4,5.2 C23.2,4.0 25.0,3.0 27.6,3.0 Z" fill="url(#shl)" stroke="url(#rml)" strokeWidth="1.15" strokeLinejoin="round" filter="url(#dpl)"/><g clipPath="url(#cpl)"><ellipse cx="46" cy="52" rx="22" ry="18" fill="#B23600" opacity="0.5" filter="url(#sdl)"/><ellipse cx="24" cy="18" rx="16" ry="17" fill="#FFFFFF" opacity="0.28" filter="url(#bll)"/><path d="M14.6,27.0 Q16.7,14.1 27.0,6.2 Q19.4,15.8 14.6,27.0 Z" fill="#FFF0CE" opacity="0.45" filter="url(#spl)"/></g><ellipse cx="26.2" cy="31.4" rx="3.1" ry="4.4" fill="#4A1E0C"/><ellipse cx="40.4" cy="31.4" rx="3.1" ry="4.4" fill="#4A1E0C"/><path d="M21.9,50.4 Q27.0,46.9 29.3,52.6 Q26.3,49.3 21.9,50.4 Z" fill="#D2530C" opacity="0.9"/><path d="M40.2,47.4 Q43.1,39.4 51.6,40.2 Q44.8,42.1 40.2,47.4 Z" fill="#D2530C" opacity="0.72"/><path d="M26.0,11.7 Q28.9,8.1 32.9,10.4 Q29.2,10.0 26.0,11.7 Z" fill="#D2530C" opacity="0.85"/><path d="M16.8,38.6 Q19.6,36.7 22.0,39.1 Q19.5,38.1 16.8,38.6 Z" fill="#D2530C" opacity="0.8"/><ellipse cx="44.7" cy="17.6" rx="0.75" ry="0.95" fill="#D2530C" opacity="0.7"/><ellipse cx="47.6" cy="51.1" rx="0.85" ry="1.05" fill="#D2530C" opacity="0.5"/>
    </svg>
  );
}

/**
 * The mark and the word.
 *
 * `aria-hidden` on the potato and no `alt` anywhere: the wordmark is
 * live text, so a screen reader already announces "PotatoFarm.io" once.
 * Giving the mark a label as well is how a reader hears the company
 * name twice on every screen.
 */
export function Logo({
  size = 26, word = 20, className = "",
}: { size?: number; word?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`}>
      <Mark size={size} className="me-2.5 shrink-0" />
      {/* One line, deliberately. JSX collapses the whitespace around a
          newline or a comment into a real space, and written across
          several lines this rendered "PotatoFarm .io". */}
      <span className="font-sans font-semibold text-brand-navy -tracking-[0.024em]" style={{ fontSize: word }}>PotatoFarm<span className="text-accent-type font-medium">.io</span></span>
    </span>
  );
}
