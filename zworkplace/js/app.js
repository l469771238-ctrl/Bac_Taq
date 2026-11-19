/* ============================================================
   Z-Project Workplace — core
   كل البيانات بتتحفظ على الجهاز (localStorage) دلوقتي، والطبقة
   اللي بتقرأ/تكتب معزولة في DB عشان نربطها بأي مصدر بعدين بسهولة.
   ============================================================ */
(function () {
  'use strict';

  var K = 'zwork.v1';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------------- storage ---------------- */
  var DB = {
    load: function () {
      try {
        var raw = localStorage.getItem(K);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    save: function (s) {
      try { localStorage.setItem(K, JSON.stringify(s)); } catch (e) { toast('مساحة التخزين امتلأت'); }
    }
  };

  var state = DB.load() || {
    teacher: { name: 'مستر جاسر', subject: 'رياضيات' },
    klass: '3/2',
    students: [],
    attendance: {},   // { '2026-11-19': { studentId: 'p' | 'l' | 'a' } }
    homework: [],     // { id, title, desc, due, createdAt, done: {studentId: true} }
    board: []         // { id, text, at }
  };

  function seed() {
    if (state.students.length) return;
    var names = ['أحمد محمد', 'محمود السيد', 'يوسف خالد', 'عمر حسن', 'كريم طارق', 'زياد إبراهيم',
                 'مصطفى عادل', 'حسين رمضان', 'مروان سعيد', 'آدم هشام', 'سيف الدين'];
    state.students = names.map(function (n, i) { return { id: 's' + (i + 1), name: n, phone: '', added: Date.now() - i * 86400000 }; });
    state.homework = [
      { id: 'h1', title: 'الوحدة 4 — تمارين 1 و 2', desc: 'صفحة 87',
        due: todayISO(2), createdAt: Date.now() - 86400000, done: { s1: true, s2: true, s4: true, s6: true } },
      { id: 'h2', title: 'مراجعة المتتابعات', desc: 'ورقة المراجعة',
        due: todayISO(5), createdAt: Date.now() - 3600000, done: { s3: true } }
    ];
    state.board = [{ id: 'b1', text: 'امتحان الشهر يوم 28 — الوحدة 3 و 4', at: Date.now() - 7200000 }];
    DB.save(state);
  }

  /* ---------------- dates ---------------- */
  function todayISO(plus) {
    var d = new Date();
    if (plus) d.setDate(d.getDate() + plus);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var AR_DAYS = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
  function prettyDate(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return AR_DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + AR_MONTHS[d.getMonth()];
  }
  function relDue(iso) {
    var t = new Date(todayISO() + 'T00:00:00');
    var p = String(iso).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var diff = Math.round((d - t) / 86400000);
    if (diff === 0) return 'التسليم النهاردة';
    if (diff === 1) return 'التسليم بكرة';
    if (diff < 0) return 'فات ' + Math.abs(diff) + ' يوم';
    return 'باقي ' + diff + ' يوم';
  }

  /* ---------------- ui helpers ---------------- */
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/);
    return (p[0] || '؟').charAt(0) + (p[1] ? p[1].charAt(0) : '');
  }
  function save() { DB.save(state); }

  /* ---------------- navigation ---------------- */
  var current = 'home';
  function show(name) {
    if (!$('#screen-' + name)) name = 'home';
    current = name;
    $$('.screen').forEach(function (s) { s.classList.remove('active'); });
    $('#screen-' + name).classList.add('active');
    $$('.nav .tab').forEach(function (t) { t.classList.toggle('on', t.getAttribute('data-go') === name); });
    if (name === 'students') renderStudents();
    if (name === 'attendance') renderAttendance();
    if (name === 'homework') renderHomework();
    if (name === 'home') renderHome();
    var sc = $('#screen-' + name + ' .scroller');
    if (sc) sc.scrollTop = 0;
  }
  document.addEventListener('click', function (e) {
    var go = e.target.closest('[data-go]');
    if (go) { show(go.getAttribute('data-go')); return; }
    var back = e.target.closest('[data-back]');
    if (back) { show('home'); }
  });

  /* ---------------- home ---------------- */
  function renderHome() {
    var h = new Date().getHours();
    // "مستر جاسر" -> استخدم الاسم اللي بعد اللقب لو موجود
    var parts = String(state.teacher.name || '').trim().split(/\s+/);
    var first = parts[0] || '';
    var call = (parts.length > 1 && /^(مستر|ميس|دكتور|أستاذ|م\.)$/.test(first)) ? first + ' ' + parts[1] : first;
    $('#greet').textContent = (h < 12 ? 'صباح الخير' : h < 17 ? 'نهارك سعيد' : 'مساء الخير') + ' يا ' + call;
    $('#today').textContent = prettyDate(todayISO()) + ' · ' + state.klass;
    $('#avatar').textContent = initials(state.teacher.name);

    var today = attendanceToday();
    var present = 0, late = 0, absent = 0;
    state.students.forEach(function (s) {
      var v = today[s.id];
      if (v === 'p') present++; else if (v === 'l') late++; else if (v === 'a') absent++;
    });
    var marked = present + late + absent;
    $('#st-students').textContent = state.students.length;
    $('#st-hw').textContent = state.homework.length;
    $('#st-rate').textContent = marked ? Math.round((present + late) / state.students.length * 100) + '%' : '—';
    $('#att-hint').textContent = marked ? marked + ' من ' + state.students.length + ' اتسجلوا' : 'لسه مفيش تسجيل النهاردة';
    $('#stu-hint').textContent = state.students.length + ' طالب في الفصل';
    $('#hw-hint').textContent = state.homework.length ? state.homework.length + ' واجب مفتوح' : 'مفيش واجبات';
    $('#hero-sub').textContent = marked ? 'حضور النهاردة اتسجل ✓' : 'ابدأ بتسجيل حضور النهاردة';

    var recent = state.homework.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }).slice(0, 2);
    var box = $('#recent-hw');
    box.innerHTML = '';
    if (!recent.length) {
      box.innerHTML = '<div class="empty"><div class="big">📌</div><b>مفيش واجبات لسه</b><span>ضيف أول واجب للفصل</span></div>';
    }
    recent.forEach(function (hw) { box.appendChild(hwCard(hw)); });
  }

  /* ---------------- students ---------------- */
  function renderStudents() {
    var q = ($('#stu-search').value || '').trim();
    $('#students-sub').textContent = state.students.length + ' طالب';
    var list = $('#students-list');
    list.innerHTML = '';
    var rows = state.students.filter(function (s) { return !q || s.name.indexOf(q) > -1; });
    if (!rows.length) {
      list.innerHTML = '<div class="empty"><div class="big">🔍</div><b>مفيش نتايج</b><span>جرّب اسم تاني</span></div>';
      return;
    }
    var hist = lastDays(6);
    rows.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'stu';
      var dots = hist.map(function (d) {
        var v = (state.attendance[d] || {})[s.id];
        return '<i class="dot ' + (v === 'p' ? 'p' : v === 'l' ? 'l' : v === 'a' ? 'a' : '') + '"></i>';
      }).join('');
      row.innerHTML = '<div class="av">' + esc(initials(s.name)) + '</div>' +
        '<div class="in"><b>' + esc(s.name) + '</b><span>' + (s.phone ? esc(s.phone) : 'بدون رقم') + '</span></div>' +
        '<div class="dots">' + dots + '</div>';
      row.addEventListener('click', function () { studentSheet(s); });
      list.appendChild(row);
    });
  }
  function lastDays(n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      out.push(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()));
    }
    return out;
  }

  /* ---------------- attendance ---------------- */
  function attendanceToday() {
    var k = todayISO();
    if (!state.attendance[k]) state.attendance[k] = {};
    return state.attendance[k];
  }
  function renderAttendance() {
    var today = attendanceToday();
    $('#att-sub').textContent = prettyDate(todayISO());
    var list = $('#attendance-list');
    list.innerHTML = '';
    var p = 0, l = 0, a = 0;
    state.students.forEach(function (s) {
      var v = today[s.id] || '';
      if (v === 'p') p++; else if (v === 'l') l++; else if (v === 'a') a++;
      var row = document.createElement('div');
      row.className = 'att-row';
      row.innerHTML = '<div class="av" style="width:34px;height:34px;border-radius:11px;background:linear-gradient(135deg,#1A4A9E,#0A1F4D);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:800">' + esc(initials(s.name)) + '</div>' +
        '<div class="nm">' + esc(s.name) + '</div>' +
        '<div class="seg"><button data-v="present">حاضر</button><button data-v="late">متأخر</button><button data-v="absent">غايب</button></div>';
      var seg = row.querySelector('.seg');
      var map = { present: 'p', late: 'l', absent: 'a' };
      $$('button', seg).forEach(function (b) {
        b.classList.toggle('on', map[b.getAttribute('data-v')] === v);
        b.addEventListener('click', function () {
          var key = map[b.getAttribute('data-v')];
          var t = attendanceToday();
          t[s.id] = (t[s.id] === key) ? '' : key;
          if (!t[s.id]) delete t[s.id];
          save();
          renderAttendance();
        });
      });
      list.appendChild(row);
    });
    $('#att-p').textContent = p; $('#att-l').textContent = l; $('#att-a').textContent = a;
    if (!state.students.length) {
      list.innerHTML = '<div class="empty"><div class="big">👥</div><b>ضيف طلاب الأول</b><span>من صفحة الطلاب</span></div>';
    }
  }

  /* ---------------- homework ---------------- */
  function hwCard(hw) {
    var total = state.students.length || 1;
    var done = Object.keys(hw.done || {}).filter(function (k) { return hw.done[k]; }).length;
    var pct = Math.min(100, Math.round(done / total * 100));
    var el = document.createElement('div');
    el.className = 'hw';
    el.innerHTML = '<div class="hw-top"><div><h4>' + esc(hw.title) + '</h4>' +
      '<div class="due">' + esc(prettyDate(hw.due)) + ' · ' + esc(relDue(hw.due)) + '</div></div>' +
      '<span class="tag ' + (done >= total ? 'ok' : 'info') + '">' + done + '/' + total + '</span></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="foot"><span>اتسلّم ' + done + ' من ' + total + '</span><b>' + pct + '%</b></div>';
    el.addEventListener('click', function () { hwSheet(hw); });
    return el;
  }
  function renderHomework() {
    $('#hw-sub').textContent = state.homework.length + ' واجب';
    var list = $('#hw-list');
    list.innerHTML = '';
    if (!state.homework.length) {
      list.innerHTML = '<div class="empty"><div class="big">📚</div><b>مفيش واجبات</b><span>اضغط «واجب جديد» فوق</span></div>';
      return;
    }
    state.homework.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })
      .forEach(function (hw) { list.appendChild(hwCard(hw)); });
  }

  /* ---------------- sheet ---------------- */
  var sheetSave = null;
  function openSheet(title, f1, f2, onSave, vals) {
    $('#sheet-title').textContent = title;
    $('#f1-label').textContent = f1;
    $('#f2').parentNode.style.display = f2 ? '' : 'none';
    if (f2) $('#f2-label').textContent = f2;
    $('#f1').value = (vals && vals[0]) || '';
    $('#f2').value = (vals && vals[1]) || '';
    sheetSave = onSave;
    $('#sheet').classList.add('open');
    setTimeout(function () { try { $('#f1').focus(); } catch (e) {} }, 260);
  }
  function closeSheet() { $('#sheet').classList.remove('open'); sheetSave = null; }
  $('#sheet-cancel').addEventListener('click', closeSheet);
  $('#sheet').addEventListener('click', function (e) { if (e.target.id === 'sheet') closeSheet(); });
  $('#sheet-save').addEventListener('click', function () {
    var a = ($('#f1').value || '').trim(), b = ($('#f2').value || '').trim();
    if (!a) { toast('اكتب الاسم الأول'); return; }
    if (sheetSave) sheetSave(a, b);
    closeSheet();
  });
  $('#f1').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#f2').focus(); });

  function studentSheet(s) {
    openSheet('بيانات الطالب', 'الاسم', 'رقم التليفون', function (name, phone) {
      s.name = name; s.phone = phone; save(); renderStudents(); toast('اتحفظ');
    }, [s.name, s.phone || '']);
  }
  function hwSheet(hw) {
    openSheet('تعديل الواجب', 'اسم الواجب', 'الوصف', function (title, desc) {
      hw.title = title; hw.desc = desc; save(); renderHomework(); renderHome(); toast('اتحفظ');
    }, [hw.title, hw.desc || '']);
  }

  /* ---------------- actions ---------------- */
  $('#add-student').addEventListener('click', function () {
    openSheet('طالب جديد', 'اسم الطالب', 'رقم التليفون', function (name, phone) {
      state.students.push({ id: uid(), name: name, phone: phone, added: Date.now() });
      save(); renderStudents(); toast('اتضاف ' + name);
    }, ['', '']);
  });
  $('#stu-search').addEventListener('input', renderStudents);

  $('#att-all').addEventListener('click', function () {
    var t = attendanceToday();
    state.students.forEach(function (s) { t[s.id] = 'p'; });
    save(); renderAttendance(); toast('الكل حاضر ✓');
  });

  $('#new-hw').addEventListener('click', function () {
    openSheet('واجب جديد', 'عنوان الواجب', 'الوصف / الصفحات', function (title, desc) {
      state.homework.push({ id: uid(), title: title, desc: desc, due: todayISO(3), createdAt: Date.now(), done: {} });
      save(); renderHomework(); renderHome(); toast('الواجب اتضاف');
    }, ['', '']);
  });

  $('#note-send').addEventListener('click', function () {
    var t = ($('#note-text').value || '').trim();
    if (!t) { toast('اكتب الإعلان الأول'); return; }
    state.board.unshift({ id: uid(), text: t, at: Date.now() });
    $('#note-text').value = '';
    save(); toast('الإعلان اتحفظ في لوحة الفصل');
  });

  /* ---------------- back button (android bridge) ---------------- */
  window.ZBack = function () {
    if ($('#sheet').classList.contains('open')) { closeSheet(); return true; }
    if (current !== 'home') { show('home'); return true; }
    return false;
  };

  /* ---------------- boot ---------------- */
  seed();
  save();
  if (new Date().getHours() < 4) { /* لا شيء */ }
  renderHome();
  window.Z = { state: state, show: show, save: save, toast: toast };
})();
