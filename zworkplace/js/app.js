'use strict';
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
  };

  /* ---------------- أدوات ---------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('on'), 2400);
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

  function apiBase() {
    const b = (typeof window !== 'undefined' && window.ZAPI) ? String(window.ZAPI) : '';
    return b.replace(/\/+$/, '');
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
      $('#pd-title').textContent = 'طلبك اتبعت ✅';
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

  $('#th-logout').onclick = async () => {
    try { await api('POST', '/api/logout'); } catch (e) {}
    setToken('');
    st.role = null;
    st.teacher = null;
    history = [];
    resetTo('screen-home');
  };

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
          <div class="e-ico">🗂️</div>
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
          <div class="cls-ico">🏫</div>
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
            ${m.isLeader ? '★' : esc(initials(m.name))}
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
      toast(remove ? 'الشارة اتشالت' : 'الشارة اتمنحت ★');
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
          toast('الفصل اتعمل ✅');
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
          toast('المجموعة اتعملت ✅');
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
      box.innerHTML = `<div class="empty"><div class="e-ico">⚠️</div><p>${esc(e.message)}</p></div>`;
      return;
    }
    if (!data.rows.length) {
      box.innerHTML = `<div class="empty"><div class="e-ico">${st.reqStatus === 'pending' ? '🔔' : '📭'}</div>
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
          ? '★ المجموعة دي مفيهاش قائد — قبول الطالب هنا هيمنحه شارة القيادة تلقائيًا.'
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
          toast('اتقبل واتحط في المجموعة ✅');
          loadRequests();
        } catch (e) { toast(e.message); }
      };
    });
  }

  /* ---------------- التواصل ---------------- */

  $$('#comm-tabs .tab').forEach((t) => (t.onclick = () => {
    st.commTab = t.dataset.t;
    st.chatWith = null;
    $$('#comm-tabs .tab').forEach((x) => x.classList.toggle('on', x === t));
    renderComm();
  }));

  async function renderComm() {
    const box = $('#comm-body');
    if (st.commTab === 'ann') return renderAnnounce(box);
    return renderChatList(box);
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
        </div>`).join('') : '<div class="empty"><div class="e-ico">📢</div><p>مفيش إعلانات لسه</p></div>'}`;

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
      box.innerHTML = '<div class="empty"><div class="e-ico">💬</div><p>مفيش طلاب مفعّلين لسه</p></div>';
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
          : '<div class="empty"><div class="e-ico">💬</div><p>مفيش رسايل لسه — ابدأي</p></div>'}
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

  /* ---------------- الملفات ---------------- */

  async function renderFiles() {
    const box = $('#files-body');
    box.innerHTML = `
      <div class="empty">
        <div class="e-ico">📁</div>
        <p><b>مساحة الملفات — المرحلة الجاية</b></p>
        <p style="margin-top:10px;font-size:12.5px">
          هتشوفي كل فصل ← المجموعة ← كل عضو وملفاته.<br>
          رفع أي نوع ملف وبأي حجم، ومجلد لكل عضو.
        </p>
      </div>`;
  }

  /* ---------------- الطالب ---------------- */

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
        <div class="mc-cell"><span>دورك</span><b class="${s.isLeader ? 'gold' : ''}">${s.isLeader ? '★ قائد' : 'عضو'}</b></div>
        <div class="mc-cell"><span>الحساب</span><b>مفعّل</b></div>
      </div>`;

    $('#st-ann').innerHTML = d.announcements.length
      ? d.announcements.map((a) => `
        <div class="msg"><div class="m-body">${esc(a.body)}</div>
          <div class="m-meta"><span>${a.scope === 'leaders' ? 'لقادة المجموعات' : 'للجميع'}</span><span>${when(a.at)}</span></div>
        </div>`).join('')
      : '<div class="empty"><div class="e-ico">📢</div><p>مفيش إعلانات لسه</p></div>';

    $('#st-chat').innerHTML = d.chat.length
      ? d.chat.map((m) => `
        <div class="msg mine"><div class="m-body">${esc(m.body)}</div>
          <div class="m-meta"><span>${when(m.at)}</span><span>مس أسماء</span></div></div>`).join('')
      : '<div class="empty"><div class="e-ico">💬</div><p>مفيش رسايل لسه</p></div>';
  }

  $('#st-logout').onclick = async () => {
    try { await api('POST', '/api/logout'); } catch (e) {}
    setToken('');
    st.role = null;
    st.student = null;
    history = [];
    resetTo('screen-home');
  };

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
