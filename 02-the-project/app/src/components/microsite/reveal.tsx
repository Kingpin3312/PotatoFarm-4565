"use client";

import { useEffect } from "react";

/**
 * The microsite's one motion: blocks fade up as they reach the screen.
 *
 * Opt-in by script, so a page whose script never runs shows everything:
 * the hiding rule in `globals.css` only applies once this has added
 * `ms-js` to the page, and it is inside `prefers-reduced-motion:
 * no-preference`, so nobody who asked for less motion gets any.
 */
export function Reveal() {
  useEffect(() => {
    const root = document.querySelector("[data-microsite]");
    if (!root || !("IntersectionObserver" in window)) return;
    root.classList.add("ms-js");
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    root.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
