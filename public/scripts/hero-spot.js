(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hero = document.querySelector('.hero-full, .hero-voice');
  if (!hero) return;
  const set = (on) => document.body.classList.toggle('hero-active', on);
  const io = new IntersectionObserver(([e]) => set(e.isIntersecting), { rootMargin: '-20% 0px -60% 0px' });
  io.observe(hero);
})();
