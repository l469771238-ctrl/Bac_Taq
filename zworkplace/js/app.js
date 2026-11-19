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
  var K_LAST = 'zwork.last';

  /** الكود زي ما الطالب كتبه، من غير مسافات */
  function codeOf(el) { return String(el.value || '').trim().replace(/\s+/g, ''); }
  /** آخر كود دخل بيه — بنحطه جاهز عشان مايكتبهوش كل مرة */
  function rememberLast(code) {
    try { if (code) localStorage.setItem(K_LAST, code); } catch (e) {}
  }
  function lastCode() {
    try { return localStorage.getItem(K_LAST) || ''; } catch (e) { return ''; }
  }
  /** الكود بيتكتب بحروف إنجليزي كبيرة تلقائيًا (الأرقام زي ما هي) */
  function upperCode(el) {
    el.addEventListener('input', function () {
      var at = el.selectionStart, v = el.value;
      var up = v.replace(/[A-Za-z]/g, function (ch) { return ch.toUpperCase(); });
      if (up !== v) { el.value = up; try { el.setSelectionRange(at, at); } catch (e) {} }
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
  upperCode($('#code-login'));
  $('#login-btn').addEventListener('click', function () {
    var btn = this;
    var code = codeOf($('#code-login'));
    var pass = $('#login-pass').value;
    err($('#login-err'), '');
    if (!code) return err($('#login-err'), 'اكتب كودك');
    if (!pass) return err($('#login-err'), 'اكتب كلمة المرور');
    btnBusy(btn, true);
    api('POST', '/api/login', { code: code, password: pass })
      .then(function (r) {
        setToken(r.token);
        rememberLast(r.user.code);
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
  $('#code-login').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('#login-pass').focus();
  });

  /* ============================================================
     2) إنشاء حساب
     ============================================================ */
  upperCode($('#code-signup'));
  var suCode = '';
  $('#su-next').addEventListener('click', function () {
    var btn = this;
    var code = codeOf($('#code-signup'));
    err($('#su-err1'), '');
    if (!code) return err($('#su-err1'), 'اكتب كودك');
    btnBusy(btn, true);
    api('POST', '/api/lookup', { code: code })
      .then(function (r) {
        if (r.status === 'pending') {
          err($('#su-err1'), 'تسجيلك مستني — استنى المدرس يراجعه');
          return;
        }
        if (r.status === 'rejected') {
          err($('#su-err1'), 'تسجيلك السابق اترفض — كلّم المدرس');
          return;
        }
        suCode = code;
        state.pendingName = r.name;
        $('#su-name').textContent = r.name;
        $('#su-code-view').textContent = code;
        $('#su-avatar').textContent = initials(r.name);
        $('#signup-step1').classList.add('hidden');
        $('#signup-step2').classList.remove('hidden');
        $('#signup-step-label').textContent = 'الخطوة 2 من 2';
        $('#su-btn-label').textContent = r.hasAccount ? 'ادخل على حسابي' : 'سجّل وابدأ';
        $('.scroller', $('#screen-signup')).scrollTop = 0;
      })
      .catch(function (e) {
        err($('#su-err1'), e.status === 404 ? 'الكود ده مش موجود — راجع الكود اللي معاك أو كلّم المدرس' : e.message);
      })
      .then(function () { btnBusy(btn, false); });
  });
  $('#code-signup').addEventListener('keydown', function (e) {
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
    api('POST', '/api/register', { code: suCode, password: p1, secretQ: q, secretA: a })
      .then(function (r) {
        $('#su-pass').value = ''; $('#su-pass2').value = '';
        $('#su-q').value = ''; $('#su-a').value = '';
        // التسجيل اتحفظ وجات جلسة -> فتح الحساب على طول
        if (r.token && r.status === 'active') {
          setToken(r.token);
          state.role = 'student';
          state.user = r.user;
          rememberLast(r.user.code);
          toast('تسجيلك اتحفظ ✅');
          return enterStudent(r.user);
        }
        // محتاج مراجعة
        state.pendingCode = suCode;
        $('#pending-title').textContent = 'تسجيلك اتحفظ';
        $('#pending-name').textContent = (r.user && r.user.name) || $('#su-name').textContent;
        $('#pending-code').textContent = suCode;
        $('#pending-txt').textContent = 'التسجيل محفوظ ومستني مراجعة المدرس. أول ما يراجعه تقدر تدخل بكودك.';
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
    api('POST', '/api/lookup', { code: state.pendingCode || $('#pending-code').textContent })
      .then(function (r) {
        if (r.status === 'active') {
          toast('تسجيلك اتفعّل 🎉');
          go('login');
          $('#code-login').value = r.code;
          $('#login-pass').focus();
        } else if (r.status === 'rejected') {
          toast('تسجيلك اترفض — كلّم المدرس');
        } else if (r.hasAccount) {
          toast('لسه مستني مراجعة المدرس');
        } else {
          toast('مفيش حساب بالكود ده لسه');
        }
      })
      .catch(function (e) { toast(e.message); })
      .then(function () { btnBusy(btn, false); });
  });

  /* ============================================================
     3) استرجاع كلمة المرور
     ============================================================ */
  upperCode($('#code-recover'));
  var rcCode = '';
  $('#rc-next').addEventListener('click', function () {
    var btn = this;
    var code = codeOf($('#code-recover'));
    err($('#rc-err1'), '');
    if (!code) return err($('#rc-err1'), 'اكتب كودك');
    btnBusy(btn, true);
    api('POST', '/api/recover/question', { code: code })
      .then(function (r) {
        rcCode = code;
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
    api('POST', '/api/recover/reset', { code: rcCode, answer: ans, password: np })
      .then(function () {
        toast('اتغيّرت ✅ سجّل الدخول بكلمة المرور الجديدة');
        $('#rc-answer').value = ''; $('#rc-pass').value = '';
        $('#rc-step2').classList.add('hidden');
        $('#code-login').value = rcCode;
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
    $('#st-code').textContent = u.code || '—';
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
    loadSettings().then(function () { switchTab('requests'); });
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
      $('#stat-students').textContent = s.registered;
      var b = $('#badge-req');
      if (s.pending > 0) { b.textContent = s.pending; b.classList.remove('hidden'); }
      else b.classList.add('hidden');
    }).catch(function () {});
  }

  /* ---------- الطلبات ---------- */
  var approvalOn = false;
  function approvalBtnLabel() {
    return approvalOn ? '⏸ اقفل مراجعة التسجيلات (يبقى فوري)' : '🔒 فعّل مراجعة التسجيلات';
  }
  function loadSettings() {
    return api('GET', '/api/teacher/settings').then(function (r) {
      approvalOn = !!r.approvalRequired;
    }).catch(function () {});
  }
  function toggleApproval() {
    return api('POST', '/api/teacher/settings', { approvalRequired: !approvalOn })
      .then(function (r) {
        approvalOn = !!r.approvalRequired;
        toast(approvalOn ? 'المراجعة اتفعّلت — التسجيلات الجديدة هتستنى' : 'المراجعة اتقفلت — التسجيل فوري');
        loadRequests();
      })
      .catch(function (e) { toast(e.message); });
  }

  function loadRequests() {
    var list = $('#req-list');
    return api('GET', '/api/teacher/requests')
      .then(function (r) {
        if (!r.rows.length) {
          list.innerHTML = '<div class="empty"><div class="big">✅</div><b>مفيش تسجيلات مستنية</b>' +
            '<span>التسجيل شغال فوري — الطالب بيدخل على طول بعد ما يكتب كوده.<br>' +
            'لو عايز تراجع كل تسجيل قبل ما يدخل، فعّل «مراجعة التسجيلات» من تحت.</span></div>' +
            '<button class="btn btn-ghost" id="approval-toggle">' + approvalBtnLabel() + '</button>';
          return;
        }
        list.innerHTML = r.rows.map(function (q) {
          return '<div class="req" data-req="' + esc(q.id) + '">' +
            '<div class="req-top">' +
              '<div class="req-av">' + esc(initials(q.full_name)) + '</div>' +
              '<div class="req-main"><b>' + esc(q.full_name) + '</b>' +
                '<span>كود ' + esc(q.code) + '</span></div>' +
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
    var tg = e.target.closest('#approval-toggle');
    if (tg) return toggleApproval();
  });

  function openApprove(reqId) {
    var card = $('[data-req="' + reqId + '"]');
    var name = card ? $('.req-main b', card).textContent : '';
    loadClasses().then(function () {
      var body = '<p class="form-note">' + esc(name) + ' — تقدر تقبله كده على طول، أو تحطه في فصل ومجموعة (اختياري).</p>';
      if (!state.classes.length) {
        body += '<div class="empty"><b>مفيش فصول لسه</b><span>تقدر تقبله من غير فصل، أو تعمل فصل من تبويب «الفصول».</span></div>' +
          '<p class="form-err" id="ap-err"></p>' +
          '<button class="btn btn-primary" id="ap-do">قبول الطالب</button>';
        openSheet('قبول طالب', body);
        $('#ap-do').addEventListener('click', function () {
          var b = this; btnBusy(b, true);
          api('POST', '/api/teacher/requests/' + reqId + '/approve', {})
            .then(function () { closeSheet(); toast('اتقبل ✅'); loadRequests(); loadStats(); })
            .catch(function (e) { err($('#ap-err'), e.message); })
            .then(function () { btnBusy(b, false); });
        });
        return;
      }
      body += '<p class="sheet-sub">الفصل (اختياري)</p><div id="ap-classes">' +
        state.classes.map(function (c) {
          return '<div class="pick" data-c="' + esc(c.id) + '"><span class="nm">فصل ' + esc(c.name) + '</span>' +
            '<span class="cap">' + c.groups.length + ' مجموعات</span><span class="rd"></span></div>';
        }).join('') + '</div>' +
        '<div id="ap-groups-wrap" class="hidden"><p class="sheet-sub">المجموعة (اختياري)</p><div id="ap-groups"></div></div>' +
        '<p class="form-err" id="ap-err"></p>' +
        '<button class="btn btn-primary" id="ap-do">قبول الطالب</button>';
      openSheet('قبول طالب', body);

      var chosenClass = null, chosenGroup = null;
      function syncBtn() {
        var b = $('#ap-do');
        if (!b) return;
        var ok = !chosenGroup || (chosenClass && chosenGroup);
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
              '<div class="meta">' + esc(s.code) + (s.phone ? ' — ' + esc(s.phone) : '') + '</div></div>' +
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

  /**
   * استيراد قاعدة بيانات الأكواد.
   * بيقبل: CSV · JSON (مصفوفة كائنات) · TSV · ملف نصي · Excel (.xlsx) لو المتصفح
   * قدر يقراه. الأعمدة بأي أسماء معقولة — السيرفر بيدوّر على code/name أو الكود/الاسم.
   */
  function openImport() {
    openSheet('رفع قاعدة بيانات الأكواد',
      '<p class="form-note">كل صف لازم يكون فيه <b>الكود</b> و<b>الاسم</b>.<br>' +
      'الأعمدة الاختيارية: الرقم القومي، الموبايل، ولي الأمر، الصف.<br>' +
      'المدعوم: <b>CSV</b> · <b>TSV</b> · <b>JSON</b> · <b>Excel (.xlsx)</b></p>' +
      '<div class="field"><label for="imp-file">ملف قاعدة البيانات</label>' +
      '<input id="imp-file" type="file" accept=".csv,.tsv,.txt,.json,.xlsx,text/csv,application/json"></div>' +
      '<div class="field"><label for="imp-csv">أو الصق الصفوف هنا</label>' +
      '<textarea id="imp-csv" placeholder="code,name,grade&#10;100000001,أحمد محمد علي,3/1&#10;100000002,سارة حسن إبراهيم,3/1"></textarea></div>' +
      '<div class="field"><label for="imp-mode">لو الكود موجود بالفعل</label>' +
      '<select id="imp-mode">' +
      '<option value="merge">حدّث الاسم وسيب الباقي</option>' +
      '<option value="replace">استبدل القاعدة بالكامل</option>' +
      '</select></div>' +
      '<p class="form-err" id="imp-err"></p>' +
      '<button class="btn btn-primary" id="imp-go">رفع القاعدة</button>' +
      '<div id="imp-preview" class="imp-preview"></div>');

    var picked = null;      // { rows: [...] } جاهزة للإرسال
    var pickedLabel = '';

    // ---- قراءة الملفات ----
    $('#imp-file').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      err($('#imp-err'), '');
      pickedLabel = f.name;
      var name = f.name.toLowerCase();
      if (name.endsWith('.xlsx')) return readXlsx(f);
      if (name.endsWith('.json')) return readJson(f);
      var fr = new FileReader();
      fr.onload = function () { $('#imp-csv').value = String(fr.result || ''); previewRows(); };
      fr.readAsText(f, 'utf-8');
    });

    function readJson(f) {
      var fr = new FileReader();
      fr.onload = function () {
        var txt = String(fr.result || '').trim();
        try {
          var data = JSON.parse(txt);
          if (data && !Array.isArray(data)) {
            data = data.students || data.rows || data.roster || data.data || null;
          }
          if (!Array.isArray(data)) throw new Error('مفيش مصفوفة في الملف');
          picked = data;
          showPreview(data.length + ' صف من ' + pickedLabel);
        } catch (e) { err($('#imp-err'), 'ملف JSON مش مفهوم: ' + e.message); }
      };
      fr.readAsText(f, 'utf-8');
    }

    function readXlsx(f) {
      var fr = new FileReader();
      fr.onload = function () {
        xlsxRows(new Uint8Array(fr.result)).then(function (rows) {
          if (!rows.length) throw new Error('الملف فاضي');
          picked = rows;
          showPreview(rows.length + ' صف من ' + pickedLabel);
        }).catch(function (e) {
          err($('#imp-err'), 'مش قادر أقرا ملف Excel (' + e.message + ') — صدّره CSV وجرّب');
        });
      };
      fr.readAsArrayBuffer(f);
    }

    /**
     * قارئ .xlsx مصغّر: بيقرا الـ workbook من zip وبيستخرج أول ورقة شغل
     * (sharedStrings + sheet1). كافي لجداول الأسماء — مش محرك Excel كامل.
     */
    async function xlsxRows(bytes) {
      var files = await unzip(bytes);
      var sst = [];
      if (files['xl/sharedStrings.xml']) {
        var ss = utf8(files['xl/sharedStrings.xml']);
        var items = ss.match(/<si[\s\S]*?<\/si>/g) || [];
        sst = items.map(function (si) {
          return (si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [])
            .map(function (t) { return xmlText(t.replace(/<[^>]+>/g, '')); }).join('');
        });
      }
      var sheetName = Object.keys(files).filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); })[0];
      if (!sheetName) throw new Error('مفيش ورقة عمل');
      var sheet = utf8(files[sheetName]);
      var rowsX = sheet.match(/<row[\s\S]*?<\/row>/g) || [];
      return rowsX.map(function (r) {
        var cells = [];
        var cs = r.match(/<c[^>]*>[\s\S]*?<\/c>/g) || [];
        cs.forEach(function (c) {
          var ref = (c.match(/r="([A-Z]+)\d+"/) || [])[1] || '';
          var col = ref ? colIndex(ref) : cells.length;
          var t = (c.match(/t="([^"]+)"/) || [])[1];
          var v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          var inline = (c.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/) || [])[1];
          var val = inline !== undefined ? xmlText(inline)
            : (t === 's' && v !== undefined) ? (sst[+v] || '')
            : (v !== undefined ? xmlText(v) : '');
          cells[col] = val;
        });
        return cells;
      }).filter(function (row) { return row.some(function (c) { return String(c || '').trim(); }); });
    }

    function colIndex(ref) {
      var n = 0;
      for (var i = 0; i < ref.length; i++) n = n * 26 + (ref.charCodeAt(i) - 64);
      return n - 1;
    }
    function xmlText(t) {
      return String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    }
    function utf8(buf) { return new TextDecoder('utf-8').decode(buf); }

    /** فك ضغط zip (deflate-raw) عن طريق DecompressionStream */
    async function inflateRaw(raw) {
      if (typeof DecompressionStream !== 'function') {
        throw new Error('المتصفح مش بيدعم فك ضغط Excel — صدّر CSV');
      }
      var stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    async function unzip(bytes) {
      var out = {}, dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      var eocd = -1;
      for (var i = bytes.length - 22; i >= 0 && i > bytes.length - 65558; i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
      }
      if (eocd < 0) throw new Error('الملف مش zip صالح');
      var n = dv.getUint16(eocd + 10, true), off = dv.getUint32(eocd + 16, true);
      for (var k = 0; k < n; k++) {
        if (off + 46 > bytes.length || dv.getUint32(off, true) !== 0x02014b50) break;
        var method = dv.getUint16(off + 10, true);
        var csize = dv.getUint32(off + 20, true);
        var nlen = dv.getUint16(off + 28, true);
        var elen = dv.getUint16(off + 30, true);
        var clen = dv.getUint16(off + 32, true);
        var lho = dv.getUint32(off + 42, true);
        var name = utf8(bytes.subarray(off + 46, off + 46 + nlen));
        var lnlen = dv.getUint16(lho + 26, true);
        var lelen = dv.getUint16(lho + 28, true);
        var dataStart = lho + 30 + lnlen + lelen;
        var raw = bytes.subarray(dataStart, dataStart + csize);
        if (!/^xl\/(worksheets|sharedStrings)/.test(name)) {
          off += 46 + nlen + elen + clen;
          continue;
        }
        out[name] = method === 0 ? raw : await inflateRaw(raw);
        off += 46 + nlen + elen + clen;
      }
      return out;
    }

    function showPreview(count) {
      $('#imp-preview').innerHTML = '<div class="imp-ok">✅ ' + esc(count) + '</div>';
      err($('#imp-err'), '');
    }

    function previewRows() {
      var txt = $('#imp-csv').value.trim();
      if (!txt) { picked = null; $('#imp-preview').innerHTML = ''; return; }
      picked = { csv: txt };
      var lines = txt.split(/\r?\n/).filter(function (l) { return l.trim(); });
      // صف العناوين مش طالب
      var HEAD = /(^|[,;\t])\s*(code|name|الكود|كود|الاسم|اسم|full_name)\s*($|[,;\t])/i;
      var dataRows = lines.filter(function (l) { return !HEAD.test(l); });
      showPreview(dataRows.length + ' صف جاهز للرفع');
    }
    $('#imp-csv').addEventListener('input', previewRows);

    $('#imp-go').addEventListener('click', function () {
      var b = this;
      err($('#imp-err'), '');
      var payload = null, path = '/api/teacher/roster', method = 'POST';
      if (picked && picked.csv) payload = { csv: picked.csv };
      else if (Array.isArray(picked)) payload = { rows: picked };
      else if ($('#imp-csv').value.trim()) payload = { csv: $('#imp-csv').value.trim() };
      if (!payload) return err($('#imp-err'), 'اختار ملف أو الصق الصفوف');
      if ($('#imp-mode').value === 'replace') { path = '/api/teacher/roster'; method = 'PUT'; }

      btnBusy(b, true);
      api(method, path, payload)
        .then(function (r) {
          closeSheet();
          toast('القاعدة اترفعت: ' + r.ok + ' كود' +
                (r.skipped ? ' — و' + r.skipped + ' صف مرفوض' : '') +
                ' · الإجمالي ' + r.total);
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
            '<span>' + esc(s.code) + ' · ' + esc(s.class_name || '—') + ' · ' + esc(s.group_name || '—') + '</span></div>' +
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
    $('#login-pass').value = '';
    history = [];
    show('entry');
    if (lastCode()) { $('#code-login').value = lastCode(); }
  }

  function resume() {
    var lc = lastCode();
    if (lc) { $('#code-login').value = lc; $('#code-signup').value = lc; }
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
