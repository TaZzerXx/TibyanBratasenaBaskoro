/* Match & move — script tambahan, tidak menyentuh logic asli */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ready = el => requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('ready')));

  // 1. Menu: satu garis yang berpindah dari item ke item
  const nav = $('.navbar-nav');
  if (nav) {
    const links = $$('a', nav);
    const ind = document.createElement('span');
    ind.className = 'pm-ind';
    nav.appendChild(ind);
    let current = links[0];
    const moveTo = a => {
      if (!a) return;
      ind.style.width = a.offsetWidth + 'px';
      ind.style.transform = 'translateX(' + a.offsetLeft + 'px)';
    };
    const setActive = a => {
      if (!a) return;
      current = a;
      links.forEach(l => l.classList.toggle('pm-on', l === a));
      moveTo(a);
    };
    setActive(current);
    ready(ind);

    links.forEach(a => {
      a.addEventListener('mouseenter', () => moveTo(a));
      a.addEventListener('click', () => setActive(a));
    });
    nav.addEventListener('mouseleave', () => moveTo(current));
    addEventListener('resize', () => moveTo(current));

    // Scrollspy: indikator mengikuti section yang sedang dibaca
    const map = new Map(links.map(a => [a.getAttribute('href'), a]));
    const io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) setActive(map.get('#' + e.target.id)); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, href) => { const s = $(href); if (s) io.observe(s); });
  }

  // 2. Filter: pil oranye berpindah ke tab aktif
  const bar = $('.product-filter');
  if (bar) {
    const pill = document.createElement('span');
    pill.className = 'pm-pill';
    bar.appendChild(pill);
    const place = () => {
      const a = $('.filter-btn.active', bar);
      if (!a) return;
      pill.style.width = a.offsetWidth + 'px';
      pill.style.height = a.offsetHeight + 'px';
      pill.style.transform = 'translate(' + a.offsetLeft + 'px,' + a.offsetTop + 'px)';
    };
    place();
    ready(pill);
    addEventListener('resize', place);
    document.addEventListener('click', e => {
      if (e.target.closest('.filter-btn, .slide .cta')) requestAnimationFrame(place);
    });
  }

  // 3. Kartu: yang tetap tampil meluncur ke posisi barunya (FLIP)
  const cards = $$('.product-card');
  const rects = new Map();
  const snapshot = () => {
    rects.clear();
    cards.forEach(c => { if (c.offsetParent) rects.set(c, c.getBoundingClientRect()); });
  };
  document.addEventListener('click', e => {
    if (e.target.closest('.filter-btn, .slide .cta')) snapshot();
  }, true); // fase capture: jalan sebelum handler asli mengubah tampilan
  document.addEventListener('click', e => {
    if (calm || !e.target.closest('.filter-btn, .slide .cta')) return;
    requestAnimationFrame(() => {
      cards.forEach(c => {
        const before = rects.get(c);
        if (!before || !c.offsetParent) return;
        const now = c.getBoundingClientRect();
        const dx = before.left - now.left, dy = before.top - now.top;
        if (!dx && !dy) return;
        c.animate(
          [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }],
          { duration: 650, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' }
        );
      });
    });
  });
})();
