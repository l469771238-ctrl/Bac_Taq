/* ============================================================
   Bac-Taq — application logic (offline, no backend)
   ============================================================ */
(function () {
  'use strict';

  /* ---------- constants ---------- */
  var STORE_KEY = 'bactaq.activated';
  var PROGRESS_KEY = 'bactaq.progress';
  var DEVICE_KEY = 'bactaq.device';
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
  function deviceId() {
    var id = store(DEVICE_KEY);
    if (!id) {
      id = window.BacSecurity ? BacSecurity.newDeviceKey() : 'bactaq';
      store(DEVICE_KEY, id);
    }
    return id;
  }
  function prettyDevice(id) {
    id = String(id || '');
    return (id.slice(0, 4) + '-' + id.slice(4, 7) + '-' + id.slice(7, 10)).toUpperCase();
  }

  function unlockError(msg, isOk) {
    var e = $('#pin-error');
    e.textContent = msg;
    e.classList.toggle('ok', !!isOk);
    var f = $('#pw-field');
    f.classList.remove('error');
    if (!isOk) { void f.offsetWidth; f.classList.add('error'); }
  }

  function finishActivation(method) {
    store(STORE_KEY, true);
    store('bactaq.method', String(method));
    buzz();
    $('#lock-card').classList.add('hidden');
    $('#welcome-card').classList.remove('hidden');
    $('#welcome-device').innerHTML =
      '<span class="tiny">كود الجهاز</span><bdi>' + prettyDevice(deviceId()) + '</bdi>';
    if (method === 'device-key') {
      $('.welcome-name').textContent = 'أهلاً بيك في Bac-Taq';
      $('.welcome-text').innerHTML = 'تم تفعيل كود الجهاز بنجاح.<br>الكود اتربط بالموبايل ده، وهيفتح على طول من دلوقتي.';
    }
  }

  function tryPassword() {
    if (busy) return;
    var raw = ($('#pw').value || '').trim();
    if (!raw) { unlockError('اكتب الكود الأول'); buzz(); return; }
    busy = true;
    $('#btn-unlock').textContent = 'جاري التحقق…';
    window.BacSecurity.checkPassword(raw).then(function (ok) {
      busy = false;
      $('#btn-unlock').textContent = 'تفعيل وفتح التطبيق';
      if (ok) {
        unlockError('', true);
        finishActivation('password');
      } else {
        // maybe it is a device key typed in the main box
        window.BacSecurity.verifyInvite(raw).then(function (inv) {
          if (inv) { acceptInvite(inv, '#pin-error'); } else {
            unlockError('الكود غلط، راجع الكود وجرّب تاني');
            buzz();
            $('#pw').select();
          }
        });
      }
    });
  }

  function acceptInvite(inv, msgSelector) {
    var box = $(msgSelector);
    box.classList.add('ok');
    box.textContent = 'كود جهاز صحيح (خانة ' + inv.slot + ') · جاري التفعيل…';
    store('bactaq.slot', inv.slot);
    setTimeout(function () { finishActivation('device-key'); }, 550);
  }

  function tryDeviceKey() {
    var raw = ($('#invite').value || '').trim();
    var msg = $('#invite-msg');
    msg.classList.remove('ok');
    msg.textContent = '';
    if (!raw) { msg.textContent = 'اكتب كود الجهاز الأول'; return; }
    window.BacSecurity.verifyInvite(raw).then(function (inv) {
      if (!inv) {
        msg.textContent = 'الكود مش صحيح أو منتهي';
        buzz();
        return;
      }
      var already = isActivated();
      store('bactaq.slot', inv.slot);
      msg.classList.add('ok');
      msg.textContent = 'تم تفعيل كود الجهاز ✓';
      if (already) {
        buzz();
        toast('تم تحديث كود الجهاز');
        return;
      }
      finishActivation('device-key');
      // the welcome card lives on the lock screen; show it after the success beat
      setTimeout(function () { show('lock'); }, 650);
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
  $('#btn-device-key').addEventListener('click', function () {
    show('about');
    setTimeout(function () { $('#invite').focus(); }, 350);
  });
  $('#btn-invite').addEventListener('click', tryDeviceKey);
  $('#invite').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryDeviceKey(); });
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

  function openSheet() { $('#toc-sheet').classList.add('open'); }
  function closeSheet() { $('#toc-sheet').classList.remove('open'); }
  $('#btn-contents').addEventListener('click', openSheet);
  $('#toc-sheet').addEventListener('click', function (e) { if (e.target.id === 'toc-sheet') closeSheet(); });

  window.BacTaqBack = function () {
    if ($('#toc-sheet').classList.contains('open')) { closeSheet(); return true; }
    if (current === 'reader' || current === 'library') { show('home'); return true; }
    if (current === 'about') { show('home'); return true; }
    if (current === 'home') { return false; }
    return true;
  };

  /* ============================================================
     ABOUT / SETTINGS
     ============================================================ */
  function fillAbout() {
    $('#device-id').textContent = prettyDevice(deviceId());
    var slot = store('bactaq.slot');
    if (slot) { $('#device-id').textContent += ' · خانة ' + slot; }
  }

  $('#btn-reset').addEventListener('click', function () {
    if (!window.confirm('إعادة ضبط التفعيل هتخلي التطبيق يطلب الكود تاني. متأكد؟')) return;
    store(STORE_KEY, false);
    store(PROGRESS_KEY, {});
    location.reload();
  });

  /* ---------- boot ---------- */
  function boot() {
    deviceId();
    loadMeta().then(function () {
      renderHome();
      fillAbout();
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
