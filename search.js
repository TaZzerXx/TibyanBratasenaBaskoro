/* ==========================================================================
   SEARCH PRODUK — js/search.js
   --------------------------------------------------------------------------
   Menghidupkan ikon pencarian (🔍) di navbar. Tidak mengubah kode asli:
   file ini hanya MENAMBAH panel pencarian, dan membungkus filterProducts()
   agar filter kategori + pencarian bisa dipakai bersamaan.

   CARA KERJA
   1. Klik ikon cari (atau tekan "/" atau Ctrl+K) → panel pencarian terbuka.
   2. Ketik → saran produk muncul langsung (nama, kategori, badge, harga dicari).
   3. Klik saran = lompat ke produk itu.  Enter = tampilkan semua hasil di grid.
   4. Di grid muncul bilah "Hasil untuk ..." dengan tombol Hapus pencarian.

   PRODUK BARU OTOMATIS TERCARI: cukup tambahkan .product-card di HTML
   (dengan <h3>, .product-category, .product-price, .product-badge, img).

   PANDUAN EDIT
   - Teks, jumlah saran, tombol pintas  → objek CONFIG di bawah.
   - Tampilan (warna, ukuran, animasi)  → css/elegant-motion.css bagian [14].
   - Buka panel dari tombol lain        → onclick="SportSearch.open()"
   - Cari otomatis dari kode            → SportSearch.set('nike')
   ========================================================================== */
