/* ============================================================
   Z-Project Workplace — v0.2
   الواجهة كلها بتتكلم مع سيرفر الفصل عبر /api (نفس الأصل).
   التوكن محفوظ في localStorage بمفتاح zwork.tok
   ============================================================ */
(function () {
  'use strict';

  var TOK = 'zwork.tok';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------- صغيرات ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/);
    return (p[0] || '؟').charAt(0) + (p[1] ? p[1].charAt(0) : '');
  }
  var AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  function relTime(ms) {
    if (!ms) return '';
    var d = Math.floor((Date.now() - ms) / 1000);
    if (d < 60) return 'دلوقتي';
    if (d < 3600) return Math.floor(d / 60) + ' دقيقة';
    if (d < 86400) return Math.floor(d / 3600) + ' ساعة';
    if (d < 604800) return Math.floor(d / 86400) + ' يوم';
    var t = new Date(ms);
    return t.getDate() + ' ' + AR_MONTHS[t.getMonth()];
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function digitsOnly(el) {
    el.addEventListener('input', function () {
      var v = el.value.replace(/\D/g, '').slice(0, 9);
      if (v !== el.value) el.value = v;
    });
  }

  /* ---------------- الحالة ---------------- */
  var state = {
    role: null,        // 'student' | 'teacher'
    user: null,
    classes: [],
    tab: 'requests',
    busy: false
  };
  function token() { try { return localStorage.getItem(TOK) || ''; } catch (e) { return ''; } }
  function setToken(t) {
    try { if (t) localStorage.setItem(TOK, t); else localStorage.removeItem(TOK); } catch (e) {}
  }

  /* ---------------- الشبكة ---------------- */
  // المتصفح بيضرب نفس الأصل (/api). تطبيق الأندرويد بيحقن window.ZAPI بعنوان سيرفر الفصل.
  function apiBase() {
    var b = (typeof window !== 'undefined' && window.ZAPI) ? String(window.ZAPI) : '';
    return b.replace(/\/+$/, '');
  }
  function api(method, path, body) {
    var opt = { method: method, headers: {} };
    var t = token();
    if (t) opt.headers.Authorization = 'Bearer ' + t;
    if (method !== 'GET' && body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    return fetch(apiBase() + path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var e = new Error(j.error || 'حصل خطأ (' + r.status + ')');
          e.status = r.status;
          throw e;
        }
        return j;
      });
    }, function () {
      var e = new Error('مفيش اتصال بالسيرفر — اتأكد من الإنترنت');
      e.status = 0;
      throw e;
    });
  }
  function online(on) {
    var b = $('#net-badge');
    if (b) b.classList.toggle('hidden', on);
  }
  window.addEventListener('online', function () { online(true); });
  window.addEventListener('offline', function () { online(false); });
  online(navigator.onLine !== false);

  /* ---------------- التنقل ---------------- */
  var history = [];
  function show(name) {
    $$('.screen').forEach(function (s) { s.classList.remove('active'); });
    var el = $('#screen-' + name);
    if (el) {
      el.classList.add('active');
      var sc = el.querySelector('.scroller');
      if (sc) sc.scrollTop = 0;
    }
    history.push(name);
    return el;
  }
  function go(name) {
    if (name === 'entry') history = [];
    if (name === 'signup') resetSignup();
    if (name === 'recover') {
      $('#rc-step2').classList.add('hidden');
      err($('#rc-err1'), ''); err($('#rc-err2'), '');
    }
    if (name === 'login') { err($('#login-err'), ''); }
    show(name);
  }
  function back() {
    if (history.length > 1) {
      history.pop();
      var prev = history.pop();
      show(prev);
    } else {
      show('entry');
    }
    return history.length > 0 && history[history.length - 1] !== 'entry';
  }
  // زر الرجوع في الأندرويد
  window.ZBack = function () {
    var open = $('#sheet');
    if (open && open.classList.contains('open')) { closeSheet(); return true; }
    var cur = history[history.length - 1] || 'entry';
    if (cur === 'entry') return false;
    back();
    return true;
  };

  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-go]');
    if (g) { go(g.getAttribute('data-go')); return; }
    var b = e.target.closest('[data-back]');
    if (b) { back(); return; }
  });

  /* ---------------- الحوار ---------------- */
  function openSheet(title, html) {
    $('#sheet-title').textContent = title;
    $('#sheet-body').innerHTML = html;
    $('#sheet').classList.add('open');
  }
  function closeSheet() { $('#sheet').classList.remove('open'); }
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet').addEventListener('click', function (e) {
    if (e.target === $('#sheet')) closeSheet();
  });

  function err(el, msg) { if (el) el.textContent = msg || ''; }
  function btnBusy(btn, on, label) {
    if (!btn) return;
    btn.disabled = !!on;
    btn.style.opacity = on ? '.65' : '';
    if (on) { btn.dataset.lbl = btn.innerHTML; btn.textContent = label || 'لحظة…'; }
    else if (btn.dataset.lbl) btn.innerHTML = btn.dataset.lbl;
  }

  /* ============================================================
     1) الدخول
     ============================================================ */
  digitsOnly($('#login-seat'));
  $('#login-btn').addEventListener('click', function () {
    var btn = this;
    var seat = $('#login-seat').value.trim();
    var pass = $('#login-pass').value;
    err($('#login-err'), '');
    if (!/^\d{9}$/.test(seat)) return err($('#login-err'), 'رقم الجلوس لازم 9 أرقام');
    if (!pass) return err($('#login-err'), 'اكتب كلمة المرور');
    btnBusy(btn, true);
    api('POST', '/api/login', { seat: seat, password: pass })
      .then(function (r) {
        setToken(r.token);
        state.role = r.user.role;
        state.user = r.user;
        if (r.user.role === 'teacher') return enterTeacher(r.user);
        enterStudent(r.user);
      })
      .catch(function (e) { err($('#login-err'), e.message); })
      .then(function () { btnBusy(btn, false); });
  });
  $('#login-pass').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('#login-btn').click();
  });

  /* ============================================================
     2) إنشاء حساب
     ============================================================ */
  digitsOnly($('#su-seat'));
  var suSeat = '';
  $('#su-next').addEventListener('click', function () {
    var btn = this;
    var seat = $('#su-seat').value.trim();
    err($('#su-err1'), '');
    if (!/^\d{9}$/.test(seat)) return err($('#su-err1'), 'رقم الجلوس لازم 9 أرقام');
    btnBusy(btn, true);
    api('POST', '/api/lookup', { seat: seat })
      .then(function (r) {
        if (r.hasAccount) {
          err($('#su-err1'), 'الرقم ده عنده حساب بالفعل — سجّل الدخول');
          return;
        }
        if (r.status === 'pending') {
          err($('#su-err1'), 'عندك طلب مستني موافقة المدرس');
          return;
        }
        if (r.status === 'rejected') {
          err($('#su-err1'), 'طلبك السابق اترفض — كلّم المدرس');
          return;
        }
        suSeat = seat;
        $('#su-name').textContent = r.name;
        $('#su-seat-view').textContent = seat;
        $('#su-avatar').textContent = initials(r.name);
        $('#signup-step1').classList.add('hidden');
        $('#signup-step2').classList.remove('hidden');
        $('#signup-step-label').textContent = 'الخطوة 2 من 2';
        $('.scroller', $('#screen-signup')).scrollTop = 0;
      })
      .catch(function (e) {
        err($('#su-err1'), e.status === 404 ? 'رقم الجلوس مش موجود في كشف الفصل — راجع المدرس' : e.message);
      })
      .then(function () { btnBusy(btn, false); });
  });
  $('#su-seat').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('#su-next').click();
  });

  $('#su-submit').addEventListener('click', function () {
    var btn = this;
    var p1 = $('#su-pass').value, p2 = $('#su-pass2').value;
    var q = $('#su-q').value.trim(), a = $('#su-a').value.trim();
    err($('#su-err2'), '');
    if (p1.length < 6) return err($('#su-err2'), 'كلمة المرور لازم 6 حروف على الأقل');
    if (p1 !== p2) return err($('#su-err2'), 'كلمتين المرور مش زي بعض');
    if (q.length < 4) return err($('#su-err2'), 'اكتب سؤال سري واضح');
    if (a.length < 3) return err($('#su-err2'), 'اكتب إجابة السؤال السري');
    btnBusy(btn, true);
    api('POST', '/api/request', { seat: suSeat, password: p1, secretQ: q, secretA: a })
      .then(function (r) {
        $('#pending-name').textContent = r.name || $('#su-name').textContent;
        $('#pending-seat').textContent = suSeat;
        $('#su-pass').value = ''; $('#su-pass2').value = '';
        $('#su-q').value = ''; $('#su-a').value = '';
        show('pending');
      })
      .catch(function (e) { err($('#su-err2'), e.message); })
      .then(function () { btnBusy(btn, false); });
  });

  function resetSignup() {
    $('#signup-step1').classList.remove('hidden');
    $('#signup-step2').classList.add('hidden');
    $('#signup-step-label').textContent = 'الخطوة 1 من 2';
    err($('#su-err1'), ''); err($('#su-err2'), '');
  }

  $('#pending-check').addEventListener('click', function () {
    var btn = this;
    btnBusy(btn, true);
    api('POST', '/api/lookup', { seat: $('#pending-seat').textContent })
      .then(function (r) {
        if (r.hasAccount) {
          toast('حسابك اتفعّل 🎉 سجّل الدخول');
          go('login');
          $('#login-seat').value = $('#pending-seat').textContent;
          $('#login-pass').focus();
        } else if (r.status === 'rejected') {
          toast('طلبك اترفض — كلّم المدرس');
        } else {
          toast('لسه مستني موافقة المدرس');
        }
      })
      .catch(function (e) { toast(e.message); })
      .then(function () { btnBusy(btn, false); });
  });

  /* ============================================================
     3) استرجاع كلمة المرور
     ============================================================ */
  digitsOnly($('#rc-seat'));
  var rcSeat = '';
  $('#rc-next').addEventListener('click', function () {
    var btn = this;
    var seat = $('#rc-seat').value.trim();
    err($('#rc-err1'), '');
    if (!/^\d{9}$/.test(seat)) return err($('#rc-err1'), 'رقم الجلوس لازم 9 أرقام');
    btnBusy(btn, true);
    api('POST', '/api/recover/question', { seat: seat })
      .then(function (r) {
        rcSeat = seat;
        $('#rc-question').textContent = r.question;
        $('#rc-step2').classList.remove('hidden');
      })
      .catch(function (e) { err($('#rc-err1'), e.message); })
      .then(function () { btnBusy(btn, false); });
  });
  $('#rc-submit').addEventListener('click', function () {
    var btn = this;
    var ans = $('#rc-answer').value.trim();
    var np = $('#rc-pass').value;
    err($('#rc-err2'), '');
    if (!ans) return err($('#rc-err2'), 'اكتب الإجابة');
    if (np.length < 6) return err($('#rc-err2'), 'كلمة المرور لازم 6 حروف على الأقل');
    btnBusy(btn, true);
    api('POST', '/api/recover/reset', { seat: rcSeat, answer: ans, password: np })
      .then(function () {
        toast('اتغيّرت ✅ سجّل الدخول بكلمة المرور الجديدة');
        $('#rc-answer').value = ''; $('#rc-pass').value = '';
        $('#rc-step2').classList.add('hidden');
        $('#login-seat').value = rcSeat;
        go('login');
      })
      .catch(function (e) { err($('#rc-err2'), e.status === 401 ? 'الإجابة غلط' : e.message); })
      .then(function () { btnBusy(btn, false); });
  });

  /* ============================================================
     4) الطالب
     ============================================================ */
  function enterStudent(u) {
    state.role = 'student';
    state.user = u;
    $('#st-greet').textContent = 'أهلاً يا ' + (u.name || '').split(' ')[0] + ' 👋';
    $('#st-sub').textContent = u.className ? ('فصل ' + u.className + (u.groupName ? ' — ' + u.groupName : '')) : 'حسابك مفعّل';
    $('#st-avatar').textContent = initials(u.name);
    $('#st-seat').textContent = u.seat || '—';
    $('#st-group').textContent = u.groupName || '—';
    $('#st-class-tag').textContent = u.className ? ('فصل ' + u.className) : 'مفعّل';
    show('student');
  }
  $('#st-logout').addEventListener('click', doLogout);

  /* ============================================================
     5) المدرس
     ============================================================ */
  $('#tl-btn').addEventListener('click', function () {
    var btn = this;
    err($('#tl-err'), '');
    var email = $('#tl-email').value.trim();
    var pass = $('#tl-pass').value;
    if (!email || !pass) return err($('#tl-err'), 'اكتب البريد وكلمة المرور');
    btnBusy(btn, true);
    api('POST', '/api/teacher/login', { email: email, password: pass })
      .then(function (r) { setToken(r.token); enterTeacher(r.user); })
      .catch(function (e) { err($('#tl-err'), e.message); })
      .then(function () { btnBusy(btn, false); });
  });
  $('#tl-pass').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('#tl-btn').click();
  });

  function enterTeacher(u) {
    state.role = 'teacher';
    state.user = u;
    $('#th-name').textContent = u.name || 'لوحة المدرس';
    $('#th-sub').textContent = 'مستر جاسر — ورك سبيس الفصل';
    show('teacher');
    switchTab('requests');
    loadStats();
    loadRequests();
    loadClasses();
  }
  $('#th-logout').addEventListener('click', doLogout);

  $$('#dash-tabs button').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
  });
  function switchTab(tab) {
    state.tab = tab;
    $$('#dash-tabs button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === tab);
    });
    $$('.tabpane').forEach(function (p) {
      p.classList.toggle('hidden', p.id !== 'tab-' + tab);
    });
    if (tab === 'roster') loadRoster();
    if (tab === 'classes') loadClasses();
    if (tab === 'students') loadStudents();
    if (tab === 'requests') loadRequests();
    var sc = $('.scroller', $('#screen-teacher'));
    if (sc) sc.scrollTop = 0;
  }

  function loadStats() {
    return api('GET', '/api/teacher/stats').then(function (s) {
      $('#stat-roster').textContent = s.roster;
      $('#stat-pending').textContent = s.pending;
      $('#stat-students').textContent = s.students;
      var b = $('#badge-req');
      if (s.pending > 0) { b.textContent = s.pending; b.classList.remove('hidden'); }
      else b.classList.add('hidden');
    }).catch(function () {});
  }

  /* ---------- الطلبات ---------- */
  function loadRequests() {
    var list = $('#req-list');
    return api('GET', '/api/teacher/requests')
      .then(function (r) {
        if (!r.rows.length) {
          list.innerHTML = '<div class="empty"><div class="big">✅</div><b>مفيش طلبات مستنية</b>' +
            '<span>أي طالب يعمل حساب هيظهر هنا لحد ما توافق عليه.</span></div>';
          return;
        }
        list.innerHTML = r.rows.map(function (q) {
          return '<div class="req" data-req="' + esc(q.id) + '">' +
            '<div class="req-top">' +
              '<div class="req-av">' + esc(initials(q.full_name)) + '</div>' +
              '<div class="req-main"><b>' + esc(q.full_name) + '</b>' +
                '<span>رقم الجلوس ' + esc(q.seat_id) + '</span></div>' +
              '<div class="req-time">' + esc(relTime(q.created_at)) + '</div>' +
            '</div>' +
            '<div class="req-actions">' +
              '<button class="btn btn-primary" data-approve="' + esc(q.id) + '">قبول وتحديد الفصل</button>' +
              '<button class="btn btn-danger" data-reject="' + esc(q.id) + '">رفض</button>' +
            '</div></div>';
        }).join('');
      })
      .catch(function (e) {
        list.innerHTML = '<div class="empty"><span>' + esc(e.message) + '</span></div>';
      });
  }
  $('#req-refresh').addEventListener('click', function () { loadRequests(); loadStats(); });

  $('#req-list').addEventListener('click', function (e) {
    var ap = e.target.closest('[data-approve]');
    if (ap) return openApprove(ap.getAttribute('data-approve'));
    var rj = e.target.closest('[data-reject]');
    if (rj) return rejectRequest(rj.getAttribute('data-reject'));
  });

  function openApprove(reqId) {
    var card = $('[data-req="' + reqId + '"]');
    var name = card ? $('.req-main b', card).textContent : '';
    loadClasses().then(function () {
      var body = '<p class="form-note">' + esc(name) + ' — لازم تحدد الفصل والمجموعة قبل القبول.</p>';
      if (!state.classes.length) {
        body += '<div class="empty"><b>مفيش فصول لسه</b><span>اعمل فصل الأول من تبويب «الفصول».</span></div>' +
          '<button class="btn btn-primary" id="ap-create">اعمل فصل دلوقتي</button>';
        openSheet('قبول طالب', body);
        $('#ap-create').addEventListener('click', function () { closeSheet(); switchTab('classes'); openNewClass(); });
        return;
      }
      body += '<p class="sheet-sub">الفصل</p><div id="ap-classes">' +
        state.classes.map(function (c) {
          return '<div class="pick" data-c="' + esc(c.id) + '"><span class="nm">فصل ' + esc(c.name) + '</span>' +
            '<span class="cap">' + c.groups.length + ' مجموعات</span><span class="rd"></span></div>';
        }).join('') + '</div>' +
        '<div id="ap-groups-wrap" class="hidden"><p class="sheet-sub">المجموعة</p><div id="ap-groups"></div></div>' +
        '<p class="form-err" id="ap-err"></p>' +
        '<button class="btn btn-primary" id="ap-do" disabled style="opacity:.5">قبول الطالب</button>';
      openSheet('قبول طالب', body);

      var chosenClass = null, chosenGroup = null;
      function syncBtn() {
        var b = $('#ap-do');
        var ok = chosenClass && chosenGroup;
        b.disabled = !ok;
        b.style.opacity = ok ? '' : '.5';
      }
      $('#ap-classes').addEventListener('click', function (ev) {
        var p = ev.target.closest('[data-c]');
        if (!p) return;
        chosenClass = p.getAttribute('data-c');
        chosenGroup = null;
        $$('#ap-classes .pick').forEach(function (x) { x.classList.toggle('on', x === p); });
        var cls = state.classes.filter(function (c) { return c.id === chosenClass; })[0];
        var wrap = $('#ap-groups-wrap');
        var box = $('#ap-groups');
        wrap.classList.remove('hidden');
        if (!cls.groups.length) {
          box.innerHTML = '<div class="empty"><span>الفصل ده مفيهوش مجموعات — اعمل مجموعة الأول.</span></div>';
        } else {
          box.innerHTML = cls.groups.map(function (g) {
            var full = g.filled >= g.capacity;
            return '<div class="pick' + (full ? ' dis' : '') + '" data-g="' + esc(g.id) + '">' +
              '<span class="nm">' + esc(g.name) + '</span>' +
              '<span class="cap">' + g.filled + '/' + g.capacity + (full ? ' — كاملة' : '') + '</span>' +
              '<span class="rd"></span></div>';
          }).join('');
        }
        syncBtn();
      });
      $('#ap-groups').addEventListener('click', function (ev) {
        var p = ev.target.closest('[data-g]');
        if (!p || p.classList.contains('dis')) return;
        chosenGroup = p.getAttribute('data-g');
        $$('#ap-groups .pick').forEach(function (x) { x.classList.toggle('on', x === p); });
        syncBtn();
      });
      $('#ap-do').addEventListener('click', function () {
        var b = this;
        err($('#ap-err'), '');
        btnBusy(b, true);
        api('POST', '/api/teacher/requests/' + reqId + '/approve', { classId: chosenClass, groupId: chosenGroup })
          .then(function () {
            closeSheet();
            toast('اتقبل ✅ وحطينا في ' + $('#ap-classes .pick.on .nm').textContent);
            loadRequests(); loadStats();
          })
          .catch(function (e) { err($('#ap-err'), e.message); })
          .then(function () { btnBusy(b, false); });
      });
    });
  }

  function rejectRequest(reqId) {
    openSheet('رفض طلب', '<p class="form-note">الطالب مش هيقدر يدخل، وممكن يرجع يبعت طلب تاني بعد ما تكلمه.</p>' +
      '<p class="form-err" id="rj-err"></p>' +
      '<div class="sheet-actions"><button class="btn btn-ghost" id="rj-no">إلغاء</button>' +
      '<button class="btn btn-danger" id="rj-yes">رفض الطلب</button></div>');
    $('#rj-no').addEventListener('click', closeSheet);
    $('#rj-yes').addEventListener('click', function () {
      var b = this;
      btnBusy(b, true);
      api('POST', '/api/teacher/requests/' + reqId + '/reject', {})
        .then(function () { closeSheet(); toast('اترفض'); loadRequests(); loadStats(); })
        .catch(function (e) { err($('#rj-err'), e.message); })
        .then(function () { btnBusy(b, false); });
    });
  }

  /* ---------- الكشف ---------- */
  var rosterTimer;
  function loadRoster() {
    clearTimeout(rosterTimer);
    rosterTimer = setTimeout(function () {
      var q = $('#roster-q').value.trim();
      api('GET', '/api/teacher/roster' + (q ? '?q=' + encodeURIComponent(q) : ''))
        .then(function (r) {
          var list = $('#roster-list');
          if (!r.rows.length) {
            list.innerHTML = '<div class="empty"><div class="big">📋</div><b>مفيش طلاب في الكشف</b>' +
              '<span>حمّل كشف الفصل بصيغة CSV أو الصق الأسماء.</span></div>' +
              '<button class="btn btn-gold" id="roster-import2">تحميل كشف</button>';
            var b = $('#roster-import2');
            if (b) b.addEventListener('click', openImport);
            return;
          }
          list.innerHTML = r.rows.map(function (s) {
            return '<div class="list-row">' +
              '<div class="chip-mini">' + esc(s.grade || '—') + '</div>' +
              '<div style="flex:1;min-width:0"><div class="name">' + esc(s.full_name) + '</div>' +
              '<div class="meta">' + esc(s.seat_id) + (s.phone ? ' — ' + esc(s.phone) : '') + '</div></div>' +
              '</div>';
          }).join('');
        })
        .catch(function (e) {
          $('#roster-list').innerHTML = '<div class="empty"><span>' + esc(e.message) + '</span></div>';
        });
    }, 180);
  }
  $('#roster-q').addEventListener('input', function () { loadRoster(); });
  $('#roster-import').addEventListener('click', openImport);

  function openImport() {
    openSheet('تحميل كشف الطلاب',
      '<p class="form-note">الأعمدة بالترتيب: <b>رقم الجلوس، الاسم، الرقم القومي، الموبايل، ولي الأمر، الصف</b><br>' +
      'الملف CSV أو الصق السطور هنا.</p>' +
      '<div class="field"><label for="imp-csv">سطور الكشف</label>' +
      '<textarea id="imp-csv" placeholder="100000001,أحمد محمد علي,30001011234567,01001234567,محمد علي,3"></textarea></div>' +
      '<div class="field"><label for="imp-file">أو اختار ملف CSV</label>' +
      '<input id="imp-file" type="file" accept=".csv,text/csv,text/plain"></div>' +
      '<p class="form-err" id="imp-err"></p>' +
      '<button class="btn btn-primary" id="imp-go">تحميل الكشف</button>');

    $('#imp-file').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { $('#imp-csv').value = String(fr.result || ''); };
      fr.readAsText(f, 'utf-8');
    });

    $('#imp-go').addEventListener('click', function () {
      var b = this;
      var csv = $('#imp-csv').value.trim();
      err($('#imp-err'), '');
      if (!csv) return err($('#imp-err'), 'الصق سطور الكشف أو اختار ملف');
      btnBusy(b, true);
      api('POST', '/api/teacher/roster', { csv: csv })
        .then(function (r) {
          closeSheet();
          toast('اتحمّل ' + r.ok + ' طالب' + (r.skipped ? ' — و' + r.skipped + ' سطر مرفوض' : ''));
          loadStats(); loadRoster();
        })
        .catch(function (e) { err($('#imp-err'), e.message); })
        .then(function () { btnBusy(b, false); });
    });
  }

  /* ---------- الفصول ---------- */
  function loadClasses() {
    return api('GET', '/api/teacher/classes')
      .then(function (r) {
        state.classes = r.classes;
        var list = $('#class-list');
        if (!r.classes.length) {
          list.innerHTML = '<div class="empty"><div class="big">🏫</div><b>مفيش فصول</b>' +
            '<span>اعمل فصل، وبعده مجموعات، عشان تقدر تقبل الطلبات.</span></div>' +
            '<button class="btn btn-gold" id="class-add2">+ فصل جديد</button>';
          var b = $('#class-add2');
          if (b) b.addEventListener('click', openNewClass);
          return;
        }
        list.innerHTML = r.classes.map(function (c) {
          return '<div class="card"><div class="card-row" style="margin-bottom:10px">' +
            '<div class="card-ico ci-blue"><svg viewBox="0 0 24 24"><path d="M4 10l8-5 8 5-8 5-8-5z"/><path d="M7 12v4c0 1.7 2.2 3 5 3s5-1.3 5-3v-4"/></svg></div>' +
            '<div class="card-body"><b>فصل ' + esc(c.name) + '</b><span>' + c.groups.length + ' مجموعات</span></div>' +
            '<button class="btn btn-ghost sm" style="width:auto;padding:0 13px" data-addg="' + esc(c.id) + '">+ مجموعة</button>' +
            '</div>' +
            (c.groups.length ? c.groups.map(function (g) {
              var full = g.filled >= g.capacity;
              var pct = Math.min(100, Math.round(g.filled / g.capacity * 100));
              return '<div class="grp' + (full ? ' full' : '') + '">' +
                '<div style="flex:1"><div class="nm">' + esc(g.name) + '</div>' +
                '<div class="bar-mini"><i style="width:' + pct + '%"></i></div></div>' +
                '<span class="cap">' + g.filled + '/' + g.capacity + '</span></div>';
            }).join('') : '<div class="meta" style="font-size:11.5px;color:var(--ink-3);font-weight:600">مفيش مجموعات لسه</div>') +
            '</div>';
        }).join('');
      })
      .catch(function (e) {
        $('#class-list').innerHTML = '<div class="empty"><span>' + esc(e.message) + '</span></div>';
      });
  }
  $('#class-add').addEventListener('click', openNewClass);
  $('#class-list').addEventListener('click', function (e) {
    var a = e.target.closest('[data-addg]');
    if (a) openNewGroup(a.getAttribute('data-addg'));
  });

  function openNewClass() {
    openSheet('فصل جديد',
      '<div class="field"><label for="nc-name">اسم الفصل</label>' +
      '<input id="nc-name" placeholder="مثال: 3/2"></div>' +
      '<p class="form-err" id="nc-err"></p>' +
      '<button class="btn btn-primary" id="nc-go">إضافة الفصل</button>');
    $('#nc-go').addEventListener('click', function () {
      var b = this;
      var name = $('#nc-name').value.trim();
      err($('#nc-err'), '');
      if (name.length < 1) return err($('#nc-err'), 'اكتب اسم الفصل');
      btnBusy(b, true);
      api('POST', '/api/teacher/classes', { name: name })
        .then(function () { closeSheet(); toast('اتضاف الفصل'); loadClasses(); loadStats(); })
        .catch(function (e) { err($('#nc-err'), e.message); })
        .then(function () { btnBusy(b, false); });
    });
  }

  function openNewGroup(classId) {
    openSheet('مجموعة جديدة',
      '<div class="field"><label for="ng-name">اسم المجموعة</label>' +
      '<input id="ng-name" placeholder="مثال: مجموعة أ"></div>' +
      '<div class="field"><label for="ng-cap">عدد الأفراد (10 كحد أقصى)</label>' +
      '<input id="ng-cap" inputmode="numeric" value="5"></div>' +
      '<p class="form-err" id="ng-err"></p>' +
      '<button class="btn btn-primary" id="ng-go">إضافة المجموعة</button>');
    $('#ng-go').addEventListener('click', function () {
      var b = this;
      var name = $('#ng-name').value.trim();
      var cap = parseInt($('#ng-cap').value, 10) || 5;
      err($('#ng-err'), '');
      if (!name) return err($('#ng-err'), 'اكتب اسم المجموعة');
      btnBusy(b, true);
      api('POST', '/api/teacher/classes/' + classId + '/groups', { name: name, capacity: cap })
        .then(function () { closeSheet(); toast('اتضافت المجموعة'); loadClasses(); })
        .catch(function (e) { err($('#ng-err'), e.message); })
        .then(function () { btnBusy(b, false); });
    });
  }

  /* ---------- الطلاب ---------- */
  function loadStudents() {
    api('GET', '/api/teacher/students')
      .then(function (r) {
        var list = $('#students-list');
        if (!r.rows.length) {
          list.innerHTML = '<div class="empty"><div class="big">👥</div><b>مفيش طلاب مفعّلين</b>' +
            '<span>لازم تقبل طلبات الأول.</span></div>';
          return;
        }
        list.innerHTML = r.rows.map(function (s) {
          return '<div class="stu">' +
            '<div class="av">' + esc(initials(s.full_name)) + '</div>' +
            '<div class="in"><b>' + esc(s.full_name) + '</b>' +
            '<span>' + esc(s.seat_id) + ' · ' + esc(s.class_name || '—') + ' · ' + esc(s.group_name || '—') + '</span></div>' +
            '<span class="tag ok">مفعّل</span></div>';
        }).join('');
      })
      .catch(function (e) {
        $('#students-list').innerHTML = '<div class="empty"><span>' + esc(e.message) + '</span></div>';
      });
  }
  $('#students-refresh').addEventListener('click', loadStudents);

  /* ============================================================
     6) خروج + استئناف الجلسة
     ============================================================ */
  function doLogout() {
    api('POST', '/api/logout', {}).catch(function () {});
    setToken('');
    state.role = null; state.user = null;
    resetSignup();
    $('#login-seat').value = ''; $('#login-pass').value = '';
    history = [];
    show('entry');
  }

  function resume() {
    if (!token()) { show('entry'); return; }
    api('GET', '/api/me')
      .then(function (r) {
        state.role = r.role;
        if (r.role === 'teacher') {
          $('#th-name').textContent = r.user.name || 'لوحة المدرس';
          enterTeacher(r.user);
        } else {
          enterStudent(r.user);
        }
      })
      .catch(function () { setToken(''); show('entry'); });
  }

  /* ---------------- تشغيل ---------------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', resume);
  } else {
    resume();
  }

  // للتجربة/الاختبار
  window.__z = { state: state, api: api, show: show, enterStudent: enterStudent, enterTeacher: enterTeacher };
})();
