// Potato.ai — motion layer.
// One rule throughout: if the user has asked for reduced motion, this file
// does nothing at all. It doesn't run slower, it doesn't run once — it stops.
(function () {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) return;

  // --- Headline word reveal -------------------------------------------
  // Wraps each word in a span so it can be staggered. Text content is
  // unchanged, so a screen reader reads the sentence exactly as written.
  document.querySelectorAll('[data-reveal-words]').forEach((el) => {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach((w, i) => {
      const s = document.createElement('span');
      s.className = 'reveal-word';
      s.style.setProperty('--w', i);
      s.textContent = w;
      el.append(s, document.createTextNode(' '));
    });
  });

  // --- Staggered grids -------------------------------------------------
  document.querySelectorAll('.grid, .steps, .stats').forEach((g) => {
    g.classList.add('stagger');
    [...g.children].forEach((c, i) => c.style.setProperty('--s', Math.min(i, 5)));
  });
})();
