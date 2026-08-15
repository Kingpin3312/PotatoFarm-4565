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
      <defs><linearGradient id="shl" x1="22%" y1="10%" x2="74%" y2="90%"><stop offset="0" stopColor="#F8BA5E"/><stop offset="0.5" stopColor="#F0A03A"/><stop offset="1" stopColor="#E5842A"/></linearGradient><filter id="bll"><feGaussianBlur stdDeviation="7"/></filter><filter id="dpl" x="-35%" y="-35%" width="180%" height="180%"><feDropShadow dx="0" dy="2" stdDeviation="2.2" floodColor="#8A4310" floodOpacity="0.18"/></filter><clipPath id="cpl"><path d="M31.8,3.2 C38.4,2.9 43.8,7.4 46.6,14.2 C49.0,20.0 49.8,26.4 50.4,32.6 C51.0,39.2 50.6,46.2 46.8,51.8 C42.9,57.6 35.6,61.2 28.6,60.6 C21.6,60.0 15.6,55.0 13.2,48.4 C10.8,41.8 11.4,34.4 12.6,27.4 C13.9,19.8 16.2,11.6 21.8,6.6 C24.6,4.1 28.0,3.4 31.8,3.2 Z"/></clipPath></defs><path d="M31.8,3.2 C38.4,2.9 43.8,7.4 46.6,14.2 C49.0,20.0 49.8,26.4 50.4,32.6 C51.0,39.2 50.6,46.2 46.8,51.8 C42.9,57.6 35.6,61.2 28.6,60.6 C21.6,60.0 15.6,55.0 13.2,48.4 C10.8,41.8 11.4,34.4 12.6,27.4 C13.9,19.8 16.2,11.6 21.8,6.6 C24.6,4.1 28.0,3.4 31.8,3.2 Z" fill="url(#shl)" stroke="#D9761C" strokeWidth="1.7" strokeLinejoin="round" filter="url(#dpl)"/><g clipPath="url(#cpl)"><ellipse cx="24" cy="17" rx="17" ry="18" fill="#FFFFFF" opacity="0.20" filter="url(#bll)"/></g><rect x="22.8" y="22.2" width="4.5" height="10.0" rx="2.25" fill="#3B2416"/><rect x="35.0" y="21.6" width="4.2" height="9.6" rx="2.1" fill="#3B2416"/><path d="M45.4,33.0 C46.2,41.4 42.6,49.4 35.4,52.8" fill="none" stroke="#DD8A2E" strokeWidth="1.5" strokeLinecap="round" opacity="0.55"/><path d="M22.6,40.8 C24.4,42.6 27.2,43.0 29.4,41.8" fill="none" stroke="#DD8A2E" strokeWidth="1.6" strokeLinecap="round" opacity="0.8"/><path d="M22.6,16.0 C24.2,14.6 26.4,14.5 28.0,15.6" fill="none" stroke="#DD8A2E" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/><ellipse cx="41.8" cy="16.8" rx="1.0" ry="1.3" fill="#DD8A2E" opacity="0.5"/><ellipse cx="43.0" cy="43.2" rx="1.1" ry="1.4" fill="#DD8A2E" opacity="0.45"/>
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
      <Mark size={size} className="mr-2.5 shrink-0" />
      {/* One line, deliberately. JSX collapses the whitespace around a
          newline or a comment into a real space, and written across
          several lines this rendered "PotatoFarm .io". */}
      <span className="font-sans font-semibold text-brand-navy -tracking-[0.024em]" style={{ fontSize: word }}>PotatoFarm<span className="text-accent-type font-medium">.io</span></span>
    </span>
  );
}