(function () {
  'use strict';

  /* ======================== PENGATURAN (edit di sini) ======================== */
  var CONFIG = {
    maxSuggestions: 8,      // jumlah saran di panel
    hotkey: '/',            // tekan tombol ini untuk membuka pencarian ('' = nonaktif)
    scrollOffset: 130,      // jarak dari atas layar saat menuju hasil (px), sesuaikan tinggi navbar
    closeDelay: 450,        // harus ≥ durasi animasi tutup di CSS (ms)
    text: {
      placeholder: 'Cari produk, merek, atau kategori…',
      close: 'Tutup pencarian',
      clear: 'Bersihkan kata kunci',
      clearText: 'Bersihkan',
      categories: 'Telusuri kategori',
      found: function (n) { return n + ' produk ditemukan'; },
      none: function (q) { return 'Tidak ada produk untuk “' + q + '”'; },
      seeAll: function (n) { return 'Lihat semua ' + n + ' hasil'; },
      hint: 'Enter: lihat semua hasil  ·  ↑ ↓: pilih  ·  Esc: tutup',
      statusFor: 'Hasil untuk',
      statusCount: function (n) { return n + ' produk'; },
      clearSearch: 'Hapus pencarian',
      emptyTitle: 'Produk tidak ditemukan',
      emptyHint: 'Coba kata kunci lain, atau hapus pencarian untuk melihat semua produk.'
    }
  };
  /* ========================================================================== */

  var grid = document.querySelector('#products .row');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.product-card'));
  if (!grid || !cards.length) return;

  var trigger = document.getElementById('search');
  var T = CONFIG.text;
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var origFilter = window.filterProducts;        // fungsi filter kategori asli
  var state = { query: '' };
  var panel, input, clearBtn, countEl, list, chips, seeAllBtn, hintEl, closeBtn, lastTrigger;
  var status, statusQ, statusN, empty, emptyTitle;
  var active = -1, shown = [], total = 0, closeTimer = 0;

  /* ------------------------------ Util teks ------------------------------ */
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }
  function tokens(q) { var n = norm(q); return n ? n.split(' ') : []; }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function ownText(el) {
    var t = '';
    if (!el) return t;
    Array.prototype.forEach.call(el.childNodes, function (n) { if (n.nodeType === 3) t += n.textContent; });
    return t.trim() || el.textContent.trim();
  }
  function highlight(text, toks) {
    var frag = document.createDocumentFragment();
    if (!toks.length) { frag.appendChild(document.createTextNode(text)); return frag; }
    var re = new RegExp('(' + toks.map(esc).join('|') + ')', 'gi');
    text.split(re).forEach(function (part, i) {
      if (!part) return;
      if (i % 2 === 1) {
        var m = document.createElement('mark'); m.className = 'cx-hit'; m.textContent = part; frag.appendChild(m);
      } else frag.appendChild(document.createTextNode(part));
    });
    return frag;
  }

  /* ------------------------ Indeks produk (dari HTML) ------------------------ */
  var items = cards.map(function (card, i) {
    var h3 = card.querySelector('h3');
    var cat = card.querySelector('.product-category');
    var price = card.querySelector('.product-price');
    var badge = card.querySelector('.product-badge');
    var img = card.querySelector('.product-image img');
    var name = h3 ? h3.textContent.trim() : '';
    var catText = cat ? cat.textContent.trim() : '';
    var priceText = price ? price.textContent : '';
    return {
      i: i, card: card, h3: h3, name: name, nameN: norm(name),
      cat: card.getAttribute('data-category') || '',
      catText: catText,
      priceNow: ownText(price),
      img: img ? img.getAttribute('src') : '',
      hay: norm([name, catText, card.getAttribute('data-category'), badge ? badge.textContent : '',
                 priceText, priceText.replace(/[.,]/g, '')].join(' '))
    };
  });
  if (items[0] && items[0].h3) items.forEach(function (m) { if (m.h3) m.h3.setAttribute('data-cx-orig', m.name); });

  function matches(m, toks) {
    for (var k = 0; k < toks.length; k++) if (m.hay.indexOf(toks[k]) === -1) return false;
    return true;
  }
  function score(m, q, toks) {
    var s = m.nameN.indexOf(q) > -1 ? 3 : 0;
    toks.forEach(function (t) { if (m.nameN.indexOf(t) > -1) s += 1; });
    return s;
  }
  function activeCategory() {
    var b = document.querySelector('.filter-btn.active');
    var m = b && (b.getAttribute('onclick') || '').match(/filterProducts\('([^']+)'/);
    return m ? m[1] : 'all';
  }

  /* ------------------------ Grid produk: terapkan pencarian ------------------------ */
  function snapshot() { return cards.map(function (c) { return c.style.display !== 'none'; }); }

  function setTitle(m, toks, visible) {
    if (!m.h3) return;
    m.h3.textContent = '';
    m.h3.appendChild(highlight(m.name, visible ? toks : []));
  }

  function applyToGrid(before) {
    var toks = tokens(state.query), cat = activeCategory(), n = 0, count = 0;
    cards.forEach(function (card, i) {
      var m = items[i];
      var show = (cat === 'all' || m.cat === cat) && matches(m, toks);
      var was = before ? before[i] : card.style.display !== 'none';
      card.style.display = show ? 'flex' : 'none';
      if (show) {
        count++;
        // putar ulang animasi masuk untuk kartu yang baru muncul (sama seperti filter kategori)
        if (!was && card.classList.contains('visual-visible')) {
          card.classList.remove('visual-visible');
          void card.offsetWidth;
          card.style.setProperty('--visual-delay', Math.min(n++ * 60, 420) + 'ms');
          card.classList.add('visual-visible');
        }
      }
      setTitle(m, toks, show);
    });
    updateStatus(count);
    return count;
  }

  function updateStatus(count) {
    var has = !!state.query;
    status.hidden = !has;
    empty.hidden = !(has && count === 0);
    if (trigger) trigger.classList.toggle('has-query', has);
    if (has) {
      statusQ.textContent = '“' + state.query + '”';
      statusN.textContent = '· ' + T.statusCount(count);
    }
  }

  /* Bungkus filterProducts() asli: kategori + pencarian bekerja bersamaan */
  if (typeof origFilter === 'function') {
    window.filterProducts = function () {
      var before = snapshot();
      var r = origFilter.apply(this, arguments);
      if (state.query) applyToGrid(before);
      return r;
    };
  }

  /* ------------------------------ Aksi pencarian ------------------------------ */
  function scrollToEl(el, block) {
    if (block === 'center') { el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' }); return; }
    var y = el.getBoundingClientRect().top + window.pageYOffset - CONFIG.scrollOffset;
    window.scrollTo({ top: Math.max(0, y), behavior: calm ? 'auto' : 'smooth' });
  }

  function commit(q) {
    state.query = String(q || '').replace(/\s+/g, ' ').trim();
    var before = snapshot();
    var firstBtn = document.querySelector('.filter-btn');
    if (state.query && typeof origFilter === 'function' && firstBtn) origFilter.call(window, 'all', firstBtn); // reset kategori ke "Semua"
    applyToGrid(before);
    closePanel(true);
    requestAnimationFrame(function () { scrollToEl(state.query ? status : document.getElementById('products')); });
  }

  function choose(m) {
    commit(m.name);
    requestAnimationFrame(function () {
      scrollToEl(m.card, 'center');
      m.card.classList.remove('cx-flash'); void m.card.offsetWidth; m.card.classList.add('cx-flash');
      setTimeout(function () { m.card.classList.remove('cx-flash'); }, 2400);
    });
  }

  function clearSearch() {
    var before = snapshot();
    state.query = '';
    applyToGrid(before);
    if (input) input.value = '';
  }

  /* ------------------------------ Panel pencarian ------------------------------ */
  var ICON_SEARCH = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  function build() {
    if (panel) return;
    panel = document.createElement('div');
    panel.className = 'cx-search';
    panel.id = 'cx-search';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Cari produk');
    panel.innerHTML =
      '<div class="cx-search__scrim" data-cx-close></div>' +
      '<div class="cx-search__panel">' +
        '<div class="cx-search__inner">' +
          '<form class="cx-search__form" role="search" autocomplete="off">' +
            '<span class="cx-search__icon">' + ICON_SEARCH + '</span>' +
            '<input class="cx-search__input" type="search" name="q" aria-controls="cx-search-list" enterkeyhint="search" spellcheck="false">' +
            '<button type="button" class="cx-search__clear" hidden></button>' +
            '<button type="button" class="cx-search__btn cx-search__close" data-cx-close>' + ICON_X + '</button>' +
          '</form>' +
          '<p class="cx-search__count" aria-live="polite"></p>' +
          '<div class="cx-search__chips"><p class="cx-search__label"></p><div class="cx-search__chiplist"></div></div>' +
          '<ul class="cx-search__list" id="cx-search-list" role="listbox"></ul>' +
          '<button type="button" class="cx-search__all" hidden></button>' +
          '<p class="cx-search__hint"></p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(panel);

    input = panel.querySelector('.cx-search__input');
    clearBtn = panel.querySelector('.cx-search__clear');
    closeBtn = panel.querySelector('.cx-search__close');
    countEl = panel.querySelector('.cx-search__count');
    list = panel.querySelector('.cx-search__list');
    chips = panel.querySelector('.cx-search__chips');
    seeAllBtn = panel.querySelector('.cx-search__all');
    hintEl = panel.querySelector('.cx-search__hint');

    input.placeholder = T.placeholder;
    input.setAttribute('aria-label', T.placeholder);
    clearBtn.textContent = T.clearText;
    clearBtn.setAttribute('aria-label', T.clear);
    closeBtn.setAttribute('aria-label', T.close);
    chips.querySelector('.cx-search__label').textContent = T.categories;
    hintEl.textContent = T.hint;

    // Chip kategori diambil dari tombol filter yang sudah ada
    var chipList = chips.querySelector('.cx-search__chiplist');
    Array.prototype.forEach.call(document.querySelectorAll('.filter-btn'), function (btn, i) {
      var c = document.createElement('button');
      c.type = 'button'; c.className = 'cx-search__chip'; c.textContent = btn.textContent.trim();
      c.style.setProperty('--i', i);
      c.addEventListener('click', function () {
        closePanel(true);
        if (state.query) clearSearch();
        btn.click();
        requestAnimationFrame(function () { scrollToEl(document.getElementById('products')); });
      });
      chipList.appendChild(c);
    });

    // Events
    input.addEventListener('input', render);
    clearBtn.addEventListener('click', function () { input.value = ''; render(); input.focus(); });
    seeAllBtn.addEventListener('click', function () { commit(input.value); });
    panel.addEventListener('click', function (e) { if (e.target.closest('[data-cx-close]')) closePanel(); });
    panel.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      if (active > -1 && shown[active]) choose(shown[active]); else commit(input.value);
    });
    panel.addEventListener('keydown', onPanelKey);
  }

  function render() {
    var q = input.value, toks = tokens(q), nq = norm(q);
    clearBtn.hidden = !q;
    list.textContent = '';
    active = -1; shown = []; total = 0;
    if (!toks.length) {
      chips.hidden = false; seeAllBtn.hidden = true; countEl.textContent = '';
      return;
    }
    chips.hidden = true;
    var res = items.filter(function (m) { return matches(m, toks); })
      .map(function (m) { return { m: m, s: score(m, nq, toks) }; })
      .sort(function (a, b) { return b.s - a.s || a.m.i - b.m.i; })
      .map(function (r) { return r.m; });
    total = res.length;
    shown = res.slice(0, CONFIG.maxSuggestions);
    countEl.textContent = total ? T.found(total) : T.none(q.trim());

    shown.forEach(function (m, idx) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'cx-result'; b.setAttribute('role', 'option');
      b.style.setProperty('--i', idx);
      if (m.img) {
        var im = document.createElement('img'); im.src = m.img; im.alt = ''; im.loading = 'lazy'; im.className = 'cx-result__img';
        b.appendChild(im);
      }
      var tx = document.createElement('span'); tx.className = 'cx-result__txt';
      var nm = document.createElement('span'); nm.className = 'cx-result__name'; nm.appendChild(highlight(m.name, toks));
      var mt = document.createElement('span'); mt.className = 'cx-result__meta'; mt.textContent = m.catText;
      tx.appendChild(nm); tx.appendChild(mt); b.appendChild(tx);
      var pr = document.createElement('span'); pr.className = 'cx-result__price'; pr.textContent = m.priceNow; b.appendChild(pr);
      b.addEventListener('click', function () { choose(m); });
      b.addEventListener('mousemove', function () { setActive(idx, true); });
      li.appendChild(b); list.appendChild(li);
    });
    seeAllBtn.hidden = !total;
    seeAllBtn.textContent = T.seeAll(total);
  }

  function setActive(idx, fromMouse) {
    var btns = list.querySelectorAll('.cx-result');
    if (active > -1 && btns[active]) { btns[active].classList.remove('is-active'); btns[active].removeAttribute('aria-selected'); }
    active = idx;
    if (idx > -1 && btns[idx]) {
      btns[idx].classList.add('is-active'); btns[idx].setAttribute('aria-selected', 'true');
      if (!fromMouse) btns[idx].scrollIntoView({ block: 'nearest' });
    }
  }

  function onPanelKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closePanel(); return; }
    if (e.key === 'ArrowDown' && shown.length) { e.preventDefault(); setActive((active + 1) % shown.length); return; }
    if (e.key === 'ArrowUp' && shown.length) { e.preventDefault(); setActive(active <= 0 ? shown.length - 1 : active - 1); return; }
    if (e.key === 'Tab') {            // fokus tidak keluar dari panel
      var f = Array.prototype.filter.call(panel.querySelectorAll('input, button'), function (el) { return !el.hidden && el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function openPanel() {
    build();
    clearTimeout(closeTimer);
    lastTrigger = document.activeElement;
    // tutup menu mobile / keranjang bila sedang terbuka
    ['menu-toggle', 'cart-toggle'].forEach(function (id) { var el = document.getElementById(id); if (el && el.checked) el.checked = false; });
    panel.hidden = false;
    document.documentElement.classList.add('cx-lock');
    input.value = state.query;
    render();
    void panel.offsetWidth;
    panel.classList.add('is-open');
    setTimeout(function () { input.focus(); input.select(); }, calm ? 0 : 120);
  }

  function closePanel(skipFocus) {
    if (!panel || panel.hidden) return;
    panel.classList.remove('is-open');
    document.documentElement.classList.remove('cx-lock');
    closeTimer = setTimeout(function () { panel.hidden = true; }, calm ? 0 : CONFIG.closeDelay);
    if (skipFocus !== true && lastTrigger && lastTrigger.focus) lastTrigger.focus();
  }

  /* ----------------------------- Bilah status & kosong ----------------------------- */
  status = document.createElement('div');
  status.className = 'cx-status'; status.hidden = true; status.setAttribute('role', 'status');
  status.innerHTML = '<p class="cx-status__text"><span class="cx-status__for"></span> <strong class="cx-status__q"></strong> <em class="cx-status__n"></em></p><button type="button" class="cx-status__clear"></button>';
  status.querySelector('.cx-status__for').textContent = T.statusFor;
  statusQ = status.querySelector('.cx-status__q');
  statusN = status.querySelector('.cx-status__n');
  status.querySelector('.cx-status__clear').textContent = T.clearSearch;
  status.querySelector('.cx-status__clear').addEventListener('click', clearSearch);
  grid.parentNode.insertBefore(status, grid);

  empty = document.createElement('div');
  empty.className = 'cx-empty'; empty.hidden = true;
  empty.innerHTML = '<p class="cx-empty__title"></p><p class="cx-empty__hint"></p><button type="button" class="cx-empty__btn"></button>';
  empty.querySelector('.cx-empty__title').textContent = T.emptyTitle;
  empty.querySelector('.cx-empty__hint').textContent = T.emptyHint;
  empty.querySelector('.cx-empty__btn').textContent = T.clearSearch;
  empty.querySelector('.cx-empty__btn').addEventListener('click', clearSearch);
  grid.parentNode.insertBefore(empty, grid.nextSibling);

  /* ------------------------------ Pemicu pembuka ------------------------------ */
  if (trigger) {
    trigger.setAttribute('aria-label', 'Cari produk');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.addEventListener('click', function (e) { e.preventDefault(); openPanel(); });
  }
  function typing(el) { return el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable); }
  document.addEventListener('keydown', function (e) {
    var isK = (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K');
    var isKey = CONFIG.hotkey && e.key === CONFIG.hotkey && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target);
    if ((isK || isKey) && !(panel && !panel.hidden)) { e.preventDefault(); openPanel(); }
  });

  /* API publik untuk dipakai dari HTML / console */
  window.SportSearch = {
    open: openPanel,
    close: function () { closePanel(); },
    set: function (q) { commit(q); },
    clear: clearSearch
  };
})();
