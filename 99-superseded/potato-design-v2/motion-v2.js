/**
 * Scroll reveals.
 *
 * Rules, and they are the whole file:
 *
 *   1. Never on the hero. Above the fold must be present on first paint
 *      — an empty screen for 600ms while JavaScript boots is the worst
 *      first impression available, and on a slow connection it is longer.
 *   2. Once. Elements do not re-animate when scrolled back to. Repeated
 *      motion is the difference between a site that feels considered and
 *      one that feels like a demo.
 *   3. Off entirely under prefers-reduced-motion. Not faster — off.
 */
(function () {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const items = document.querySelectorAll("[data-reveal]");

  // No JavaScript, or motion is unwanted: everything is simply visible.
  // The CSS starts hidden only once this script confirms it can run,
  // so a failed script leaves a readable page rather than a blank one.
  if (reduced || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-in"));
    return;
  }

  document.documentElement.classList.add("reveal-ready");

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const delay = Number(entry.target.dataset.reveal) || 0;
        setTimeout(() => entry.target.classList.add("is-in"), delay);
        io.unobserve(entry.target);
      });
    },
    // Fires slightly before the element is fully in view, so the motion
    // has finished by the time it is being read rather than starting then.
    { rootMargin: "0px 0px -12% 0px", threshold: 0.01 }
  );

  items.forEach((el) => io.observe(el));
})();

/**
 * The conversation demo.
 *
 * Plays once when it comes into view, then rests. Not a loop — a loop
 * turns the product into wallpaper, and a visitor who looks away and
 * back should not find it mid-cycle.
 */
(function () {
  const thread = document.querySelector("[data-thread]");
  if (!thread) return;

  const rows = [...thread.querySelectorAll("[data-msg]")];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced || !("IntersectionObserver" in window)) {
    rows.forEach((r) => r.classList.add("is-in"));
    return;
  }

  rows.forEach((r) => r.classList.add("pending"));

  new IntersectionObserver((entries, obs) => {
    if (!entries[0].isIntersecting) return;
    obs.disconnect();
    rows.forEach((row, i) => {
      // Outbound messages land faster than inbound, because that is the
      // claim: the reply is quick. The timing is the argument.
      setTimeout(() => row.classList.add("is-in"), 400 + i * 620);
    });
  }, { threshold: 0.4 }).observe(thread);
})();

/**
 * Sticky nav.
 *
 * The hairline only appears once the page has scrolled. At rest the bar
 * is invisible against the ground, which is what makes the top of the
 * page feel open.
 */
(function () {
  const nav = document.querySelector("[data-nav]");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("is-stuck", window.scrollY > 8);
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });
})();
