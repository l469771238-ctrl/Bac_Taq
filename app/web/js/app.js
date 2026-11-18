/* ============================================================
   Bac-Taq — application logic (offline, no backend)
   ============================================================ */
(function () {
  'use strict';

  /* ---------- constants ---------- */
  var STORE_KEY = 'bactaq.activated';
  var PROGRESS_KEY = 'bactaq.progress';
  var MARKS_KEY = 'bactaq.bookmarks';
  var MAX_NAME = 60;
  var THEME = {
    arabic:      { color: '#16a085' },
    english:     { color: '#2f6fed' },
    history:     { color: '#c9902a' },
    programming: { color: '#8b5cf6' }
  };
  var SUBJECTS = [
    { key: 'arabic',      title: 'اللغة العربية', desc: 'الأداءات والتقييمات — الصف الثالث الثانوي', short: 'عربي' },
    { key: 'english',     title: 'English',      desc: 'إجابات تقييمات الوزارة — الصف الثالث الثانوي', short: 'إنجليزي' },
    { key: 'history',     title: 'التاريخ',       desc: 'الامتحان — الدراسات الاجتماعية', short: 'تاريخ' },
    { key: 'programming', title: 'البرمجة',       desc: 'الأداءات والتقييمات — الصف الثالث الثانوي', short: 'برمجة' }
  ];

  /* ---------- helpers ---------- */
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
    } catch (e) { /* storage unavailable */ }
    return null;
  }
  function toast(msg) {
    var t = $('#toast');
    // never cover an open sheet or dialog: the list itself is the feedback there
    if ($('#toc-sheet').classList.contains('open') || $('#mark-modal').classList.contains('open')) { return; }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }
  function buzz() {
    try { if (window.BacTaqBridge && BacTaqBridge.haptic) BacTaqBridge.haptic(); } catch (e) {}
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
  }

  /* ---------- navigation ---------- */
  var current = 'lock';
  function show(id) {
    if (id === current) { return; }
    $$('.screen').forEach(function (s) { s.classList.remove('active'); });
    var target = $('#screen-' + id);
    if (target) target.classList.add('active');
    current = id;
    if (id === 'library') { renderLibrary(window.__activeSubject); }
    if (id === 'home') { renderHome(); }
    if (id === 'about') { fillAbout(); }
    if (id !== 'reader') { closeSheet(); }
  }
  document.addEventListener('click', function (e) {
    var nav = e.target.closest && e.target.closest('[data-nav]');
    if (nav) { show(nav.getAttribute('data-nav')); }
  });

  /* ============================================================
     ACTIVATION
     ============================================================ */
  var busy = false;

  function isActivated() {
    // stored as JSON true / "true" / raw true depending on the code path
    var v = store(STORE_KEY);
    if (v === null) {
      try { v = localStorage.getItem(STORE_KEY); } catch (e) {}
    }
    return v === true || v === 'true';
  }
  function unlockError(msg, isOk) {
    var e = $('#pin-error');
    e.textContent = msg;
    e.classList.toggle('ok', !!isOk);
    var f = $('#pw-field');
    f.classList.remove('error');
    if (!isOk) { void f.offsetWidth; f.classList.add('error'); }
  }

  function finishActivation() {
    store(STORE_KEY, true);
    store('bactaq.method', 'password');
    buzz();
    $('#lock-card').classList.add('hidden');
    $('#welcome-card').classList.remove('hidden');
  }

  function tryPassword() {
    if (busy) return;
    var raw = ($('#pw').value || '').trim();
    if (!raw) { unlockError('اكتب كلمة السر الأول'); buzz(); return; }
    busy = true;
    $('#btn-unlock').textContent = 'جاري التحقق…';
    window.BacSecurity.checkPassword(raw).then(function (ok) {
      busy = false;
      $('#btn-unlock').textContent = 'دخول';
      if (ok) {
        unlockError('', true);
        finishActivation();
      } else {
        unlockError('كلمة السر غلط، جرّب تاني');
        buzz();
        $('#pw').select();
      }
    }).catch(function () {
      busy = false;
      $('#btn-unlock').textContent = 'دخول';
      unlockError('حصلت مشكلة، جرّب تاني');
    });
  }

  $('#pw-eye').addEventListener('click', function () {
    var i = $('#pw');
    var shown = i.type === 'text';
    i.type = shown ? 'password' : 'text';
    this.classList.toggle('on', !shown);
  });
  $('#btn-unlock').addEventListener('click', tryPassword);
  $('#pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryPassword(); });
  $('#pw').addEventListener('input', function () {
    $('#pin-error').textContent = '';
    $('#pw-field').classList.remove('error');
  });
  $('#btn-start').addEventListener('click', function () { show('home'); });

  /* ============================================================
     BOOKS DATA
     ============================================================ */
  var meta = {};
  var pagesTotal = 0;

  function loadMeta() {
    return fetch('books/meta.json').then(function (r) { return r.json(); }).then(function (m) {
      meta = m || {};
      pagesTotal = 0;
      SUBJECTS.forEach(function (s) {
        var x = meta[s.key] || {};
        s.pages = x.pages || 0;
        s.bytes = x.bytes || 0;
        pagesTotal += s.pages;
      });
    }).catch(function () {
      // packaged copies keep working even if metadata is missing
      SUBJECTS.forEach(function (s) { s.pages = s.pages || 0; s.bytes = s.bytes || 0; });
    });
  }

  /* ============================================================
     HOME
     ============================================================ */
  function renderHome() {
    var h = new Date().getHours();
    var greet = h < 12 ? 'صباح الخير ☀️' : h < 17 ? 'نهارك سعيد 🌤️' : 'مساء الخير 🌙';
    if ($('#greet')) $('#greet').textContent = greet;
    var grid = $('#subjects');
    grid.innerHTML = '';
    SUBJECTS.forEach(function (s, i) {
      var card = el('div', 'subject');
      card.style.animationDelay = (i * 60) + 'ms';
      card.innerHTML =
        '<div class="subject-cover">' +
          '<img src="covers/' + s.key + '.jpg" alt="" loading="lazy">' +
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
    var theme = THEME[s.key] || { color: '#0e2f6b' };
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
    var f = el('div', 'file');
    f.innerHTML =
      '<div class="file-thumb"><img src="covers/' + s.key + '_thumb.jpg" alt=""></div>' +
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

    var progress = getProgress(s.key);
    if (progress && progress.page > 1) {
      var note = el('div', 'folder-row');
      note.innerHTML = '<svg class="folder-ic" viewBox="0 0 24 24" style="color:#2ed3a3;fill:rgba(46,211,163,.2)"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> وقفت عند صفحة ' + progress.page;
      files.appendChild(note);
    }
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
      '<img src="covers/' + best.s.key + '_thumb.jpg" alt="">' +
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
    $('#marks-view').innerHTML = '';
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
      $('#reader-loading span').textContent = 'محرّك PDF مش متاح على الجهاز ده';
      return;
    }
    pdfjsLib.getDocument({
      url: 'books/' + key + '.pdf',
      cMapUrl: 'js/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'js/standard_fonts/'
    }).promise.then(function (doc) {
      pdfState.doc = doc;
      pdfState.total = doc.numPages;
      pdfState.page = Math.min(Math.max(1, startPage), doc.numPages);
      $('#seek').max = doc.numPages;
      $('#page-input').max = doc.numPages;
      $('#page-total').textContent = '/ ' + doc.numPages;
      $('#reader-page').textContent = 'صفحة ' + pdfState.page + ' من ' + doc.numPages;
      renderPage();
      loadOutline(doc);
      paintMarksCount();
      $('#reader-loading').classList.add('hidden');
    }).catch(function (err) {
      $('#reader-loading span').textContent = 'تعذّر فتح الكتاب، جرّب تاني';
      if (window.console) console.error(err);
    });
  }

  function renderPage() {
    var doc = pdfState.doc;
    if (!doc) return;
    pdfState.rendering = true;
    doc.getPage(pdfState.page).then(function (page) {
      var canvas = $('#pdf-canvas');
      var base = page.getViewport({ scale: 1 });
      var avail = Math.max(200, $('#reader-viewport').clientWidth - 16);
      var dpr = Math.min(window.devicePixelRatio || 1, 2.2);
      var fit = avail / base.width;
      var vp = page.getViewport({ scale: fit * pdfState.zoom * dpr });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = Math.floor(vp.width / dpr) + 'px';
      canvas.style.height = Math.floor(vp.height / dpr) + 'px';
      return page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise.then(function () {
        pdfState.rendering = false;
        $('#seek').value = pdfState.page;
        $('#page-input').value = pdfState.page;
        $('#reader-page').textContent = 'صفحة ' + pdfState.page + ' من ' + pdfState.total;
        setProgress(pdfState.key, pdfState.page, pdfState.total);
        paintMarksCount();
        if ($('#toc-sheet').classList.contains('open') && !$('#marks-view').classList.contains('hidden')) { renderMarks(); }
        if (pdfState.pending) {
          var p = pdfState.pending;
          pdfState.pending = null;
          goToPage(p);
        }
      });
    }).catch(function (e) {
      pdfState.rendering = false;
      if (window.console) console.error(e);
    });
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
  $('#btn-zoom-in').addEventListener('click', function () {
    pdfState.zoom = Math.min(2.6, pdfState.zoom + 0.25); renderPage();
  });
  $('#btn-zoom-out').addEventListener('click', function () {
    pdfState.zoom = Math.max(0.6, pdfState.zoom - 0.25); renderPage();
  });
  $('#seek').addEventListener('change', function (e) { goToPage(+e.target.value); });
  $('#page-input').addEventListener('change', function (e) { goToPage(+e.target.value); });

  // swipe between pages
  (function () {
    var sx = 0, sy = 0;
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

  /* ---------- in-book index (outline + text search) ---------- */
  var tocCache = {};

  function loadOutline(doc) {
    var key = pdfState.key;
    var list = $('#toc-list');
    if (tocCache[key]) { paintToc(tocCache[key], doc); return; }
    doc.getOutline().then(function (outline) {
      tocCache[key] = outline || [];
      paintToc(tocCache[key], doc);
    }).catch(function () { tocCache[key] = []; paintToc([], doc); });
  }

  function paintToc(outline, doc) {
    var list = $('#toc-list');
    list.innerHTML = '';
    if (outline && outline.length) {
      outline.slice(0, 150).forEach(function (item) {
        var b = el('button', 'sheet-item');
        b.appendChild(el('b', null, '§'));
        b.appendChild(el('span', null, item.title || '—'));
        b.addEventListener('click', function () {
          var p = typeof item.dest === 'string' ? doc.getDestination(item.dest) : Promise.resolve(item.dest);
          p.then(function (d) {
            if (!d) return;
            return doc.getPageIndex(d[0]).then(function (idx) { goToPage(idx + 1); closeSheet(); });
          }).catch(function () { closeSheet(); });
        });
        list.appendChild(b);
      });
      return;
    }
    list.innerHTML =
      '<p class="sheet-empty">الكتاب مش فيه فهرس مدمج.<br>دوّر على أي كلمة وروح للصفحة على طول:</p>';
    var box = el('div', 'toc-search');
    box.innerHTML = '<input id="toc-q" type="search" placeholder="دوّر في الكتاب… (مثال: الوحدة الأولى)" autocomplete="off">';
    list.appendChild(box);
    var results = el('div', 'toc-results');
    list.appendChild(results);
    var timer = null;
    box.querySelector('input').addEventListener('input', function (e) {
      var q = e.target.value.trim();
      clearTimeout(timer);
      if (q.length < 2) { results.innerHTML = ''; return; }
      timer = setTimeout(function () { searchBook(q, results); }, 320);
    });
  }

  function searchBook(q, results) {
    var doc = pdfState.doc;
    if (!doc) return;
    results.innerHTML = '<p class="sheet-empty">بيدوّر…</p>';
    var found = [];
    var pageNo = 1;
    var stop = false;
    function next() {
      if (stop || pageNo > doc.numPages || found.length >= 30) {
        results.innerHTML = '';
        if (!found.length) {
          results.innerHTML = '<p class="sheet-empty">مفيش نتائج للكلمة دي</p>';
          return;
        }
        found.forEach(function (f) {
          var b = el('button', 'sheet-item');
          b.appendChild(el('b', null, f.page));
          b.appendChild(el('span', null, f.snippet));
          b.addEventListener('click', function () { goToPage(f.page); closeSheet(); });
          results.appendChild(b);
        });
        return;
      }
      doc.getPage(pageNo).then(function (page) {
        return page.getTextContent().then(function (tc) {
          var text = tc.items.map(function (it) { return it.str; }).join(' ');
          var idx = text.indexOf(q);
          if (idx >= 0) {
            found.push({
              page: pageNo,
              snippet: '…' + text.slice(Math.max(0, idx - 22), idx + q.length + 36).replace(/\s+/g, ' ') + '…'
            });
          }
        });
      }).catch(function () {}).then(function () {
        pageNo++;
        setTimeout(next, 0);
      });
    }
    next();
  }

  /* ============================================================
     BOOKMARKS — unlimited, named, per book, stored on the device
     ============================================================ */
  function allMarks() {
    var m = store(MARKS_KEY);
    return (m && typeof m === 'object') ? m : {};
  }
  function bookMarks(key) {
    var all = allMarks();
    return (all[key] || []).slice().sort(function (a, b) { return a.page - b.page; });
  }
  function persistMarks(all) { store(MARKS_KEY, all); paintMarksCount(); }
  function saveMark(key, page, name) {
    var all = allMarks();
    var list = all[key] || (all[key] = []);
    var mark = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                 page: page, name: (name || '').trim().slice(0, MAX_NAME) || ('صفحة ' + page), at: Date.now() };
    list.push(mark);
    persistMarks(all);
    return mark;
  }
  function renameMark(key, id, name) {
    var all = allMarks();
    (all[key] || []).forEach(function (m) {
      if (m.id === id) { m.name = (name || '').trim().slice(0, MAX_NAME) || m.name; }
    });
    persistMarks(all);
  }
  function deleteMark(key, id) {
    var all = allMarks();
    all[key] = (all[key] || []).filter(function (m) { return m.id !== id; });
    persistMarks(all);
  }
  function markOnPage(key, page) {
    return bookMarks(key).filter(function (m) { return m.page === page; })[0] || null;
  }
  function paintMarksCount() {
    var n = pdfState.key ? bookMarks(pdfState.key).length : 0;
    var c = $('#marks-count');
    if (c) c.textContent = n;
    var here = pdfState.key ? markOnPage(pdfState.key, pdfState.page) : null;
    var btn = $('#btn-bookmark');
    if (btn) btn.classList.toggle('on', !!here);
    var dot = $('#bookmark-dot');
    if (dot) dot.classList.toggle('on', pdfState.key ? bookMarks(pdfState.key).length > 0 : false);
  }

  /* ---------- add / rename modal ---------- */
  var markEdit = { id: null, page: 1 };

  function suggestLabels(page) {
    var out = ['صفحة ' + page];
    if (pdfState.key === 'arabic') out = out.concat(['مراجعة قواعد', 'قطعة نحو', 'نصوص وأدب']);
    if (pdfState.key === 'english') out = out.concat(['مفردات', 'قواعد Unit', 'Reading', 'Writing']);
    if (pdfState.key === 'history') out = out.concat(['فصل مهم', 'تواريخ', 'أسئلة امتحان']);
    if (pdfState.key === 'programming') out = out.concat(['كود مهم', 'تعريفات', 'أسئلة النموذج']);
    out.push('مراجعة سريعة');
    return out;
  }

  function openMarkModal(opts) {
    markEdit.id = opts && opts.id ? opts.id : null;
    markEdit.page = opts && opts.page ? opts.page : pdfState.page;
    var existing = markEdit.id ? bookMarks(pdfState.key).filter(function (m) { return m.id === markEdit.id; })[0] : null;
    $('#mark-modal-title').textContent = existing ? 'تعديل الإشارة' : 'إشارة مرجعية جديدة';
    $('#mark-page-label').textContent = 'صفحة ' + markEdit.page;
    var inp = $('#mark-name');
    inp.value = existing ? existing.name : '';
    inp.placeholder = 'مثال: امتحان 2024 — السؤال 3';
    $('#mark-save').textContent = existing ? 'حفظ التعديل' : 'حفظ الإشارة';
    $('#mark-save').disabled = false;
    var sug = $('#mark-suggest');
    sug.innerHTML = '';
    suggestLabels(markEdit.page).forEach(function (label) {
      var b = el('button', null, label);
      b.type = 'button';
      b.addEventListener('click', function () {
        inp.value = label;
        inp.focus();
      });
      sug.appendChild(b);
    });
    $('#mark-modal').classList.add('open');
    setTimeout(function () { inp.focus(); }, 260);
  }
  function closeMarkModal() { $('#mark-modal').classList.remove('open'); }

  $('#mark-save').addEventListener('click', function () {
    if (!pdfState.key) { closeMarkModal(); return; }
    var name = ($('#mark-name').value || '').trim();
    if (markEdit.id) {
      renameMark(pdfState.key, markEdit.id, name);
      toast('تم تعديل الإشارة');
    } else {
      saveMark(pdfState.key, markEdit.page, name);
      toast('تمت إضافة الإشارة');
      var btn = $('#btn-bookmark');
      btn.classList.add('saved');
      setTimeout(function () { btn.classList.remove('saved'); }, 400);
    }
    closeMarkModal();
    paintMarksCount();
    if ($('#toc-sheet').classList.contains('open')) renderMarks();
  });
  $('#mark-cancel').addEventListener('click', closeMarkModal);
  $('#mark-modal').addEventListener('click', function (e) { if (e.target.id === 'mark-modal') closeMarkModal(); });
  $('#mark-name').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('#mark-save').click();
  });

  /* ---------- header button: bookmark the current page ---------- */
  $('#btn-bookmark').addEventListener('click', function () {
    if (!pdfState.key) return;
    var existing = markOnPage(pdfState.key, pdfState.page);
    if (existing) {
      // already bookmarked -> offer rename / open the list
      openSheet('marks');
      var row = $('#marks-view').querySelector('[data-id="' + existing.id + '"]');
      if (row) { row.scrollIntoView({ block: 'center' }); }
      toast('الصفحة دي عندها إشارة بالفعل');
      return;
    }
    openMarkModal({ page: pdfState.page });
  });

  /* ---------- marks list ---------- */
  function renderMarks() {
    var view = $('#marks-view');
    if (!pdfState.key) { view.innerHTML = ''; return; }
    var marks = bookMarks(pdfState.key);
    var current = markOnPage(pdfState.key, pdfState.page);
    view.innerHTML = '';

    var head = el('div', 'list-head');
    head.innerHTML = '<span>' + (marks.length ? marks.length + ' إشارة في الكتاب ده' : 'لسه مفيش إشارات') + '</span>' +
      (marks.length ? '<button id="clear-marks">حذف الكل</button>' : '');
    view.appendChild(head);

    marks.forEach(function (m) {
      var row = el('div', 'mark-row');
      row.setAttribute('data-id', m.id);
      row.innerHTML =
        '<span class="mark-icon"><svg viewBox="0 0 24 24"><path d="M7 4.5h10a1 1 0 0 1 1 1V21l-6-4.2L6 21V5.5a1 1 0 0 1 1-1z"/></svg></span>' +
        '<div class="mark-body">' +
          '<b>' + escapeHtml(m.name) + '</b>' +
          '<span>صفحة ' + m.page + (m.page === pdfState.page ? ' · الصفحة الحالية' : '') +
            ' · ' + dateLabel(m.at) + '</span>' +
          '<div class="mark-open">' +
            '<button class="chip-mini" data-act="go">افتح الصفحة</button>' +
            '<button class="chip-mini" data-act="rename">تعديل الاسم</button>' +
          '</div>' +
        '</div>' +
        '<div class="mark-actions">' +
          '<button class="ibtn danger" data-act="del" aria-label="حذف"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>' +
        '</div>';
      row.addEventListener('click', function (e) {
        var act = e.target.closest && e.target.closest('[data-act]');
        var action = act ? act.getAttribute('data-act') : null;
        if (action === 'del') {
          deleteMark(pdfState.key, m.id);
          paintMarksCount();
          renderMarks();
          toast('تم حذف الإشارة');
          return;
        }
        if (action === 'rename') { openMarkModal({ id: m.id, page: m.page }); return; }
        // anywhere else on the row: jump to the page
        goToPage(m.page);
        closeSheet();
      });
      view.appendChild(row);
    });

    var add = el('button', 'add-mark-btn');
    add.type = 'button';
    add.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 4.5h10a1 1 0 0 1 1 1V21l-6-4.2L6 21V5.5a1 1 0 0 1 1-1zM12 9v5M9.5 11.5h5"/></svg>' +
      (current ? 'الصفحة دي متسجّلة — أضف كمان إشارة' : 'أضف إشارة على صفحة ' + pdfState.page);
    add.disabled = !pdfState.doc;
    add.addEventListener('click', function () { openMarkModal({ page: pdfState.page }); });
    view.appendChild(add);

    if (!marks.length) {
      var empty = el('div', 'mark-empty');
      empty.innerHTML = '<div class="big">🔖</div>' +
        '<p>مفيش إشارات في الكتاب ده لسه</p>' +
        '<span>اضغط على أيقونة الإشارة فوق وأنت واقف على أي صفحة،<br>سمّيها بأي اسم، وارجع لها في أي وقت.</span>';
      view.insertBefore(empty, head.nextSibling);
    }

    var clear = view.querySelector('#clear-marks');
    if (clear) {
      clear.addEventListener('click', function () {
        var all = allMarks();
        all[pdfState.key] = [];
        persistMarks(all);
        renderMarks();
        toast('تم حذف كل إشارات الكتاب');
      });
    }
    return view;
  }

  function dateLabel(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var today = new Date();
    var same = d.toDateString() === today.toDateString();
    if (same) {
      return 'النهاردة ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function c(ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* ---------- sheet with two tabs ---------- */
  function openSheet(tab) {
    $('#toc-sheet').classList.add('open');
    switchSheetTab(tab === 'marks' ? 'marks' : 'index');
  }
  function closeSheet() {
    $('#toc-sheet').classList.remove('open');
    closeMarkModal();
  }
  function switchSheetTab(tab) {
    var marks = tab === 'marks';
    $('#tab-index').classList.toggle('on', !marks);
    $('#tab-marks').classList.toggle('on', marks);
    $('#toc-list').classList.toggle('hidden', marks);
    $('#marks-view').classList.toggle('hidden', !marks);
    if (marks) { renderMarks(); } else { paintMarksCount(); }
  }
  $('#tab-index').addEventListener('click', function () { switchSheetTab('index'); });
  $('#tab-marks').addEventListener('click', function () { switchSheetTab('marks'); });
  $('#btn-contents').addEventListener('click', function () { openSheet('index'); });
  $('#toc-sheet').addEventListener('click', function (e) { if (e.target.id === 'toc-sheet') closeSheet(); });

  window.BacTaqBack = function () {
    if ($('#mark-modal').classList.contains('open')) { closeMarkModal(); return true; }
    if ($('#toc-sheet').classList.contains('open')) { closeSheet(); return true; }
    if (current === 'reader' || current === 'library') { show('home'); return true; }
    if (current === 'about') { show('home'); return true; }
    if (current === 'home') { return false; }
    return true;
  };

  /* ============================================================
     ABOUT / SETTINGS
     ============================================================ */
  $('#btn-reset').addEventListener('click', function () {
    if (!window.confirm('إعادة ضبط التفعيل هتخلي التطبيق يطلب الكود تاني. متأكد؟')) return;
    store(STORE_KEY, false);
    store(PROGRESS_KEY, {});
    location.reload();
  });

  /* ---------- boot ---------- */
  function boot() {
    loadMeta().then(function () {
      renderHome();
      if (isActivated()) {
        show('home');
      } else {
        $('#lock-card').classList.remove('hidden');
        $('#welcome-card').classList.add('hidden');
        setTimeout(function () { $('#pw').focus(); }, 400);
      }
    });
  }
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') { boot(); }
})();
