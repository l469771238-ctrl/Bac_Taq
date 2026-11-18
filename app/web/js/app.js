/* ============================================================
   Bac-Taq — application logic (offline, no backend)
   ============================================================ */
(function () {
  'use strict';

  /* ---------- constants ---------- */
  var PASS_HASH = 'e6bd9df7266e6fdafbaf311a6e0bbe9a4c07be67460b66c709dfebfae8f60172';
  var STORE_KEY = 'bactaq.activated';
  var PROGRESS_KEY = 'bactaq.progress';
  var THEME = {
    arabic:      { color: '#16a085', soft: '#e6f7f2', ph: 'ع' },
    english:     { color: '#2f6fed', soft: '#e9f0ff', ph: 'EN' },
    history:     { color: '#c9902a', soft: '#fdf5e5', ph: 'ت' },
    programming: { color: '#8b5cf6', soft: '#f1ecff', ph: 'ب' }
  };
  var SUBJECTS = [
    { key: 'arabic',      title: 'اللغة العربية', desc: 'الأداءات والتقييمات — الصف الثالث الثانوي', short: 'عربي' },
    { key: 'english',     title: 'English',      desc: 'إجابات تقييمات الوزارة — الصف الثالث الثانوي', short: 'إنجليزي' },
    { key: 'history',     title: 'التاريخ',       desc: 'الامتحان — الدراسات الاجتماعية', short: 'تاريخ' },
    { key: 'programming', title: 'البرمجة',       desc: 'الأداءات والتقييمات — الصف الثالث الثانوي', short: 'برمجة' }
  ];

  /* ---------- tiny helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function fmtBytes(b) {
    if (!b) return '—';
    return (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' م.ب';
  }
  function store(key, val) {
    try {
      if (val === undefined) { return JSON.parse(localStorage.getItem(key) || 'null'); }
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { /* storage disabled */ }
    return null;
  }
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function sha256(str) {
    if (window.crypto && crypto.subtle) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      });
    }
    // fallback for old webviews
    var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var bytes = new TextEncoder().encode(str);
    var l = bytes.length, w = [], i;
    bytes = Array.prototype.slice.call(bytes);
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (i = 0; i < 4; i++) bytes.push(0);
    var bits = l * 8;
    for (i = 3; i >= 0; i--) bytes.push((bits >>> (8 * i)) & 0xff);
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var off = 0; off < bytes.length; off += 64) {
      w = [];
      for (i = 0; i < 64; i++) {
        if (i < 16) {
          w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) |
                 (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
        } else {
          var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
          var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
          w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7], t1, t2;
      for (i = 0; i < 64; i++) {
        t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return Promise.resolve(H.map(function (x) {
      return ('00000000' + (x >>> 0).toString(16)).slice(-8);
    }).join(''));
  }

  /* ---------- navigation ---------- */
  var current = 'lock';
  function show(id) {
    if (id === current) { return; }
    $$('.screen').forEach(function (s) { s.classList.remove('active'); });
    var target = $('#screen-' + id);
    if (target) target.classList.add('active');
    current = id;
    document.body.classList.toggle('in-reader', id === 'reader');
    if (id === 'library') { renderLibrary(window.__activeSubject); }
    if (id === 'home') { renderHome(); }
    if (id !== 'reader') { closeSheet(); }
  }
  document.addEventListener('click', function (e) {
    var nav = e.target.closest && e.target.closest('[data-nav]');
    if (nav) {
      var to = nav.getAttribute('data-nav');
      if (to === 'library') { show('library'); }
      else { show(to); }
    }
  });

  /* ============================================================
     ACTIVATION
     ============================================================ */
  var pinValue = '';
  var busy = false;

  function isActivated() { return store(STORE_KEY) === true; }

  function buildKeypad() {
    var pad = $('#keypad');
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
    pad.innerHTML = '';
    keys.forEach(function (k) {
      var b = el('button', 'key' + (k === 'ok' ? ' go' : k === 'del' ? ' fn' : ''));
      if (k === 'del') b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 6H10l-6 6 6 6h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/><path d="M16 10l-4 4M12 10l4 4"/></svg>';
      else if (k === 'ok') b.innerHTML = '<svg viewBox="0 0 24 24" style="width:22px;height:22px"><path d="M5 12.5l5 5L19 7" stroke-width="2.6"/></svg>';
      else b.textContent = k;
      b.setAttribute('type', 'button');
      b.addEventListener('click', function () { onKey(k); });
      pad.appendChild(b);
    });
    var ok = pad.querySelector('.key.go');
    function syncOk() { ok.disabled = pinValue.length < 4; }
    syncOk();
    pad._sync = syncOk;
  }

  function paintPin() {
    var dots = $$('#pin-dots i');
    dots.forEach(function (d, i) { d.classList.toggle('on', i < pinValue.length); });
    $('#pin').value = new Array(pinValue.length + 1).join('●');
    if ($('#keypad')._sync) $('#keypad')._sync();
  }

  function onKey(k) {
    if (busy) return;
    if (k === 'del') { pinValue = pinValue.slice(0, -1); $('#pin-error').textContent = ''; $('#pin-field').classList.remove('error'); }
    else if (k === 'ok') { submitPin(); return; }
    else if (pinValue.length < 4) { pinValue += k; }
    paintPin();
    if (pinValue.length === 4) setTimeout(submitPin, 130);
  }

  function submitPin() {
    if (busy || pinValue.length !== 4) return;
    busy = true;
    sha256(pinValue).then(function (hash) {
      busy = false;
      if (hash === PASS_HASH) {
        store(STORE_KEY, true);
        pinValue = '';
        paintPin();
        $('#lock-card').classList.add('hidden');
        $('#welcome-card').classList.remove('hidden');
        if (window.BacTaqBridge) BacTaqBridge.haptic();
      } else {
        pinValue = '';
        paintPin();
        var f = $('#pin-field');
        f.classList.remove('error');
        void f.offsetWidth;
        f.classList.add('error');
        $('#pin-error').textContent = 'الكود غلط، حاول تاني';
        if (window.BacTaqBridge) BacTaqBridge.haptic();
        setTimeout(function () { $('#pin-error').textContent = ''; f.classList.remove('error'); }, 1600);
      }
    });
  }

  $('#pin').addEventListener('input', function (e) {
    // support hardware / soft system keyboards: keep only digits
    var digits = (e.target.value || '').replace(/\D/g, '');
    if (digits) { digits.split('').forEach(function () { if (pinValue.length < 4) pinValue += digits[0]; }); }
    pinValue = digits.slice(0, 4);
    e.target.value = new Array(pinValue.length + 1).join('●');
    if ($('#keypad')._sync) $('#keypad')._sync();
    paintPin();
  });
  $('#pin').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitPin(); });

  $('#btn-start').addEventListener('click', function () { show('home'); });

  /* ============================================================
     LIBRARY DATA
     ============================================================ */
  var meta = {};
  var pagesTotal = 0;

  function loadMeta() {
    return fetch('books/meta.json').then(function (r) { return r.json(); }).then(function (m) {
      meta = m || {};
      pagesTotal = 0;
      SUBJECTS.forEach(function (s) {
        var m2 = meta[s.key] || {};
        s.pages = m2.pages || 0;
        s.bytes = m2.bytes || 0;
        pagesTotal += s.pages;
      });
    }).catch(function () { meta = {}; });
  }

  function coverFor(key) {
    return 'covers/' + key + '.jpg';
  }

  function thumbFor(key) {
    return 'covers/' + key + '_thumb.jpg';
  }

  /* ============================================================
     HOME
     ============================================================ */
  function renderHome() {
    var grid = $('#subjects');
    grid.innerHTML = '';
    SUBJECTS.forEach(function (s, i) {
      var theme = THEME[s.key] || { color: '#0e2f6b' };
      var card = el('div', 'subject');
      card.style.animationDelay = (i * 60) + 'ms';
      card.innerHTML =
        '<div class="subject-cover">' +
          '<img src="' + coverFor(s.key) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' +
          '<span class="subject-badge">PDF</span>' +
        '</div>' +
        '<div class="subject-meta">' +
          '<h4>' + s.title + '</h4>' +
          '<p>' + (s.pages ? s.pages + ' صفحة · ' + fmtBytes(s.bytes) : 'كتاب PDF') + '</p>' +
        '</div>' +
        '<span class="subject-open"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></span>';
      card.addEventListener('click', function () { openSubject(s.key); });
      grid.appendChild(card);
    });
    $('#hero-pages').textContent = pagesTotal || '—';
    var totalBytes = SUBJECTS.reduce(function (a, s) { return a + (s.bytes || 0); }, 0);
    $('#lib-size').textContent = totalBytes ? 'الحجم الكلي ' + fmtBytes(totalBytes) : '';
    renderContinue();
  }

  function openSubject(key) {
    window.__activeSubject = key;
    show('library');
  }

  function renderLibrary(key) {
    var s = SUBJECTS.filter(function (x) { return x.key === key; })[0] || SUBJECTS[0];
    var theme = THEME[s.key];
    var m = meta[s.key] || {};
    $('#lib-title').textContent = 'مجلد ' + s.short + ' / ' + s.title;
    $('#lib-sub').textContent = m.drive_name ? ('Google Drive · ' + m.drive_name) : 'مكتبة المواد';
    var ic = $('#lib-icon');
    ic.style.background = theme.color;
    ic.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 13h8M8 16h5"/></svg>';
    $('#chip-size').textContent = 'الحجم: ' + fmtBytes(s.bytes);
    $('#chip-pages').textContent = (s.pages || '—') + ' صفحة';
    $('#folder-count').textContent = '1 ملف · ' + (m.original_bytes ? 'الأصل ' + fmtBytes(m.original_bytes) : 'محلي');

    var files = $('#files');
    files.innerHTML = '';
    var progress = getProgress(s.key);
    var f = el('div', 'file');
    f.innerHTML =
      '<div class="file-thumb"><img src="' + thumbFor(s.key) + '" alt=""></div>' +
      '<div class="file-body">' +
        '<h4>' + s.title + '.pdf</h4>' +
        '<p class="sub">' + s.desc + '</p>' +
        '<div class="file-tags">' +
          '<span class="tag pdf">PDF</span>' +
          '<span class="tag local">محفوظ محليًا</span>' +
          '<span class="tag gold">' + (s.pages || '—') + ' صفحة</span>' +
        '</div>' +
      '</div>' +
      '<span class="file-go"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></span>';
    f.addEventListener('click', function () { openReader(s.key); });
    files.appendChild(f);
    if (progress && progress.page > 1) {
      var note = el('div', 'folder-row');
      note.innerHTML = '<svg class="folder-ic" viewBox="0 0 24 24" style="color:#2ed3a3;fill:rgba(46,211,163,.2)"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> وقفت عند صفحة ' + progress.page;
      files.appendChild(note);
    }
    $$('#lib-chips .chip').forEach(function (c) { c.classList.toggle('on', c.id === ''); });
  }

  /* ============================================================
     PROGRESS
     ============================================================ */
  function getProgress(key) {
    var all = store(PROGRESS_KEY) || {};
    return all[key] || null;
  }
  function setProgress(key, page, total) {
    var all = store(PROGRESS_KEY) || {};
    all[key] = { page: page, total: total, at: Date.now() };
    store(PROGRESS_KEY, all);
  }
  function renderContinue() {
    var all = store(PROGRESS_KEY) || {};
    var best = null;
    SUBJECTS.forEach(function (s) {
      var p = all[s.key];
      if (p && p.page > 1 && (!best || p.at > best.at)) best = { s: s, p: p };
    });
    var card = $('#continue-card');
    if (!best) { card.hidden = true; return; }
    card.hidden = false;
    var pct = Math.max(4, Math.min(100, Math.round(best.p.page / (best.p.total || 1) * 100)));
    $('#continue-row').innerHTML =
      '<img src="' + thumbFor(best.s.key) + '" alt="">' +
      '<div class="continue-info"><b>' + best.s.title + '</b>' +
        '<span>صفحة ' + best.p.page + ' من ' + (best.p.total || '—') + '</span>' +
        '<div class="continue-bar"><i style="width:' + pct + '%"></i></div></div>' +
      '<span class="continue-go"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></span>';
    $('#continue-row').onclick = function () { openReader(best.s.key, best.p.page); };
  }

  /* ============================================================
     READER (PDF.js)
     ============================================================ */
  var pdfState = { doc: null, key: null, page: 1, total: 1, zoom: 1, rendering: false, pending: null };

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
  }

  function openReader(key, page) {
    var s = SUBJECTS.filter(function (x) { return x.key === key; })[0];
    if (!s) return;
    show('reader');
    $('#reader-title').textContent = s.title;
    $('#toc-list').innerHTML = '';
    var saved = getProgress(key);
    var startPage = page || (saved && saved.page) || 1;
    $('#reader-loading').classList.remove('hidden');
    $('#reader-loading span').textContent = 'جاري فتح الكتاب…';

    if (pdfState.doc && pdfState.key === key) {
      goToPage(Math.min(startPage, pdfState.total));
      $('#reader-loading').classList.add('hidden');
      return;
    }
    if (pdfState.doc) { try { pdfState.doc.destroy(); } catch (e) {} }
    pdfState = { doc: null, key: key, page: 1, total: 1, zoom: 1, rendering: false, pending: null };

    if (!window.pdfjsLib) {
      $('#reader-loading span').textContent = 'محرّك PDF مش متاح';
      return;
    }
    pdfjsLib.getDocument({ url: 'books/' + key + '.pdf', cMapUrl: 'js/cmaps/', cMapPacked: true, standardFontDataUrl: 'js/standard_fonts/' })
      .promise.then(function (doc) {
        pdfState.doc = doc;
        pdfState.total = doc.numPages;
        pdfState.page = Math.min(Math.max(1, startPage), doc.numPages);
        $('#seek').max = doc.numPages;
        $('#page-input').max = doc.numPages;
        $('#page-total').textContent = '/ ' + doc.numPages;
        $('#reader-page').textContent = 'صفحة ' + pdfState.page + ' من ' + doc.numPages;
        renderPage();
        loadToc(doc);
        $('#reader-loading').classList.add('hidden');
      })
      .catch(function (err) {
        $('#reader-loading span').textContent = 'تعذّر فتح الكتاب، جرّب تاني';
        console.error(err);
      });
  }

  function renderPage() {
    var doc = pdfState.doc;
    if (!doc) return;
    pdfState.rendering = true;
    doc.getPage(pdfState.page).then(function (page) {
      var canvas = $('#pdf-canvas');
      var vp0 = page.getViewport({ scale: 1 });
      var avail = $('#reader-viewport').clientWidth - 16;
      var dpr = Math.min(window.devicePixelRatio || 1, 2.2);
      var fit = Math.max(0.5, avail / vp0.width);
      var scale = fit * pdfState.zoom;
      var vp = page.getViewport({ scale: scale * dpr });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = Math.floor(vp.width / dpr) + 'px';
      canvas.style.height = Math.floor(vp.height / dpr) + 'px';
      var ctx = canvas.getContext('2d');
      var task = page.render({ canvasContext: ctx, viewport: vp });
      return task.promise.then(function () {
        pdfState.rendering = false;
        $('#seek').value = pdfState.page;
        $('#page-input').value = pdfState.page;
        $('#reader-page').textContent = 'صفحة ' + pdfState.page + ' من ' + pdfState.total;
        setProgress(pdfState.key, pdfState.page, pdfState.total);
        if (pdfState.pending) {
          var p = pdfState.pending;
          pdfState.pending = null;
          goToPage(p);
        }
      });
    }).catch(function (e) { pdfState.rendering = false; console.error(e); });
  }

  function goToPage(n) {
    if (!pdfState.doc) return;
    n = Math.max(1, Math.min(pdfState.total, n | 0));
    if (pdfState.rendering) { pdfState.pending = n; return; }
    pdfState.page = n;
    renderPage();
    $('#reader-viewport').scrollTop = 0;
  }

  function step(d) { goToPage(pdfState.page + d); }

  $('#btn-prev').addEventListener('click', function () { step(-1); });
  $('#btn-next').addEventListener('click', function () { step(1); });
  $('#btn-zoom-in').addEventListener('click', function () { pdfState.zoom = Math.min(2.6, pdfState.zoom + 0.25); renderPage(); });
  $('#btn-zoom-out').addEventListener('click', function () { pdfState.zoom = Math.max(0.6, pdfState.zoom - 0.25); renderPage(); });
  $('#seek').addEventListener('change', function (e) { goToPage(+e.target.value); });
  $('#page-input').addEventListener('change', function (e) { goToPage(+e.target.value); });

  // swipe navigation
  (function () {
    var sx = 0, sy = 0, moved = false;
    var vp = $('#reader-viewport');
    vp.addEventListener('touchstart', function (e) {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    vp.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) { step(dx < 0 ? 1 : -1); }
    }, { passive: true });
  })();

  function loadToc(doc) {
    doc.getOutline().then(function (outline) {
      var list = $('#toc-list');
      list.innerHTML = '';
      if (!outline || !outline.length) {
        list.innerHTML = '<p class="sheet-empty">الكتاب مش فيه فهرس جاهز.<br>استخدم شريط التمرير تحت عشان تتنقّل بين الصفحات.</p>';
        return;
      }
      outline.slice(0, 120).forEach(function (item) {
        var b = el('button', 'sheet-item');
        b.innerHTML = '<b>' + (item.title || '—') + '</b>';
        b.textContent = '';
        b.appendChild(el('b', null, '§'));
        b.appendChild(el('span', null, item.title || '—'));
        b.addEventListener('click', function () {
          var dest = item.dest;
          var p = Promise.resolve(dest);
          if (typeof dest === 'string') { p = doc.getDestination(dest); }
          p.then(function (d) {
            if (!d) return;
            return doc.getPageIndex(d[0]).then(function (idx) { goToPage(idx + 1); closeSheet(); });
          }).catch(function () { closeSheet(); });
        });
        list.appendChild(b);
      });
    }).catch(function () { $('#toc-list').innerHTML = '<p class="sheet-empty">الفهرس مش متاح.</p>'; });
  }

  function openSheet() { $('#toc-sheet').classList.add('open'); }
  function closeSheet() { $('#toc-sheet').classList.remove('open'); }
  $('#btn-contents').addEventListener('click', openSheet);
  $('#toc-sheet').addEventListener('click', function (e) { if (e.target.id === 'toc-sheet') closeSheet(); });

  // hardware back button: reader -> library -> home
  window.BacTaqBack = function () {
    if ($('#toc-sheet').classList.contains('open')) { closeSheet(); return true; }
    if (current === 'reader') { show('library'); return true; }
    if (current === 'library' || current === 'about') { show('home'); return true; }
    if (current === 'home') { return false; }
    return true;
  };

  /* ============================================================
     MISC
     ============================================================ */
  $('#btn-reset').addEventListener('click', function () {
    store(STORE_KEY, false);
    store(PROGRESS_KEY, {});
    location.reload();
  });

  /* boot ---------------------------------------------------- */
  function boot() {
    buildKeypad();
    paintPin();
    loadMeta().then(function () {
      renderHome();
      if (isActivated()) {
        $('#lock-card').classList.add('hidden');
        $('#welcome-card').classList.add('hidden');
        show('home');
      }
    });
  }
  if (window.pdfjsLib) {
    try { pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js'; } catch (e) {}
  }
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') { boot(); }
})();
