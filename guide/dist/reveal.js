// Entrance animations in the style of bestofthebestmarathon.co.za (Elementor + Animate.css),
// limited to four areas: Event Schedule, Food & Beverage, Important Reminders and the closing band.
(() => {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.documentElement.classList.add('anim-on');

  const plan = [];               // [element, animation, delayMs]
  const add = (sel, anim, step = 0, base = 0) =>
    document.querySelectorAll(sel).forEach((el, i) => plan.push([el, anim, base + i * step]));
  const pair = sel => document.querySelectorAll(sel).forEach(g =>
    [...g.children].forEach((el, i) => plan.push([el, i % 2 ? 'fadeInRight' : 'fadeInLeft', 0])));

  // 01 Event Schedule
  add('#programme .ch-title', 'fadeInLeft');
  add('#programme > p:not(.small)', 'fadeInUpSmall');
  pair('#programme .grid2');
  add('#programme .stations > div', 'fadeInUp', 120);
  // 04 Food & Beverage
  add('#food .ch-title', 'fadeInLeft');
  add('#food > p:not(.small)', 'fadeInUpSmall');
  add('#food .stations > div', 'fadeInUp', 120);
  // 10 Important Reminders
  add('#reminders .ch-title', 'fadeInLeft');
  add('#reminders .reminders', 'fadeInUp');
  // Closing: We look forward to welcoming you
  add('.closing .eyebrow, .closing h2, .closing .meta, .closing .sign', 'fadeInLeft', 160);
  add('.closing .contact-label, .closing .contact', 'fadeInUp', 160, 500);

  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    const { anim, delay } = e.target._anim;
    e.target.style.animationDelay = delay + 'ms';
    e.target.classList.remove('anim-wait');
    e.target.classList.add('animated', anim);
    io.unobserve(e.target);
  }), { rootMargin: '0px 0px -8% 0px' });

  plan.forEach(([el, anim, delay]) => {
    el.classList.add('anim-wait');
    el._anim = { anim, delay };
    io.observe(el);
  });
})();
