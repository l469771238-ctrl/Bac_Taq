'use strict';

/* اختصار للأيقونات داخل القوالب */
const ico = (n, cls) => (window.icon ? window.icon(n, cls || '') : '');
/**
 * Z-Project Workplace — الواجهة
 * كل الشاشات في صفحة واحدة، والتنقل يدوي عشان يبقى سريع وخفيف.
 */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const TOK = 'zk_token';
  const st = {
    role: null,          // teacher | student
    student: null,
    teacher: null,
    classes: [],
    reqStatus: 'pending',
    commTab: 'ann',
    chatWith: null,
    openClasses: new Set(),
    openChat: null,
    channels: [],
    chatScope: null,
    lastNotif: 0,
  };

  /* ---------------- أدوات ---------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('on'), ms || 2400);
  }
  function token() { try { return localStorage.getItem(TOK) || ''; } catch (e) { return ''; } }
  function setToken(v) {
    try { if (v) localStorage.setItem(TOK, v); else localStorage.removeItem(TOK); } catch (e) {}
  }
  function initials(name) {
    const p = String(name || '').split(' ').filter(Boolean);
    return p.length ? p[0][0] : '؟';
  }
  function when(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const diff = (Date.now() - ts) / 60000;
    if (diff < 1) return 'الآن';
    if (diff < 60) return `قبل ${Math.round(diff)} د`;
    if (diff < 1440) return `قبل ${Math.round(diff / 60)} س`;
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }

  /* ---------------- الشبكة ---------------- */

  /**
   * عنوان السيرفر.
   * في المتصفح: نفس الأصل (فاضي).
   * في الأندرويد: التطبيق بيحقنه في window.ZAPI أو بيوفره عبر ZNative.
   * بنقراه كل مرة — مش بنحفظه — عشان التطبيق يقدر يغيّره من غير إعادة تحميل.
   */
  function apiBase() {
    if (typeof window === 'undefined') return '';
    let b = '';
    if (window.ZAPI) b = String(window.ZAPI);
    else if (window.ZNative && typeof window.ZNative.base === 'function') {
      try { b = String(window.ZNative.base()); } catch (e) { b = ''; }
    }
    // التطبيق بيمرر العنوان في الرابط كخطة احتياطية
    if (!b && window.location && window.location.search) {
      try {
        const q = new URLSearchParams(window.location.search);
        if (q.get('zapi')) b = q.get('zapi');
      } catch (e) {}
    }
    return String(b).replace(/\/+$/, '');
  }
  function api(method, path, body) {
    const opt = { method, headers: {} };
    const t = token();
    if (t) opt.headers.Authorization = 'Bearer ' + t;
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    return fetch(apiBase() + path, opt).then(
      (r) => r.json().catch(() => ({})).then((j) => {
        if (!r.ok) {
          const e = new Error(j.error || 'حصل خطأ (' + r.status + ')');
          e.status = r.status;
          throw e;
        }
        return j;
      }),
      () => {
        const e = new Error('مفيش اتصال بالسيرفر — اتأكد من الإنترنت');
        e.status = 0;
        throw e;
      }
    );
  }

  /* ---------------- التنقل ---------------- */

  let history = [];

  function show(id, push = true) {
    const cur = $('.screen.show');
    if (cur && cur.id === id) return;
    if (cur && push) history.push(cur.id);
    $$('.screen').forEach((s) => s.classList.toggle('show', s.id === id));
    const sc = $('#' + id + ' .scroll');
    if (sc) sc.scrollTop = 0;
  }
  function back() {
    const prev = history.pop();
    if (prev) {
      $$('.screen').forEach((s) => s.classList.toggle('show', s.id === prev));
    } else {
      show('screen-home', false);
    }
  }
  function resetTo(id) {
    history = [];
    $$('.screen').forEach((s) => s.classList.toggle('show', s.id === id));
  }

  /* ---------------- الحالة ---------------- */

  async function boot() {
    const t = token();
    if (!t) return resetTo('screen-home');
    try {
      // جرّب طالب الأول
      const me = await api('GET', '/api/me');
      st.role = 'student';
      st.student = me.student;
      resetTo('screen-student');
      return renderStudent();
    } catch (e) {
      if (e.status !== 401 && e.status !== 403) { /* maybe teacher */ }
    }
    try {
      st.teacher = await api('GET', '/api/teacher/me');
      st.role = 'teacher';
      resetTo('screen-teacher');
      return renderTeacherHome();
    } catch (e) {
      setToken('');
      resetTo('screen-home');
    }
  }

  /* ---------------- البداية ---------------- */

  $('#go-join').onclick = () => { $('#join-code').value = ''; $('#join-err').textContent = ''; show('screen-join'); };
  $('#go-login').onclick = () => {
    $('#li-code').value = ''; $('#li-pass').value = ''; $('#li-err').textContent = '';
    show('screen-login');
  };
  $('#go-teacher').onclick = () => { $('#tl-pass').value = ''; $('#tl-err').textContent = ''; show('screen-tlogin'); };
  $$('[data-back]').forEach((b) => (b.onclick = back));
  $$('[data-nav]').forEach((b) => (b.onclick = () => navTo(b.dataset.nav)));

  function navTo(what) {
    if (what === 'teacher') { show('screen-teacher', false); renderTeacherHome(); }
    else if (what === 'organize') { show('screen-organize'); renderOrganize(); }
    else if (what === 'requests') { show('screen-requests'); loadRequests(); }
    else if (what === 'comm') { show('screen-comm'); renderComm(); }
    else if (what === 'files') { show('screen-files'); renderFiles(); }
    else if (what === 'settings') { show('screen-settings'); renderSettings(); }
  }

  /* ---------------- طلب انضمام ---------------- */

  let joinData = null;

  $('#join-check').onclick = async () => {
    const code = $('#join-code').value.trim();
    const err = $('#join-err');
    err.textContent = '';
    if (!code) { err.textContent = 'اكتب الكود'; return; }
    const btn = $('#join-check');
    btn.disabled = true;
    try {
      const r = await api('POST', '/api/lookup', { code });
      joinData = r;
      if (r.action === 'signup') {
        $('#su-name').textContent = r.name;
        $('#su-code').textContent = r.code;
        $('#su-pass').value = '';
        $('#su-pass2').value = '';
        $('#su-err').textContent = '';
        show('screen-signup');
      } else if (r.action === 'login') {
        $('#li-code').value = r.code;
        $('#li-pass').value = '';
        $('#li-err').textContent = '';
        toast('عندك حساب بالفعل — سجّل دخول');
        show('screen-login');
      } else {
        $('#pd-title').textContent = r.state === 'pending' ? 'طلبك مستني الموافقة' : 'حسابك مش مفعّل';
        $('#pd-msg').textContent = r.message || '';
        show('screen-pending');
      }
    } catch (e) {
      err.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  };

  $('#su-send').onclick = async () => {
    const p1 = $('#su-pass').value;
    const p2 = $('#su-pass2').value;
    const err = $('#su-err');
    err.textContent = '';
    if (p1.length < 6) { err.textContent = 'كلمة المرور لازم ٦ حروف على الأقل'; return; }
    if (p1 !== p2) { err.textContent = 'كلمتا المرور مش زي بعض'; return; }
    const btn = $('#su-send');
    btn.disabled = true;
    try {
      const r = await api('POST', '/api/register', { code: joinData.code, password: p1 });
      $('#pd-title').textContent = 'طلبك اتبعت';
      $('#pd-msg').textContent = 'مستني موافقة المس أسماء — أول ما توافق هتقدر تدخل.';
      show('screen-pending');
      void r;
    } catch (e) {
      err.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  };

  /* ---------------- دخول الطالب ---------------- */

  $('#li-go').onclick = async () => {
    const code = $('#li-code').value.trim();
    const pass = $('#li-pass').value;
    const err = $('#li-err');
    err.textContent = '';
    if (!code || !pass) { err.textContent = 'اكتب الكود وكلمة المرور'; return; }
    const btn = $('#li-go');
    btn.disabled = true;
    try {
      const r = await api('POST', '/api/login', { code, password: pass });
      setToken(r.token);
      st.role = 'student';
      st.student = r.student;
      resetTo('screen-student');
      renderStudent();
    } catch (e) {
      err.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  };

  /* ---------------- دخول المس ---------------- */

  $('#tl-go').onclick = async () => {
    const pass = $('#tl-pass').value;
    const err = $('#tl-err');
    err.textContent = '';
    if (!pass) { err.textContent = 'اكتبي كلمة المرور'; return; }
    const btn = $('#tl-go');
    btn.disabled = true;
    try {
      const r = await api('POST', '/api/teacher/login', { password: pass });
      setToken(r.token);
      st.role = 'teacher';
      st.teacher = { name: r.name };
      resetTo('screen-teacher');
      renderTeacherHome();
    } catch (e) {
      err.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  };

  /* ---------------- لوحة المس ---------------- */

  async function renderTeacherHome() {
    try {
      const me = await api('GET', '/api/teacher/me');
      st.teacher = me;
      $('#th-stats').innerHTML = `
        <div class="stat4 gold"><b>${me.pending}</b><span>طلبات مستنية</span></div>
        <div class="stat4"><b>${me.students}</b><span>طلاب مفعّلين</span></div>
        <div class="stat4"><b>${me.classes}</b><span>فصول</span></div>
        <div class="stat4"><b>${me.groups}</b><span>مجموعات</span></div>`;
      const badge = $('#th-badge');
      badge.hidden = !me.pending;
      badge.textContent = me.pending > 99 ? '99+' : me.pending;
    } catch (e) {
      if (e.status === 401) { setToken(''); resetTo('screen-home'); }
      else toast(e.message);
    }
  }

  $('#th-settings').onclick = () => navTo('settings');

  $('#th-logout').onclick = async () => {
    try { await api('POST', '/api/logout'); } catch (e) {}
    setToken('');
    st.role = null;
    st.teacher = null;
    history = [];
    resetTo('screen-home');
  };

  /* ---------------- الإعدادات ---------------- */

  async function renderSettings() {
    const box = $('#set-body');
    box.innerHTML = '<p style="text-align:center;color:#6b7a94;padding:30px">بنحمّل…</p>';
    let d;
    try { d = await api('GET', '/api/teacher/settings'); } catch (e) {
      box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return;
    }

    box.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:12px">
          <div class="avatar">${ico("users")}</div>
          <div class="grow">
            <b>حد المجموعة</b>
            <small>أقصى عدد طلاب في المجموعة الواحدة</small>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;justify-content:center;margin:8px 0">
          <button class="icon-btn" id="set-minus"
            style="background:#eef2f9;color:#12203a;font-size:22px;width:46px;height:46px">−</button>
          <b id="set-val" style="font-size:32px;font-weight:800;color:#0d1b33;min-width:60px;text-align:center">
            ${d.maxGroup}</b>
          <button class="icon-btn" id="set-plus"
            style="background:#eef2f9;color:#12203a;font-size:22px;width:46px;height:46px">＋</button>
        </div>
        <p style="text-align:center;font-size:11.5px;color:#6b7a94;margin:6px 0 0">
          من ٢ لـ ٣٠ · الافتراضي ${d.defaults.maxGroup}
        </p>
        <div class="acts"><button class="btn primary" id="set-save">حفظ</button></div>
      </div>

      <div class="sec-head"><h3>نظرة عامة</h3></div>
      <div class="stats4">
        <div class="stat4"><b>${d.classCount}</b><span>فصول</span></div>
        <div class="stat4"><b>${d.groupCount}</b><span>مجموعات</span></div>
      </div>

      <div class="card" style="background:#f8fafd">
        <b style="font-size:13.5px;display:block;margin-bottom:8px">قواعد ثابتة</b>
        <div style="font-size:12px;color:#5b6b85;line-height:2">
          • المجموعة من غير قائد ما بتقفلش<br>
          • قائد واحد بس لكل مجموعة<br>
          • مفيش دردشة بين طالبين<br>
          • محدش يشوف ملفات مجموعة تانية<br>
          • أقصى حجم للملف ١٢٠ ميجا
        </div>
      </div>`;

    let val = d.maxGroup;
    const paint = () => ($('#set-val').textContent = val);
    $('#set-minus').onclick = () => { val = Math.max(2, val - 1); paint(); };
    $('#set-plus').onclick = () => { val = Math.min(30, val + 1); paint(); };
    $('#set-save').onclick = async () => {
      try {
        const r = await api('PATCH', '/api/teacher/settings', { maxGroup: val });
        toast('اتحفظ — الحد بقى ' + r.maxGroup + ' أعضاء');
      } catch (e) { toast(e.message); }
    };
  }

  /* ---------------- لوحة التنظيم ---------------- */

  async function renderOrganize() {
    const box = $('#org-body');
    try {
      const r = await api('GET', '/api/teacher/classes');
      st.classes = r.classes;
    } catch (e) { return toast(e.message); }

    if (!st.classes.length) {
      box.innerHTML = `
        <div class="empty">
          <div class="e-ico">${ico("grid","ic-xl")}</div>
          <p>مالكيش فصول لسه.<br>ابدأي بفصل، وبعدها مجموعات جواه.</p>
          <button class="btn primary" style="margin-top:18px" id="org-first">＋ إنشاء فصل</button>
        </div>`;
      $('#org-first').onclick = addClass;
      return;
    }

    box.innerHTML = st.classes.map((c) => {
      const total = c.groups.reduce((n, g) => n + g.members.length, 0);
      const ready = c.groups.filter((g) => g.ready).length;
      const open = st.openClasses.has(c.id);
      return `
      <div class="cls ${open ? 'open' : ''}" data-cls="${c.id}">
        <div class="cls-head" data-toggle="${c.id}">
          <div class="cls-ico">${ico("school")}</div>
          <div class="grow" style="flex:1;min-width:0">
            <b style="font-size:15px">${esc(c.name)}</b>
            <small style="font-size:11.5px;color:#6b7a94;display:block">
              ${c.groups.length} مجموعة · ${total} طالب · ${ready} جاهزة
            </small>
          </div>
          <span style="font-size:19px;color:#93a1b8">${open ? '⌃' : '⌄'}</span>
        </div>
        <div class="cls-body">
          ${c.groups.map((g) => groupCard(g)).join('') || '<p style="color:#6b7a94;font-size:13px;text-align:center;padding:8px 0">مفيش مجموعات لسه</p>'}
          <button class="btn gold sm" style="width:100%;margin-top:6px" data-addgrp="${c.id}">
            ＋ مجموعة في ${esc(c.name)}
          </button>
        </div>
      </div>`;
    }).join('');

    $$('[data-toggle]', box).forEach((el) => {
      el.onclick = () => {
        const id = Number(el.dataset.toggle);
        if (st.openClasses.has(id)) st.openClasses.delete(id); else st.openClasses.add(id);
        renderOrganize();
      };
    });
    $$('[data-addgrp]', box).forEach((el) => (el.onclick = () => addGroup(Number(el.dataset.addgrp))));
    $$('[data-leader]', box).forEach((el) => (el.onclick = () => toggleLeader(Number(el.dataset.leader), el.dataset.on === '1')));
    $$('[data-ready]', box).forEach((el) => (el.onclick = () => toast('لازم تختاري عضو وتديه شارة القيادة الأول')));
  }

  function groupCard(g) {
    const girls = g.gender === 'girls';
    return `
    <div class="grp ${g.ready ? 'ready' : ''}">
      <div class="grp-head">
        <span class="chip ${girls ? 'gray' : 'blue'}">${girls ? 'بنات' : 'ولاد'}</span>
        <span class="grp-name">${esc(g.name)}</span>
        ${g.ready ? '<span class="chip green">جاهزة</span>' : '<span class="chip red">محتاجة قائد</span>'}
      </div>
      ${g.members.map((m) => `
        <div class="mem">
          <div class="avatar ${m.isLeader ? 'lead' : ''}" style="width:32px;height:32px;font-size:12.5px;border-radius:10px">
            ${m.isLeader ? ico('award','ic-sm') : esc(initials(m.name))}
          </div>
          <div style="flex:1;min-width:0">
            <b>${esc(m.name)}</b>
            <small>${esc(m.code)}</small>
          </div>
          ${m.isLeader
            ? `<button class="chip gold" data-leader="${m.id}" data-on="1">قائد · شيل</button>`
            : `<button class="chip gray" data-leader="${m.id}" data-on="0">امنحها القيادة</button>`}
        </div>`).join('') || '<p style="font-size:12px;color:#6b7a94;margin:4px 0">مفيش أعضاء لسه — من صفحة الإشعارات</p>'}
    </div>`;
  }

  async function toggleLeader(sid, remove) {
    try {
      await api('POST', `/api/teacher/students/${sid}/leader`, { leader: !remove });
      toast(remove ? 'الشارة اتشالت' : 'الشارة اتمنحت');
      renderOrganize();
    } catch (e) { toast(e.message); }
  }

  function addClass() {
    sheet(`
      <h3>فصل جديد</h3>
      <p class="sub">اسم الفصل اللي هتشوفيه في التنظيم</p>
      <label class="field"><span>اسم الفصل</span>
        <input id="sh-name" placeholder="مثال: ٣ ثانوي أ" maxlength="40"></label>
      <div class="sheet-acts">
        <button class="btn ghost" data-close>إلغاء</button>
        <button class="btn primary" id="sh-ok">إنشاء</button>
      </div>`, () => {
      $('#sh-name').focus();
      const go = async () => {
        const name = $('#sh-name').value.trim();
        if (!name) return toast('اكتب اسم الفصل');
        try {
          await api('POST', '/api/teacher/classes', { name });
          closeSheet();
          toast('الفصل اتعمل');
          renderOrganize();
        } catch (e) { toast(e.message); }
      };
      $('#sh-ok').onclick = go;
      $('#sh-name').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    });
  }

  function addGroup(classId) {
    const cls = st.classes.find((c) => c.id === classId);
    sheet(`
      <h3>مجموعة جديدة</h3>
      <p class="sub">في ${esc(cls ? cls.name : '')}</p>
      <label class="field"><span>اسم المجموعة</span>
        <input id="sh-name" placeholder="مثال: مجموعة النور" maxlength="40"></label>
      <span style="font-size:13px;font-weight:600;color:#3c4a63;display:block;margin-bottom:7px">التصنيف</span>
      <div class="seg" id="sh-seg">
        <button class="on" data-g="boys">ولاد</button>
        <button data-g="girls">بنات</button>
      </div>
      <div class="sheet-acts">
        <button class="btn ghost" data-close>إلغاء</button>
        <button class="btn primary" id="sh-ok">إنشاء</button>
      </div>`, () => {
      let gender = 'boys';
      $$('#sh-seg button').forEach((b) => (b.onclick = () => {
        gender = b.dataset.g;
        $$('#sh-seg button').forEach((x) => x.classList.toggle('on', x === b));
        b.classList.toggle('girls', gender === 'girls');
      }));
      $('#sh-name').focus();
      const go = async () => {
        const name = $('#sh-name').value.trim();
        if (!name) return toast('اكتب اسم المجموعة');
        try {
          await api('POST', `/api/teacher/classes/${classId}/groups`, { name, gender });
          closeSheet();
          toast('المجموعة اتعملت');
          st.openClasses.add(classId);
          renderOrganize();
        } catch (e) { toast(e.message); }
      };
      $('#sh-ok').onclick = go;
    });
  }

  $('#org-add-class').onclick = addClass;

  /* ---------------- الإشعارات ---------------- */

  $$('#req-tabs .tab').forEach((t) => (t.onclick = () => {
    st.reqStatus = t.dataset.st;
    $$('#req-tabs .tab').forEach((x) => x.classList.toggle('on', x === t));
    loadRequests();
  }));

  async function loadRequests() {
    const box = $('#req-body');
    box.innerHTML = '<p style="text-align:center;color:#6b7a94;padding:30px">بنحمّل…</p>';
    let data;
    try {
      data = await api('GET', '/api/teacher/requests?status=' + st.reqStatus);
    } catch (e) {
      box.innerHTML = `<div class="empty"><div class="e-ico">${ico("alert","ic-xl")}</div><p>${esc(e.message)}</p></div>`;
      return;
    }
    if (!data.rows.length) {
      box.innerHTML = `<div class="empty"><div class="e-ico">${ico(st.reqStatus === 'pending' ? 'bell' : 'inbox','ic-xl')}</div>
        <p>${st.reqStatus === 'pending' ? 'مفيش طلبات مستنية دلوقتي' : 'مفيش حاجة هنا'}</p></div>`;
      renderTeacherHome();
      return;
    }
    box.innerHTML = data.rows.map((r) => {
      const isPend = r.status === 'pending';
      return `
      <div class="card">
        <div class="row">
          <div class="avatar girl">${esc(initials(r.name))}</div>
          <div class="grow">
            <b>${esc(r.name)}</b>
            <small>${esc(r.code)} · ${when(r.at)}</small>
          </div>
          ${isPend ? '<span class="chip gold">مستني</span>'
            : r.status === 'active' ? '<span class="chip green">مقبول</span>'
            : '<span class="chip red">مرفوض</span>'}
        </div>
        ${isPend ? `<div class="acts">
          <button class="btn danger" data-rej="${r.id}">رفض</button>
          <button class="btn primary" data-acc="${r.id}">قبول</button>
        </div>` : ''}
      </div>`;
    }).join('');

    $$('[data-acc]', box).forEach((el) => (el.onclick = () => approveSheet(Number(el.dataset.acc))));
    $$('[data-rej]', box).forEach((el) => (el.onclick = () => reject(Number(el.dataset.rej))));
    renderTeacherHome();
  }

  async function reject(id) {
    try {
      await api('POST', `/api/teacher/requests/${id}/reject`, {});
      toast('الطلب اترفض');
      loadRequests();
    } catch (e) { toast(e.message); }
  }

  async function approveSheet(id) {
    const data = await api('GET', '/api/teacher/requests?status=pending');
    const req = data.rows.find((r) => r.id === id);
    if (!req) return toast('الطلب مش موجود');

    if (!st.classes.length) {
      try { st.classes = (await api('GET', '/api/teacher/classes')).classes; } catch (e) {}
    }
    if (!st.classes.length) {
      return toast('اعملي فصل ومجموعة الأول من لوحة التنظيم');
    }

    sheet(`
      <h3>قبول ${esc(req.name)}</h3>
      <p class="sub">اختاري الفصل والمجموعة — القبول مش بيتم غير كده</p>
      <label class="field"><span>الفصل</span>
        <select id="ap-cls">
          ${st.classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span>المجموعة</span>
        <select id="ap-grp"></select>
      </label>
      <div id="ap-note" style="font-size:12px;color:#6b7a94;line-height:1.6;margin-bottom:4px"></div>
      <div class="sheet-acts">
        <button class="btn ghost" data-close>إلغاء</button>
        <button class="btn primary" id="sh-ok">قبول وحطها</button>
      </div>`, () => {
      const fillGroups = () => {
        const cid = Number($('#ap-cls').value);
        const cls = st.classes.find((c) => c.id === cid);
        const grp = cls ? cls.groups : [];
        $('#ap-grp').innerHTML = grp.length
          ? grp.map((g) => `<option value="${g.id}">${esc(g.name)} (${g.members.length}) ${g.ready ? '' : '— محتاجة قائد'}</option>`).join('')
          : '<option value="">— مفيش مجموعات —</option>';
        note();
      };
      const note = () => {
        const gid = Number($('#ap-grp').value);
        const cls = st.classes.find((c) => c.id === Number($('#ap-cls').value));
        const g = cls && cls.groups.find((x) => x.id === gid);
        $('#ap-note').textContent = g && !g.ready
          ? ico('alert','ic-sm') + ' المجموعة دي مفيهاش قائد — قبول الطالب هنا هيمنحه شارة القيادة تلقائيًا.'
          : '';
      };
      $('#ap-cls').onchange = fillGroups;
      $('#ap-grp').onchange = note;
      fillGroups();

      $('#sh-ok').onclick = async () => {
        const classId = Number($('#ap-cls').value);
        const groupId = Number($('#ap-grp').value);
        if (!groupId) return toast('اختاري مجموعة');
        try {
          await api('POST', `/api/teacher/requests/${id}/approve`, { classId, groupId });
          closeSheet();
          toast('اتقبل واتحط في المجموعة');
          loadRequests();
        } catch (e) { toast(e.message); }
      };
    });
  }

  /* ---------------- التواصل ---------------- */

  $$('#comm-tabs .tab').forEach((t) => (t.onclick = () => {
    st.commTab = t.dataset.t;
    st.chatWith = null;
    roomWith = null;
    dmWith = null;
    $$('#comm-tabs .tab').forEach((x) => x.classList.toggle('on', x === t));
    renderComm();
  }));

  async function renderComm() {
    const box = $('#comm-body');
    if (st.commTab === 'ann') return renderAnnounce(box);
    if (st.commTab === 'dm') return renderDMList(box);
    return renderChatRooms(box);
  }

  async function renderAnnounce(box) {
    let data;
    try { data = await api('GET', '/api/teacher/messages'); } catch (e) {
      box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return;
    }
    box.innerHTML = `
      <div class="card">
        <span style="font-size:13px;font-weight:600;color:#3c4a63;display:block;margin-bottom:8px">إعلان جديد</span>
        <textarea id="an-body" placeholder="اكتبي الإعلان…"></textarea>
        <div class="seg" id="an-seg" style="margin-top:11px">
          <button class="on" data-s="all">كل الأعضاء</button>
          <button data-s="leaders">قادة المجموعات</button>
        </div>
        <button class="btn gold" id="an-send">نشر الإعلان</button>
      </div>
      <div class="sec-head"><h3>الإعلانات السابقة</h3></div>
      ${data.announcements.length ? data.announcements.map((a) => `
        <div class="msg">
          <div class="m-body">${esc(a.body)}</div>
          <div class="m-meta">
            <span>${esc(a.to)} · ${when(a.at)}</span>
            <button class="chip red" data-del="${a.id}">حذف</button>
          </div>
        </div>`).join('') : '<div class="empty"><div class="e-ico">${ico("bell","ic-xl")}</div><p>مفيش إعلانات لسه</p></div>'}`;

    let scope = 'all';
    $$('#an-seg button').forEach((b) => (b.onclick = () => {
      scope = b.dataset.s;
      $$('#an-seg button').forEach((x) => x.classList.toggle('on', x === b));
    }));
    $('#an-send').onclick = async () => {
      const body = $('#an-body').value.trim();
      if (!body) return toast('اكتبي الإعلان');
      try {
        const r = await api('POST', '/api/teacher/announce', { body, scope });
        toast(`الإعلان اتبعت لـ${r.reached} طالب`);
        renderComm();
      } catch (e) { toast(e.message); }
    };
    $$('[data-del]', box).forEach((el) => (el.onclick = async () => {
      try { await api('DELETE', '/api/teacher/announce/' + el.dataset.del); renderComm(); } catch (e) { toast(e.message); }
    }));
  }

  async function renderChatList(box) {
    if (st.chatWith) return renderChatThread(box, st.chatWith);
    let data;
    try { data = await api('GET', '/api/teacher/students'); } catch (e) {
      box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return;
    }
    const students = data.rows.filter((s) => s.status === 'active');
    if (!students.length) {
      box.innerHTML = '<div class="empty"><div class="e-ico">${ico("chat","ic-xl")}</div><p>مفيش طلاب مفعّلين لسه</p></div>';
      return;
    }
    box.innerHTML = students.map((s) => `
      <div class="card" data-chat="${s.id}" style="cursor:pointer">
        <div class="row">
          <div class="avatar ${s.group && s.group.gender === 'girls' ? 'girl' : ''}">${esc(initials(s.name))}</div>
          <div class="grow"><b>${esc(s.name)}</b><small>${esc(s.code)} · ${s.group ? esc(s.group.name) : 'بدون مجموعة'}</small></div>
          <span style="color:#93a1b8;font-size:19px">›</span>
        </div>
      </div>`).join('');
    $$('[data-chat]', box).forEach((el) => (el.onclick = () => {
      st.chatWith = Number(el.dataset.chat);
      renderComm();
    }));
  }

  async function renderChatThread(box, sid) {
    let d;
    try { d = await api('GET', '/api/teacher/chat/' + sid); } catch (e) {
      box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return;
    }
    box.innerHTML = `
      <div class="row" style="margin-bottom:14px;gap:9px">
        <button class="chip gray" id="ch-back">‹ رجوع</button>
        <b style="font-size:15px">${esc(d.student.name)}</b>
      </div>
      <div id="ch-msgs">
        ${d.msgs.length ? d.msgs.map((m) => `
          <div class="msg mine"><div class="m-body">${esc(m.body)}</div>
            <div class="m-meta"><span>${when(m.at)}</span><span>المس</span></div></div>`).join('')
          : '<div class="empty"><div class="e-ico">${ico("chat","ic-xl")}</div><p>مفيش رسايل لسه — ابدأي</p></div>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <input id="ch-in" placeholder="اكتبي رسالة…" style="flex:1;padding:13px 15px;border-radius:13px;border:1.5px solid #e3e8f2;font-family:inherit;font-size:14px">
        <button class="btn primary" id="ch-send" style="width:auto;padding:0 20px">إرسال</button>
      </div>`;
    $('#ch-back').onclick = () => { st.chatWith = null; renderComm(); };
    const send = async () => {
      const body = $('#ch-in').value.trim();
      if (!body) return;
      try {
        await api('POST', '/api/teacher/chat/' + sid, { body });
        renderComm();
      } catch (e) { toast(e.message); }
    };
    $('#ch-send').onclick = send;
    $('#ch-in').onkeydown = (e) => { if (e.key === 'Enter') send(); };
    const box2 = $('#ch-msgs');
    if (box2 && box2.scrollIntoView) box2.scrollIntoView({ block: 'end' });
  }

  /* ---------------- دردشة عضو (المس مع الطالب) ---------------- */
  /*
   * دي الدردشة الخاصة الوحيدة في التطبيق: المس مع طالب واحد.
   * مفيش أي طريقة يخلي طالبين يتكلموا مع بعض — مش موجودة في الكود أصلًا.
   */

  let dmWith = null;

  async function renderDMList(box) {
    if (dmWith) return renderDMThread(box, dmWith);
    let d;
    try { d = await api('GET', '/api/teacher/students'); } catch (e) {
      box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return;
    }
    const students = d.rows.filter((x) => x.status === 'active');
    if (!students.length) {
      box.innerHTML = '<div class="empty"><div class="e-ico">${ico("chat","ic-xl")}</div><p>مفيش طلاب مفعّلين لسه</p></div>';
      return;
    }
    box.innerHTML = `
      <p style="font-size:12px;color:#6b7a94;margin:0 0 12px;line-height:1.6">
        دي محادثة بينك وبين الطالب لوحده. الطالب بيشوفها في «رسايل المس».
      </p>` + students.map((x) => `
      <div class="card" data-dm="${x.id}" style="cursor:pointer">
        <div class="row">
          <div class="avatar ${x.group && x.group.gender === 'girls' ? 'girl' : ''}">${esc(initials(x.name))}</div>
          <div class="grow"><b>${esc(x.name)}</b>
            <small>${esc(x.code)} · ${x.group ? esc(x.group.name) : 'بدون مجموعة'}</small></div>
          <span style="color:#93a1b8;font-size:19px">›</span>
        </div>
      </div>`).join('');
    $$('[data-dm]', box).forEach((el) => (el.onclick = () => {
      dmWith = Number(el.dataset.dm);
      renderComm();
    }));
  }

  async function renderDMThread(box, sid) {
    let d;
    try { d = await api('GET', '/api/teacher/dm/' + sid); } catch (e) {
      box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return;
    }
    box.innerHTML = `
      <div class="row" style="margin-bottom:14px;gap:9px">
        <button class="chip gray" id="dm-back">‹ رجوع</button>
        <b style="font-size:15px">${esc(d.student.name)}</b>
      </div>
      <div id="dm-msgs">
        ${d.msgs.length ? d.msgs.map((m) => `
          <div class="msg mine">
            <div style="font-size:11px;color:#9a6d1f;margin-bottom:3px"><b>مس أسماء</b></div>
            <div class="m-body">${esc(m.body)}</div>
            <div class="m-meta"><span>${when(m.at)}</span>
              <button class="chip red" data-dmdel="${m.id}" style="font-size:10px">مسح</button></div>
          </div>`).join('')
          : '<div class="empty"><div class="e-ico">${ico("chat","ic-xl")}</div><p>مفيش رسايل — اكتبي أول واحدة</p></div>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <input id="dm-in" placeholder="اكتبي رسالة…" maxlength="2000"
          style="flex:1;padding:13px 15px;border-radius:13px;border:1.5px solid #e3e8f2;font-family:inherit;font-size:14px">
        <button class="btn primary" id="dm-send" style="width:auto;padding:0 20px">إرسال</button>
      </div>`;
    $('#dm-back').onclick = () => { dmWith = null; renderComm(); };
    const send = async () => {
      const v = $('#dm-in').value.trim();
      if (!v) return;
      try {
        await api('POST', '/api/teacher/dm/' + sid, { body: v });
        renderComm();
      } catch (e) { toast(e.message); }
    };
    $('#dm-send').onclick = send;
    $('#dm-in').onkeydown = (e) => { if (e.key === 'Enter') send(); };
    $$('[data-dmdel]', box).forEach((el) => (el.onclick = async () => {
      try {
        await api('DELETE', '/api/teacher/dm/message/' + el.dataset.dmdel);
        renderComm();
      } catch (e) { toast(e.message); }
    }));
  }

  /* ---------------- الملفات (المس) ---------------- */

  let filesTab = 'tree';

  async function renderFiles() {
    const box = $('#files-body');
    box.innerHTML = '<p style="text-align:center;color:#6b7a94;padding:30px">بنحمّل…</p>';
    let d;
    try { d = await api('GET', '/api/teacher/files/tree'); } catch (e) {
      box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return;
    }
    if (!d.classes.length) {
      box.innerHTML = `<div class="empty"><div class="e-ico">${ico("folder","ic-xl")}</div>
        <p>مفيش فصول لسه<br><small>اعملي فصل ومجموعات من لوحة التنظيم الأول</small></p></div>`;
      return;
    }

    box.innerHTML = `
      <div class="tabs" style="padding:0 0 12px;background:none;border:0">
        <button class="tab ${filesTab === 'tree' ? 'on' : ''}" data-ft="tree">شغل المجموعات</button>
        <button class="tab ${filesTab === 'tasks' ? 'on' : ''}" data-ft="tasks">المطلوبات</button>
      </div>
      <div id="ft-body"></div>`;

    $$('[data-ft]', box).forEach((b) => (b.onclick = () => {
      filesTab = b.dataset.ft;
      renderFiles();
    }));

    if (filesTab === 'tree') renderFilesTree(d);
    else renderTasksPanel(d);
  }

  function renderFilesTree(d) {
    const box = $('#ft-body');
    box.innerHTML = d.classes.map((c) => `
      <div class="cls ${st.openClasses.has('f' + c.id) ? 'open' : ''}">
        <div class="cls-head" data-fcls="${c.id}">
          <div class="cls-ico">${ico("school")}</div>
          <div style="flex:1;min-width:0">
            <b style="font-size:15px">${esc(c.name)}</b>
            <small style="font-size:11.5px;color:#6b7a94;display:block">
              ${c.groups.length} مجموعة · ${c.groups.reduce((n, g) => n + g.members.reduce((k, m) => k + m.files.length, 0), 0)} ملف
            </small>
          </div>
          <button class="chip blue" data-zipcls="${c.id}" style="z-index:2">${ico("download","ic-sm")} تنزيل الكل</button>
        </div>
        <div class="cls-body">
          ${c.groups.map((g) => `
            <div class="grp">
              <div class="grp-head">
                <span class="chip ${g.gender === 'girls' ? 'gray' : 'blue'}">${g.gender === 'girls' ? 'بنات' : 'ولاد'}</span>
                <span class="grp-name">${esc(g.name)}</span>
                <button class="chip gold" data-zipgrp="${g.id}">${ico("download","ic-sm")} تنزيل</button>
              </div>
              ${g.members.map((m) => {
                const missing = m.tasks.filter((t) => !t.done).length;
                return `
                <div style="padding:9px 0;border-top:1px dashed #e6ecf5">
                  <div class="row" style="gap:9px">
                    <div class="avatar ${m.isLeader ? 'lead' : ''}" style="width:30px;height:30px;font-size:12px;border-radius:9px">
                      ${m.isLeader ? ico('award','ic-sm') : esc(initials(m.name))}</div>
                    <div style="flex:1;min-width:0">
                      <b style="font-size:12.5px">${esc(m.name)}</b>
                      <small style="font-size:10.5px;color:#6b7a94">
                        ${m.files.length} ملف · ${m.tasks.length ? (missing ? missing + ' ناقص' : 'كل المطلوب اتسلّم') : 'مفيش مطلوب'}
                      </small>
                    </div>
                    <button class="chip gray" data-prof="${m.id}">ملفه</button>
                  </div>
                </div>`;
              }).join('') || '<p style="font-size:12px;color:#6b7a94;margin:6px 0">مفيش أعضاء</p>'}
            </div>`).join('')}
        </div>
      </div>`).join('');

    $$('[data-fcls]', box).forEach((el) => (el.onclick = (e) => {
      if (e.target.dataset.zipcls) return;
      const k = 'f' + el.dataset.fcls;
      if (st.openClasses.has(k)) st.openClasses.delete(k); else st.openClasses.add(k);
      renderFiles();
    }));
    $$('[data-zipcls]', box).forEach((el) => (el.onclick = (e) => {
      e.stopPropagation();
      downloadZip('classId=' + el.dataset.zipcls);
    }));
    $$('[data-zipgrp]', box).forEach((el) => (el.onclick = (e) => {
      e.stopPropagation();
      downloadZip('groupId=' + el.dataset.zipgrp);
    }));
    $$('[data-prof]', box).forEach((el) => (el.onclick = (e) => {
      e.stopPropagation();
      openProfile(Number(el.dataset.prof));
    }));
  }

  async function openProfile(sid) {
    let d;
    try { d = await api('GET', '/api/teacher/files/tree'); } catch (e) { return toast(e.message); }
    let m = null, grp = null, cls = null;
    for (const c of d.classes) {
      for (const g of c.groups) {
        const found = g.members.find((x) => x.id === sid);
        if (found) { m = found; grp = g; cls = c; break; }
      }
      if (m) break;
    }
    if (!m) return toast('الطالب مش موجود');

    sheet(`
      <div class="row" style="margin-bottom:14px">
        <div class="avatar ${m.isLeader ? 'lead' : ''}">${m.isLeader ? ico('award','ic-sm') : esc(initials(m.name))}</div>
        <div style="flex:1;min-width:0">
          <b style="font-size:16px">${esc(m.name)}</b>
          <small style="font-size:11.5px;color:#6b7a94;display:block">${esc(m.code)} · ${esc(cls.name)} · ${esc(grp.name)}</small>
        </div>
      </div>

      <div class="sec-head"><h3>ملفاته (${m.files.length})</h3></div>
      ${m.files.length ? m.files.map((f) => `
        <div class="mem" style="border:0;padding:7px 0">
          <div style="width:30px;display:grid;place-items:center;color:var(--ink-4)">${ico("file","ic-sm")}</div>
          <div style="flex:1;min-width:0">
            <b style="font-size:12.5px;word-break:break-all">${esc(f.name)}</b>
            <small style="font-size:10.5px;color:#6b7a94">${sizeTxt(f.size)} · ${when(f.at)}</small>
          </div>
          <button class="chip blue" data-pdl="${f.id}">تحميل</button>
          <button class="chip red" data-pdel="${f.id}">مسح</button>
        </div>`).join('') : '<p style="font-size:12.5px;color:#6b7a94">مفيش ملفات</p>'}

      <div class="sec-head" style="margin-top:16px"><h3>المطلوب منه (${m.tasks.length})</h3></div>
      ${m.tasks.length ? m.tasks.map((t) => `
        <div class="mem" style="border:0;padding:7px 0">
          <div style="width:22px;text-align:center;color:${t.done ? '#2fa36b' : '#d94141'}">${t.done ? ico('check','ic-sm') : ico('close','ic-sm')}</div>
          <div style="flex:1;min-width:0"><b style="font-size:12.5px">${esc(t.title)}</b>
            ${t.link ? `<small style="font-size:10px;color:#3b6fd4;display:block;word-break:break-all">${esc(t.link)}</small>` : ''}
          </div>
          <button class="chip red" data-tdel="${t.id}">مسح</button>
        </div>`).join('') : '<p style="font-size:12.5px;color:#6b7a94">مفيش مطلوبات</p>'}

      <div class="sheet-acts" style="margin-top:16px">
        <button class="btn gold" id="p-addtask">＋ مطلوب جديد</button>
        <button class="btn primary" id="p-zip">${ico("download","ic-sm")} تنزيل ملفاته</button>
      </div>`);

    $$('[data-pdl]').forEach((el) => (el.onclick = () => downloadFile(el.dataset.pdl)));
    $$('[data-pdel]').forEach((el) => (el.onclick = async () => {
      try {
        await api('DELETE', '/api/files/' + el.dataset.pdel);
        closeSheet();
        toast('اتمسح');
        renderFiles();
      } catch (e) { toast(e.message); }
    }));
    $$('[data-tdel]').forEach((el) => (el.onclick = async () => {
      try {
        await api('DELETE', '/api/teacher/tasks/' + el.dataset.tdel);
        closeSheet();
        toast('المطلوب اتمسح');
        renderFiles();
      } catch (e) { toast(e.message); }
    }));
    $('#p-zip').onclick = () => downloadZip('studentId=' + sid);
    $('#p-addtask').onclick = () => taskSheet({ studentId: sid, name: m.name });
  }

  function renderTasksPanel(d) {
    const box = $('#ft-body');
    box.innerHTML = d.classes.map((c) => `
      <div class="cls open">
        <div class="cls-head" style="cursor:default">
          <div class="cls-ico">${ico("school")}</div>
          <div style="flex:1"><b style="font-size:14.5px">${esc(c.name)}</b></div>
        </div>
        <div class="cls-body">
          ${c.groups.map((g) => `
            <div class="grp">
              <div class="grp-head">
                <span class="chip ${g.gender === 'girls' ? 'gray' : 'blue'}">${g.gender === 'girls' ? 'بنات' : 'ولاد'}</span>
                <span class="grp-name">${esc(g.name)}</span>
                <button class="chip gold" data-newtask="${g.id}">＋ مطلوب</button>
              </div>
              ${g.tasks.length ? g.tasks.map((t) => `
                <div style="padding:9px 0;border-top:1px dashed #e6ecf5">
                  <div style="display:flex;align-items:center;gap:8px">
                    <div style="flex:1;min-width:0">
                      <b style="font-size:12.5px">${esc(t.title)}</b>
                      <div style="font-size:10.5px;color:#6b7a94;margin-top:2px">
                        ${t.doneCount}/${t.total} سلّموا
                        ${t.pending.length ? ' · ناقص: ' + t.pending.map((x) => esc(x.name.split(' ')[0])).join('، ') : ' · الكل سلّم'}
                      </div>
                    </div>
                    <button class="chip red" data-deltask="${t.id}">مسح</button>
                  </div>
                </div>`).join('') : '<p style="font-size:12px;color:#6b7a94;margin:4px 0">مفيش مطلوبات للمجموعة</p>'}
            </div>`).join('')}
        </div>
      </div>`).join('');

    $$('[data-newtask]', box).forEach((el) => (el.onclick = () => {
      const gid = Number(el.dataset.newtask);
      let gname = '';
      d.classes.forEach((c) => c.groups.forEach((g) => { if (g.id === gid) gname = g.name; }));
      taskSheet({ groupId: gid, name: gname });
    }));
    $$('[data-deltask]', box).forEach((el) => (el.onclick = async () => {
      try {
        await api('DELETE', '/api/teacher/tasks/' + el.dataset.deltask);
        toast('اتمسح');
        renderFiles();
      } catch (e) { toast(e.message); }
    }));
  }

  function taskSheet(target) {
    sheet(`
      <h3>مطلوب جديد</h3>
      <p class="sub">${target.studentId ? 'لـ ' + esc(target.name) + ' شخصيًا' : 'لكل أعضاء ' + esc(target.name)}</p>
      <label class="field"><span>اسم المطلوب</span>
        <input id="tk-title" placeholder="مثال: تسليم مشروع البايثون" maxlength="120"></label>
      <label class="field"><span>تفاصيل (اختياري)</span>
        <textarea id="tk-body" placeholder="المطلوب إيه بالظبط…" style="min-height:70px" maxlength="600"></textarea></label>
      <div class="sheet-acts">
        <button class="btn ghost" data-close>إلغاء</button>
        <button class="btn primary" id="tk-ok">إضافة</button>
      </div>`, () => {
      $('#tk-title').focus();
      $('#tk-ok').onclick = async () => {
        const title = $('#tk-title').value.trim();
        if (!title) return toast('اكتب اسم المطلوب');
        try {
          await api('POST', '/api/teacher/tasks', {
            title,
            body: $('#tk-body').value.trim(),
            groupId: target.groupId || undefined,
            studentId: target.studentId || undefined,
          });
          closeSheet();
          toast('المطلوب اتضاف');
          renderFiles();
        } catch (e) { toast(e.message); }
      };
    });
  }

  async function downloadZip(qs) {
    try {
      toast('بنجهّز الملفات…', 30000);
      const r = await fetch(apiBase() + '/api/download/zip?' + qs, {
        headers: { Authorization: 'Bearer ' + token() },
      });
      document.querySelector('#toast').classList.remove('on');
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'فشل الضغط');
      }
      const blob = await r.blob();
      const cd = r.headers.get('content-disposition') || '';
      const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
      const name = m ? decodeURIComponent(m[1]) : 'ملفات.zip';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 6000);
      toast('اتنزّل');
    } catch (e) { toast(e.message); }
  }

  /* ---------------- الدردشة (المس) ---------------- */

  let roomWith = null;

  async function renderChatRooms(box) {
    if (roomWith) return renderRoom(box, roomWith);
    let d;
    try { d = await api('GET', '/api/teacher/channels'); } catch (e) {
      box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return;
    }
    if (!d.channels.length) {
      box.innerHTML = '<div class="empty"><div class="e-ico">${ico("chat","ic-xl")}</div><p>مفيش مجموعات لسه</p></div>';
      return;
    }
    box.innerHTML = d.channels.map((c) => `
      <div class="card" data-room="${c.scope}:${c.id}" style="cursor:pointer">
        <div class="row">
          <div class="avatar" style="background:${c.scope === 'class' ? '#e8eefb' : '#fdf3e0'}">
            ${ico(c.scope === 'class' ? 'school' : 'users','ic-sm')}</div>
          <div class="grow">
            <b>${esc(c.name)}</b>
            <small>${esc(c.kind)} · ${c.count} رسالة</small>
          </div>
          <span style="color:#93a1b8;font-size:19px">›</span>
        </div>
      </div>`).join('');
    $$('[data-room]', box).forEach((el) => (el.onclick = () => {
      const parts = el.dataset.room.split(':');
      roomWith = { scope: parts[0], id: Number(parts[1]) };
      renderComm();
    }));
  }

  async function renderRoom(box, r) {
    let d;
    try { d = await api('GET', `/api/teacher/chatroom/${r.scope}/${r.id}`); } catch (e) {
      box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return;
    }
    box.innerHTML = `
      <div class="row" style="margin-bottom:14px;gap:9px">
        <button class="chip gray" id="rm-back">‹ رجوع</button>
        <b style="font-size:14.5px">${esc(d.title)}</b>
      </div>
      <div id="rm-msgs">
        ${d.msgs.length ? d.msgs.map((m) => `
          <div class="msg ${m.from === 'teacher' ? 'mine' : ''}">
            <div style="font-size:11px;color:#6b7a94;margin-bottom:3px">
              <b style="color:${m.from === 'teacher' ? '#9a6d1f' : '#12203a'}">${esc(m.name)}</b>
              ${m.leader ? ' <span class="chip gold">' + ico('award','ic-sm') + '</span>' : ''}
            </div>
            <div class="m-body">${esc(m.body)}</div>
            <div class="m-meta"><span>${when(m.at)}</span>
              <button class="chip red" data-rmdel="${m.id}" style="font-size:10px">مسح</button></div>
          </div>`).join('') : '<div class="empty"><div class="e-ico">${ico("chat","ic-xl")}</div><p>مفيش رسايل</p></div>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <input id="rm-in" placeholder="اكتبي رسالة…" style="flex:1;padding:13px 15px;border-radius:13px;border:1.5px solid #e3e8f2;font-family:inherit;font-size:14px">
        <button class="btn primary" id="rm-send" style="width:auto;padding:0 20px">إرسال</button>
      </div>`;
    $('#rm-back').onclick = () => { roomWith = null; renderComm(); };
    const send = async () => {
      const v = $('#rm-in').value.trim();
      if (!v) return;
      try {
        await api('POST', `/api/teacher/chatroom/${r.scope}/${r.id}`, { body: v });
        renderComm();
      } catch (e) { toast(e.message); }
    };
    $('#rm-send').onclick = send;
    $('#rm-in').onkeydown = (e) => { if (e.key === 'Enter') send(); };
    $$('[data-rmdel]').forEach((el) => (el.onclick = async () => {
      try {
        await api('DELETE', '/api/teacher/chatroom/' + el.dataset.rmdel);
        renderComm();
      } catch (e) { toast(e.message); }
    }));
  }

  /* ---------------- الطالب ---------------- */

  $$('[data-snav]').forEach((b) => (b.onclick = () => studentNav(b.dataset.snav)));

  function studentNav(what) {
    if (what === 'home') { show('screen-student', false); renderStudent(); }
    else if (what === 'notify') { show('screen-stnotify'); renderNotifications(); }
    else if (what === 'chat') { show('screen-stchat'); st.chatScope = null; renderStudentChat(); }
    else if (what === 'submit') { show('screen-stsubmit'); renderSubmit(); }
    else if (what === 'files') { show('screen-stfiles'); renderGroupFiles(); }
  }

  $('#st-bell').onclick = () => studentNav('notify');

  async function renderStudent() {
    let d;
    try { d = await api('GET', '/api/student/feed'); } catch (e) {
      if (e.status === 401 || e.status === 403) { setToken(''); resetTo('screen-home'); return; }
      return toast(e.message);
    }
    const s = d.student;
    st.student = s;
    $('#st-hello').textContent = 'أهلاً بيك';
    $('#st-name').textContent = s.name;

    const girls = s.group && s.group.gender === 'girls';
    $('#st-card').innerHTML = `
      <div class="mc-top">
        <div class="avatar ${girls ? 'girl' : ''}" style="background:rgba(255,255,255,.14);color:#fff">
          ${esc(initials(s.name))}</div>
        <div>
          <div class="mc-name">${esc(s.name)}</div>
          <div class="mc-sub">${s.group ? esc(s.group.className) : 'لسه من غير مجموعة'}</div>
        </div>
      </div>
      <div class="mc-grid">
        <div class="mc-cell"><span>كودك</span><b>${esc(s.code)}</b></div>
        <div class="mc-cell"><span>المجموعة</span><b>${s.group ? esc(s.group.name) : '—'}</b></div>
        <div class="mc-cell"><span>دورك</span><b class="${s.isLeader ? 'gold' : ''}">${s.isLeader ? ico('award','ic-sm') + ' قائد' : 'عضو'}</b></div>
        <div class="mc-cell"><span>الحساب</span><b>مفعّل</b></div>
      </div>`;

    // شارات
    try {
      const n = await api('GET', '/api/student/notifications');
      const tb = $('#st-task-badge');
      tb.hidden = !n.pendingTasks;
      tb.textContent = n.pendingTasks;
      const nb = $('#st-notif-badge');
      nb.hidden = !n.items.length;
      nb.textContent = n.items.length > 9 ? '9+' : n.items.length;
      const bb = $('#st-badge');
      bb.hidden = !(n.pendingTasks + n.items.length);
      bb.textContent = n.pendingTasks;
    } catch (e) {}
  }

  /* ---------- إشعارات ---------- */

  async function renderNotifications() {
    const box = $('#stn-body');
    box.innerHTML = '<p style="text-align:center;color:#6b7a94;padding:30px">بنحمّل…</p>';
    let d;
    try { d = await api('GET', '/api/student/notifications'); } catch (e) {
      box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return;
    }

    if (!d.items.length && !d.pendingTasks) {
      box.innerHTML = '<div class="empty"><div class="e-ico">${ico("inbox","ic-xl")}</div><p>مفيش إشعارات لسه</p></div>';
      return;
    }

    let html = '';
    if (d.pendingTasks) {
      html += `
        <div class="card" style="background:#fff9ec;border:1.5px solid #f5e3bd">
          <div class="row">
            <div class="avatar" style="background:#faf4e8;color:#96692a">${ico("upload","ic-sm")}</div>
            <div class="grow">
              <b>عندك ${d.pendingTasks} مطلوب لسه</b>
              <small>من أصل ${d.totalTasks} — افتح مساحة التسليم</small>
            </div>
          </div>
          <div class="acts"><button class="btn gold" data-go-submit>افتح التسليم</button></div>
        </div>`;
    }
    if (d.dm && d.dm.length) {
      html += `
        <div class="sec-head"><h3>رسايل المس</h3></div>` + d.dm.map((m) => `
        <div class="msg">
          <div style="font-size:11px;color:#9a6d1f;margin-bottom:3px"><b>مس أسماء</b></div>
          <div class="m-body">${esc(m.body)}</div>
          <div class="m-meta"><span></span><span>${when(m.at)}</span></div>
        </div>`).join('');
    }
    html += d.items.map((a) => `
      <div class="msg">
        <div class="m-body">${esc(a.body)}</div>
        <div class="m-meta">
          <span>${a.scope === 'leaders' ? 'لقادة المجموعات' : 'للجميع'}</span>
          <span>${when(a.at)}</span>
        </div>
      </div>`).join('');
    box.innerHTML = html;

    const gs = $('[data-go-submit]', box);
    if (gs) gs.onclick = () => studentNav('submit');
  }

  /* ---------- الدردشة ---------- */

  async function renderStudentChat() {
    const box = $('#stc-body');
    const tabs = $('#stc-tabs');

    if (!st.channels.length) {
      let d;
      try { d = await api('GET', '/api/student/channels'); } catch (e) {
        box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return;
      }
      if (!d.channels.length) {
        tabs.innerHTML = '';
        box.innerHTML = `<div class="empty"><div class="e-ico">${ico("chat","ic-xl")}</div><p>${esc(d.note || 'لسه مفيش قنوات')}</p></div>`;
        return;
      }
      st.channels = d.channels;
    }

    if (!st.chatScope) st.chatScope = st.channels[0];

    tabs.innerHTML = st.channels.map((c) => `
      <button class="tab ${st.chatScope && st.chatScope.scope === c.scope ? 'on' : ''}"
        data-ch="${c.scope}">${esc(c.kind)} · ${esc(c.name)}</button>`).join('');

    $$('[data-ch]', tabs).forEach((b) => (b.onclick = () => {
      st.chatScope = st.channels.find((c) => c.scope === b.dataset.ch);
      renderStudentChat();
    }));

    const ch = st.chatScope;
    $('#stc-title').textContent = ch.kind;

    box.innerHTML = `
      <div id="sc-msgs"><p style="text-align:center;color:#6b7a94;padding:20px">بنحمّل…</p></div>
      <div style="display:flex;gap:8px;margin-top:12px;position:sticky;bottom:0;background:#f4f6fb;padding:8px 0">
        <input id="sc-in" placeholder="اكتب رسالة…" maxlength="2000"
          style="flex:1;padding:13px 15px;border-radius:13px;border:1.5px solid #e3e8f2;font-family:inherit;font-size:14px">
        <button class="btn primary" id="sc-send" style="width:auto;padding:0 20px">إرسال</button>
      </div>`;

    let d;
    try { d = await api('GET', `/api/student/chat/${ch.scope}/${ch.id}`); } catch (e) {
      $('#sc-msgs').innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`;
      return;
    }
    $('#sc-msgs').innerHTML = d.msgs.length
      ? d.msgs.map((m) => `
        <div class="msg ${m.mine ? 'mine' : ''}">
          <div style="font-size:11px;color:#6b7a94;margin-bottom:3px;display:flex;gap:5px;align-items:center">
            <b style="color:${m.from === 'teacher' ? '#9a6d1f' : '#12203a'}">${esc(m.name)}</b>
            ${m.leader ? '<span class="chip gold">' + ico('award','ic-sm') + ' قائد</span>' : ''}
          </div>
          <div class="m-body">${esc(m.body)}</div>
          <div class="m-meta"><span></span><span>${when(m.at)}</span></div>
        </div>`).join('')
      : '<div class="empty"><div class="e-ico">${ico("chat","ic-xl")}</div><p>مفيش رسايل لسه — ابدأ انت</p></div>';

    const send = async () => {
      const v = $('#sc-in').value.trim();
      if (!v) return;
      try {
        await api('POST', `/api/student/chat/${ch.scope}/${ch.id}`, { body: v });
        renderStudentChat();
      } catch (e) { toast(e.message); }
    };
    $('#sc-send').onclick = send;
    $('#sc-in').onkeydown = (e) => { if (e.key === 'Enter') send(); };
  }

  /* ---------- التسليم ---------- */

  async function renderSubmit() {
    const box = $('#sts-body');
    box.innerHTML = '<p style="text-align:center;color:#6b7a94;padding:30px">بنحمّل…</p>';
    let d;
    try { d = await api('GET', '/api/student/files'); } catch (e) {
      box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return;
    }
    if (!d.tasks.length) {
      box.innerHTML = `<div class="empty"><div class="e-ico">${ico("upload","ic-xl")}</div>
        <p>مفيش مطلوب منك دلوقتي<br><small>المس أسماء لما تحط مطلوب هيظهر هنا</small></p></div>`;
      return;
    }
    box.innerHTML = d.tasks.map((t) => `
      <div class="card" style="${t.done ? 'border-right:3px solid #2fa36b' : 'border-right:3px solid #e0b467'}">
        <div class="row">
          <div class="avatar" style="background:${t.done ? '#e6f6ee;color:#237c51' : '#fdf3e0;color:#9a6d1f'}">
            ${t.done ? ico('check','ic-sm') : '!'}</div>
          <div class="grow">
            <b>${esc(t.title)}</b>
            <small>${t.scope === 'me' ? 'مطلوب منك انت' : 'مطلوب من المجموعة'} · ${t.done ? 'اتسلّم' : 'لسه'}</small>
          </div>
        </div>
        ${t.body ? `<p style="font-size:12.5px;color:#6b7a94;margin:9px 0 0;line-height:1.6">${esc(t.body)}</p>` : ''}
        ${t.done && t.link ? `<p style="font-size:11.5px;color:#3b6fd4;margin:8px 0 0;word-break:break-all;display:flex;align-items:center;gap:5px">${ico("link","ic-sm")} ${esc(t.link)}</p>` : ''}
        <div class="acts">
          ${t.done ? `<button class="btn ghost" data-resub="${t.id}">استبدال</button>
                      <button class="btn danger" data-unsub="${t.id}">إلغاء التسليم</button>`
                    : `<button class="btn primary" data-sub="${t.id}">سلّم</button>`}
        </div>
      </div>`).join('');

    $$('[data-sub]', box).forEach((el) => (el.onclick = () => submitSheet(Number(el.dataset.sub), false)));
    $$('[data-resub]', box).forEach((el) => (el.onclick = () => submitSheet(Number(el.dataset.resub), true)));
    $$('[data-unsub]', box).forEach((el) => (el.onclick = async () => {
      try {
        await api('DELETE', '/api/student/submit/' + el.dataset.unsub);
        toast('التسليم اتلغى');
        renderSubmit();
      } catch (e) { toast(e.message); }
    }));
  }

  function submitSheet(taskId, replace) {
    sheet(`
      <h3>${replace ? 'استبدال التسليم' : 'تسليم المطلوب'}</h3>
      <p class="sub">ارفع ملف، أو حط لينك درايف لو الملف أكبر من ١٢٠ ميجا</p>

      <button class="big-sub" id="sb-file">
        <span style="color:var(--ink-3)">${ico("paperclip","ic-lg")}</span>
        <div><b>ارفع ملف</b><i>أقصى حجم ١٢٠ ميجا</i></div>
      </button>

      <div style="text-align:center;color:#93a1b8;font-size:12px;margin:14px 0">أو</div>

      <label class="field"><span>لينك درايف</span>
        <input id="sb-link" placeholder="https://drive.google.com/…" dir="ltr"></label>
      <div class="sheet-acts">
        <button class="btn ghost" data-close>إلغاء</button>
        <button class="btn primary" id="sb-send">تسليم</button>
      </div>`, () => {
      $('#sb-file').onclick = () => {
        closeSheet();
        pickAndUpload({
          max: 120 * 1024 * 1024,
          onDone: async (f) => {
            try {
              await api('POST', `/api/student/submit/${taskId}`, { fileId: f.id });
              toast('اتسلّم');
              renderSubmit();
            } catch (e) { toast(e.message); }
          },
        });
      };
      $('#sb-send').onclick = async () => {
        const link = $('#sb-link').value.trim();
        if (!link) return toast('حط لينك أو ارفع ملف');
        if (!/^https?:\/\//i.test(link)) return toast('اللينك لازم يبدأ بـ https://');
        try {
          await api('POST', `/api/student/submit/${taskId}`, { link });
          closeSheet();
          toast('اتسلّم');
          renderSubmit();
        } catch (e) { toast(e.message); }
      };
    });
  }

  /* ---------- ملفات المجموعة ---------- */

  async function renderGroupFiles() {
    const box = $('#stf-body');
    box.innerHTML = '<p style="text-align:center;color:#6b7a94;padding:30px">بنحمّل…</p>';
    let d;
    try { d = await api('GET', '/api/student/files'); } catch (e) {
      box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`; return;
    }
    if (!d.files.length) {
      box.innerHTML = `<div class="empty"><div class="e-ico">${ico("folder","ic-xl")}</div>
        <p>مفيش ملفات في مجموعتك لسه<br><small>ارفع أول ملف من الزرار فوق</small></p></div>`;
      return;
    }
    // تجميع حسب العضو
    const byOwner = {};
    d.files.forEach((f) => {
      const k = f.owner.id;
      (byOwner[k] = byOwner[k] || { owner: f.owner, files: [] }).files.push(f);
    });

    box.innerHTML = Object.values(byOwner).map((g) => `
      <div class="cls open">
        <div class="cls-head" style="cursor:default">
          <div class="avatar ${g.owner.mine ? 'lead' : ''}">${esc(initials(g.owner.name))}</div>
          <div style="flex:1;min-width:0">
            <b style="font-size:14px">${esc(g.owner.name)}${g.owner.mine ? ' (انت)' : ''}</b>
            <small style="font-size:11px;color:#6b7a94;display:block">${g.files.length} ملف</small>
          </div>
        </div>
        <div class="cls-body">
          ${g.files.map((f) => `
            <div class="mem">
              <div class="card-ico" style="width:32px;height:32px;border-radius:9px;background:#eef2f9;display:grid;place-items:center;color:#3a5f96">${ico("file","ic-sm")}</div>
              <div style="flex:1;min-width:0">
                <b style="font-size:12.5px;word-break:break-all">${esc(f.name)}</b>
                <small style="font-size:10.5px;color:#6b7a94">${sizeTxt(f.size)} · ${when(f.at)}</small>
              </div>
              <button class="chip blue" data-dl="${f.id}">تحميل</button>
              ${f.owner.mine ? `<button class="chip red" data-mine-del="${f.id}">مسح</button>` : ''}
            </div>`).join('')}
        </div>
      </div>`).join('');

    $$('[data-dl]', box).forEach((el) => (el.onclick = () => downloadFile(el.dataset.dl)));
    $$('[data-mine-del]', box).forEach((el) => (el.onclick = async () => {
      if (!confirm('تمسح الملف ده؟')) return;
      try {
        await api('DELETE', '/api/files/' + el.dataset.mineDel);
        toast('اتمسح');
        renderGroupFiles();
      } catch (e) { toast(e.message); }
    }));
  }

  $('#stf-up').onclick = () => pickAndUpload({
    max: 120 * 1024 * 1024,
    onDone: () => { toast('اترفع'); renderGroupFiles(); },
  });

  $('#st-logout').onclick = async () => {
    try { await api('POST', '/api/logout'); } catch (e) {}
    setToken('');
    st.role = null;
    st.student = null;
    st.channels = [];
    history = [];
    resetTo('screen-home');
  };

  /* ---------------- أدوات الملفات ---------------- */

  function sizeTxt(n) {
    if (!n) return '0';
    if (n < 1024) return n + ' بايت';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' ك.ب';
    return (n / 1024 / 1024).toFixed(1) + ' م.ب';
  }

  /** بتنزّل الملف بتوكن — عشان الحماية تفضل شغالة */
  async function downloadFile(id) {
    try {
      const r = await fetch(apiBase() + '/api/files/' + id, {
        headers: { Authorization: 'Bearer ' + token() },
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'مش قادر تنزّل الملف');
      }
      const blob = await r.blob();
      const cd = r.headers.get('content-disposition') || '';
      const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
      const name = m ? decodeURIComponent(m[1]) : 'ملف';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { toast(e.message); }
  }

  /** اختيار ملف ورفعه بالتدريج مع رسالة الحجم */
  function pickAndUpload(opt) {
    const inp = $('#pick-file');
    inp.value = '';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      if (f.size > opt.max) {
        return toast('الملف أكبر من ١٢٠ ميجا — اضغطه أو ارفعه على درايف وحط اللينك');
      }
      const t = toast('بنرفع… ' + sizeTxt(f.size), 60000);
      fetch(apiBase() + '/api/files', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token(),
          'Content-Type': f.type || 'application/octet-stream',
          'X-Filename': encodeURIComponent(f.name),
        },
        body: f,
      }).then((r) => r.json().then((j) => {
        clearTimeout(toast._t);
        document.querySelector('#toast').classList.remove('on');
        if (!r.ok) throw new Error(j.error || 'فشل الرفع');
        return j;
      })).then((j) => opt.onDone(j)).catch((e) => {
        document.querySelector('#toast').classList.remove('on');
        toast(e.message);
      });
      void t;
    };
    inp.click();
  }

  /* ---------------- الشيت ---------------- */

  let sheetEl = null;
  function sheet(html, after) {
    closeSheet();
    const bg = document.createElement('div');
    bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet">${html}</div>`;
    document.body.appendChild(bg);
    sheetEl = bg;
    requestAnimationFrame(() => bg.classList.add('on'));
    bg.addEventListener('click', (e) => {
      if (e.target === bg || e.target.hasAttribute('data-close')) closeSheet();
    });
    if (after) after();
  }
  function closeSheet() {
    if (sheetEl) { sheetEl.remove(); sheetEl = null; }
  }

  /* ---------------- تشغيل ---------------- */

  boot();
  window.ZApp = { show, back, resetTo, state: st, render: () => {
    if (st.role === 'teacher') renderTeacherHome();
    else if (st.role === 'student') renderStudent();
  } };
})();
