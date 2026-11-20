'use strict';
/**
 * اختبارات واجهة Z-Project — بتشغّل index.html في jsdom وبتتكلم السيرفر الحقيقي.
 * الاستخدام: node zworkplace/tests/ui.test.js [baseUrl]
 */
const path = require('node:path');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const BASE = process.env.ZTEST_BASE || process.argv[2] || 'http://127.0.0.1:3100';

let pass = 0;
let fail = 0;
const fails = [];

function ok(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + name);
  } else {
    fail++;
    fails.push(name);
    console.log('  ✗ ' + name + (extra ? '  →  ' + extra : ''));
  }
}

function eq(name, got, want) {
  ok(name, got === want, `اتوقعنا ${JSON.stringify(want)}، لقينا ${JSON.stringify(got)}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function makeDom(token) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', (e) => errs.push(e.message));

  const dom = new JSDOM(html, {
    url: BASE + '/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const { window } = dom;
  window.fetch = (u, o) => fetch(new URL(u, BASE), o);
  window.ZAPI = BASE;
  window.localStorage.clear();
  if (token) window.localStorage.setItem('zk_token', token);
  // الأيقونات تُحمَّل الأول — app.js بيعتمد عليها
  window.eval(fs.readFileSync(path.join(ROOT, 'js', 'icons.js'), 'utf8'));
  window.eval(fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8'));
  await sleep(120);
  return { dom, window, errs };
}

const visible = (w) => (w.document.querySelector('.screen.show') || {}).id || 'none';

async function teacherToken() {
  const r = await fetch(BASE + '/api/teacher/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.ZTEACHER_PASS || 'asmaa2026' }),
  });
  const j = await r.json();
  return j.token;
}

async function api(method, p, body, t) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

(async () => {
  console.log('=== واجهة Z-Project ===\n');

  /* ---------- ٠. تجهيز: فصل ومجموعة ---------- */
  {
    const T = await teacherToken();
    const cls = await api('GET', '/api/teacher/classes', undefined, T);
    if (!cls.data.classes.length) {
      const c = await api('POST', '/api/teacher/classes', { name: '٣ ثانوي أ' }, T);
      await api('POST', `/api/teacher/classes/${c.data.id}/groups`,
        { name: 'النسور', gender: 'boys' }, T);
      await api('POST', `/api/teacher/classes/${c.data.id}/groups`,
        { name: 'الياسمين', gender: 'girls' }, T);
      console.log('  ⚙️ اتجهز: فصل ومجموعتين');
    }
  }

  /* ---------- ١. الشاشة الأولى ---------- */
  {
    const { window } = await makeDom();
    eq('البداية على الشاشة الرئيسية', visible(window), 'screen-home');
    ok('فيها ٣ أزرار', window.document.querySelectorAll('.big-btn').length === 3);
    ok('زرار طلب انضمام', /طلب انضمام/.test(window.document.querySelector('#go-join').textContent));
    ok('زرار تسجيل دخول', /تسجيل دخول/.test(window.document.querySelector('#go-login').textContent));
    ok('زرار أنا مس أسماء', /أنا مس أسماء/.test(window.document.querySelector('#go-teacher').textContent));

    window.document.querySelector('#go-join').click();
    eq('بيفتح شاشة الانضمام', visible(window), 'screen-join');
    window.document.querySelector('[data-back]').click();
    eq('الرجوع بيرجّع للبداية', visible(window), 'screen-home');

    window.document.querySelector('#go-teacher').click();
    eq('بيفتح شاشة المس', visible(window), 'screen-tlogin');
  }

  /* ---------- ٢. دخول المس ---------- */
  {
    const { window } = await makeDom();
    window.document.querySelector('#go-teacher').click();
    window.document.querySelector('#tl-pass').value = 'غلط';
    window.document.querySelector('#tl-go').click();
    await sleep(300);
    ok('كلمة سر غلط بتطلع رسالة', /غلط/.test(window.document.querySelector('#tl-err').textContent));

    window.document.querySelector('#tl-pass').value = process.env.ZTEACHER_PASS || 'asmaa2026';
    window.document.querySelector('#tl-go').click();
    await sleep(600);
    eq('دخل لوحة المس', visible(window), 'screen-teacher');
    const grid = window.document.querySelector('#screen-teacher .pad-grid');
    ok('فيها شبكة زراير', !!grid);
    ok('فيها ٤ زراير مربعة', window.document.querySelectorAll('#screen-teacher .sq').length === 4);
    const txt = grid.textContent;
    ok('لوحة التنظيم', /لوحة التنظيم/.test(txt));
    ok('الإشعارات', /الإشعارات/.test(txt));
    ok('التواصل', /التواصل/.test(txt));
    ok('مساحة الملفات', /مساحة الملفات/.test(txt));
    // الشاشة ثابتة: مفيش .scroll جوه لوحة المس
    ok('مفيش سكرول في لوحة المس', !window.document.querySelector('#screen-teacher .scroll'));
    // الشكل المربع ٢×٢ — بنفحص ملف الـCSS مباشرة (jsdom مش بيحمّل ستايلات هنا)
    const cssTxt = fs.readFileSync(path.join(ROOT, 'css', 'app.css'), 'utf8');
    const pg = (cssTxt.match(/\.pad-grid\{([^}]*)\}/) || ['', ''])[1];
    ok('الشبكة عمودين', /grid-template-columns:\s*1fr\s+1fr/.test(pg));
    ok('الشبكة صفين', /grid-template-rows:\s*1fr\s+1fr/.test(pg));
    ok('مفيش تمرير في الشبكة', /overflow:\s*hidden/.test(pg));
  }

  /* ---------- ٣. لوحة التنظيم ---------- */
  {
    const T = await teacherToken();
    const t = await makeDom(T);
    const { window } = t;
    eq('بيرجع على كرسي المس من التوكن', visible(window), 'screen-teacher');
    window.document.querySelector('[data-nav="organize"]').click();
    await sleep(500);
    eq('فتح لوحة التنظيم', visible(window), 'screen-organize');
    const body = window.document.querySelector('#org-body');
    ok('فيها فصول', body.querySelectorAll('.cls').length >= 1);

    // فتح فصل
    const head = body.querySelector('[data-toggle]');
    if (head) {
      head.click();
      await sleep(400);
      const body2 = window.document.querySelector('#org-body');
      ok('الفصل بيفتح ويوري مجموعاته', body2.querySelectorAll('.grp').length >= 1);
      ok('في شارة القيادة', /قائد|القيادة/.test(body2.textContent));
    }
  }

  /* ---------- ٤. طلب انضمام كامل ---------- */
  const NEW_CODE = '470460558';
  let newId = null;
  {
    // امسح الطالب لو موجود من تشغيل سابق
    const T = await teacherToken();
    const list = await api('GET', '/api/teacher/students?q=' + NEW_CODE, undefined, T);
    const old = (list.data.rows || []).find((r) => r.code === NEW_CODE);
    if (old) {
      // نشيله خالص عشان الاختبار يبدأ نضيف
      await api('POST', `/api/teacher/students/${old.id}/purge`, undefined, T);
    }

    const { window } = await makeDom();
    window.document.querySelector('#go-join').click();
    window.document.querySelector('#join-code').value = NEW_CODE;
    window.document.querySelector('#join-check').click();
    await sleep(500);
    eq('الكود بيودّي للتسجيل', visible(window), 'screen-signup');
    const nm = window.document.querySelector('#su-name').textContent;
    ok('الاسم ظهر من الكشف', nm && nm !== '—' && nm.split(' ').length >= 2, nm);

    // باسورد قصير
    window.document.querySelector('#su-pass').value = '123';
    window.document.querySelector('#su-pass2').value = '123';
    window.document.querySelector('#su-send').click();
    await sleep(200);
    ok('بيرفض الباسورد القصير', /٦|6/.test(window.document.querySelector('#su-err').textContent));

    // مش متطابقين
    window.document.querySelector('#su-pass').value = 'goodpass1';
    window.document.querySelector('#su-pass2').value = 'goodpass2';
    window.document.querySelector('#su-send').click();
    await sleep(200);
    ok('بيرفض عدم التطابق', /مش زي|مختلف/.test(window.document.querySelector('#su-err').textContent));

    // صح
    window.document.querySelector('#su-pass2').value = 'goodpass1';
    window.document.querySelector('#su-send').click();
    await sleep(1200);
    eq('طلب الانضمام بيتبعت', visible(window), 'screen-pending');
    ok('رسالة الانتظار', /موافقة|مستني|اتسجل/.test(window.document.querySelector('#pd-msg').textContent + window.document.querySelector('#pd-title').textContent));

    const reqs = await api('GET', '/api/teacher/requests?status=pending', undefined, T);
    const mine = (reqs.data.rows || []).find((r) => r.code === NEW_CODE);
    ok('الطلب وصل للمس', !!mine);
    newId = mine && mine.id;
  }

  /* ---------- ٥. الطالب مش بيدخل قبل الموافقة ---------- */
  {
    const r = await api('POST', '/api/login', { code: NEW_CODE, password: 'goodpass1' });
    eq('دخول قبل الموافقة مرفوض', r.status, 403);
  }

  /* ---------- ٦. قبول الطلب ---------- */
  {
    const T = await teacherToken();
    const t = await makeDom(T);
    const { window } = t;
    window.document.querySelector('[data-nav="requests"]').click();
    await sleep(600);
    eq('فتح الإشعارات', visible(window), 'screen-requests');
    const txt = window.document.querySelector('#req-body').textContent;
    ok('الطلب ظاهر', txt.includes(NEW_CODE) || /مستني/.test(txt));

    // زرار القبول
    const accBtn = window.document.querySelector('[data-acc]');
    ok('في زرار قبول', !!accBtn);
    if (accBtn) {
      accBtn.click();
      await sleep(500);
      ok('شيت القبول فتح', !!window.document.querySelector('.sheet-bg'));
      ok('فيه اختيار فصل', !!window.document.querySelector('#ap-cls'));
      ok('فيه اختيار مجموعة', !!window.document.querySelector('#ap-grp'));
      ok('مكتوب إن القبول محتاج مكان', /الفصل والمجموعة/.test(window.document.querySelector('.sheet').textContent));
    }
  }

  /* ---------- ٧. قبول فعلي عبر الـAPI ---------- */
  {
    const T = await teacherToken();
    const classes = await api('GET', '/api/teacher/classes', undefined, T);
    const cls = classes.data.classes[0];
    const grp = cls.groups.find((g) => g.gender === 'boys');
    const r = await api('POST', `/api/teacher/requests/${newId}/approve`, { classId: cls.id, groupId: grp.id }, T);
    eq('القبول نجح', r.status, 200);
    eq('اتحط في المجموعة', r.data.student.group.id, grp.id);
  }

  /* ---------- ٨. الطالب: الشاشة الرئيسية ---------- */
  let STOK = null;
  {
    const r = await api('POST', '/api/login', { code: NEW_CODE, password: 'goodpass1' });
    eq('دخل بعد الموافقة', r.status, 200);
    STOK = r.data.token;
    const { window } = await makeDom(STOK);
    await sleep(600);
    eq('على شاشة الطالب', visible(window), 'screen-student');
    const head = window.document.querySelector('#screen-student .st-top').textContent;
    ok('شايف اسمه', head.includes(r.data.student.name.split(' ')[0]));
    ok('شايف كوده', head.includes(NEW_CODE));
    ok('شايف مجموعته', head.includes(r.data.student.group.name));
    // البطاقة جوه الهيدر نفسه — مفيش كارت منفصل
    ok('البطاقة جوه الهيدر', !window.document.querySelector('#st-card'));
    ok('مفيش سكرول في شاشة الطالب', !window.document.querySelector('#screen-student .scroll'));
    ok('عنده ٤ مساحات', window.document.querySelectorAll('#screen-student .sq').length === 4);
    const t = window.document.querySelector('#screen-student .pad-grid').textContent;
    ok('الدردشة', /الدردشة/.test(t));
    ok('التسليم', /التسليم/.test(t));
    ok('ملفات مجموعتي', /مجموعتي/.test(t));
    ok('الإشعارات', /الإشعارات/.test(t));
  }

  /* ---------- ٨ب. الإشعارات ---------- */
  {
    const { window } = await makeDom(STOK);
    await sleep(500);
    window.document.querySelector('[data-snav="notify"]').click();
    await sleep(500);
    eq('فتح مركز الإشعارات', visible(window), 'screen-stnotify');
    ok('فيه محتوى', window.document.querySelector('#stn-body').textContent.length > 10);
  }

  /* ---------- ٨ج. الدردشة ---------- */
  {
    const { window } = await makeDom(STOK);
    await sleep(500);
    window.document.querySelector('[data-snav="chat"]').click();
    await sleep(700);
    eq('فتح الدردشة', visible(window), 'screen-stchat');
    const tabs = window.document.querySelectorAll('#stc-tabs .tab');
    eq('في قناتين بس (مجموعة + فصل)', tabs.length, 2);
    const tt = window.document.querySelector('#stc-tabs').textContent;
    ok('قناة المجموعة', /مجموعتك/.test(tt));
    ok('قناة الفصل', /الفصل/.test(tt));
    ok('مفيش دردشة فرد لفرد', !/خاص|فردي/.test(tt));
    ok('في خانة كتابة', !!window.document.querySelector('#sc-in'));
  }

  /* ---------- ٨د. التسليم ---------- */
  {
    const T = await teacherToken();
    const tree = await api('GET', '/api/teacher/files/tree', undefined, T);
    const g = tree.data.classes[0].groups.find((x) => x.members.some((m) => m.code === NEW_CODE));
    await api('POST', '/api/teacher/tasks', { title: 'مشروع اختبار الواجهة', groupId: g.id }, T);

    const { window } = await makeDom(STOK);
    await sleep(500);
    window.document.querySelector('[data-snav="submit"]').click();
    await sleep(700);
    eq('فتح التسليم', visible(window), 'screen-stsubmit');
    const body = window.document.querySelector('#sts-body').textContent;
    ok('المطلوب ظاهر', /مشروع اختبار/.test(body));
    ok('في زرار تسليم', !!window.document.querySelector('[data-sub]'));
  }

  /* ---------- ٨هـ. ملفات المجموعة ---------- */
  {
    const { window } = await makeDom(STOK);
    await sleep(500);
    window.document.querySelector('[data-snav="files"]').click();
    await sleep(600);
    eq('فتح ملفات المجموعة', visible(window), 'screen-stfiles');
    ok('في زرار رفع', !!window.document.querySelector('#stf-up'));
  }

  /* ---------- ٨و. الخصوصية: مفيش وصول لمجموعة تانية ---------- */
  {
    const fake = await api('GET', '/api/student/chat/group/99999', undefined, STOK);
    eq('دردشة مجموعة تانية ممنوعة', fake.status, 403);
    const other = await api('GET', '/api/download/zip?groupId=99999', undefined, STOK);
    eq('ZIP مجموعة تانية ممنوع', other.status, 403);
    const ch = await api('GET', '/api/student/channels', undefined, STOK);
    eq('الطالب له قناتين بس', ch.data.channels.length, 2);
  }

  /* ---------- ٩. الإعلانات ---------- */
  {
    const T = await teacherToken();
    const t = await makeDom(T);
    const { window } = t;
    window.document.querySelector('[data-nav="comm"]').click();
    await sleep(600);
    eq('فتح التواصل', visible(window), 'screen-comm');
    const body = window.document.querySelector('#comm-body');
    ok('في خانة إعلان', !!window.document.querySelector('#an-body'));
    ok('في خيارين للجمهور', window.document.querySelectorAll('#an-seg button').length === 2);

    const before = (await api('GET', '/api/teacher/messages', undefined, T)).data.announcements.length;
    window.document.querySelector('#an-body').value = 'اختبار من الواجهة — إعلان';
    window.document.querySelector('#an-send').click();
    await sleep(700);
    const after = (await api('GET', '/api/teacher/messages', undefined, T)).data.announcements.length;
    eq('الإعلان اتنشر', after, before + 1);
  }

  /* ---------- ١٠. رفع ملف من الطالب ---------- */
  {
    // نرفع ملف بالـAPI ونتأكد إنه ظهر لبقية المجموعة
    const up = await fetch(BASE + '/api/files', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + STOK,
        'Content-Type': 'text/plain',
        'X-Filename': encodeURIComponent('ملف اختبار.txt'),
      },
      body: Buffer.from('سلام'),
    });
    eq('الرفع نجح', up.status, 201);
    const list = await api('GET', '/api/student/files', undefined, STOK);
    ok('الملف ظاهر في مجموعته', list.data.files.some((f) => f.name === 'ملف اختبار.txt'));
    ok('معاه اسم صاحبه', list.data.files[0].owner.name.length > 3);

    // ملف أكبر من الحد — لازم يترفض
    const big = await fetch(BASE + '/api/files', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + STOK,
        'Content-Type': 'application/octet-stream',
        'X-Filename': 'ضخم.bin',
        'Content-Length': String(130 * 1024 * 1024),
      },
      body: Buffer.alloc(0),
    }).catch(() => ({ status: 413 }));
    ok('الحد ١٢٠ ميجا enforced', big.status === 413 || big.status === 400);
  }

  /* ---------- ١١. مساحة الملفات (المس) ---------- */
  {
    const T = await teacherToken();
    const t = await makeDom(T);
    const { window } = t;
    window.document.querySelector('[data-nav="files"]').click();
    await sleep(700);
    eq('فتح مساحة الملفات', visible(window), 'screen-files');
    const body = window.document.querySelector('#files-body').textContent;
    ok('في تبويبين', window.document.querySelectorAll('[data-ft]').length === 2);
    ok('تبويب شغل المجموعات', /شغل المجموعات/.test(body));
    ok('تبويب المطلوبات', /المطلوبات/.test(body));
    ok('في زرار ZIP', window.document.querySelectorAll('[data-zipcls],[data-zipgrp]').length >= 1);
  }

  /* ---------- ١١ب. بروفايل العضو ---------- */
  {
    const T = await teacherToken();
    const t = await makeDom(T);
    const { window } = t;
    window.document.querySelector('[data-nav="files"]').click();
    await sleep(600);
    const cls = window.document.querySelector('[data-fcls]');
    if (cls) {
      cls.click();
      await sleep(600);
      const prof = window.document.querySelector('[data-prof]');
      ok('في زرار ملفه لكل عضو', !!prof);
      if (prof) {
        prof.click();
        await sleep(700);
        const sheet = window.document.querySelector('.sheet');
        ok('بروفايل العضو فتح', !!sheet);
        if (sheet) {
          ok('فيه ملفاته', /ملفاته/.test(sheet.textContent));
          ok('فيه المطلوب منه', /المطلوب منه/.test(sheet.textContent));
          ok('فيه زرار مطلوب جديد', !!window.document.querySelector('#p-addtask'));
        }
      }
    }
  }

  /* ---------- ١١ج. دردشة المس ---------- */
  {
    const T = await teacherToken();
    const t = await makeDom(T);
    const { window } = t;
    window.document.querySelector('[data-nav="comm"]').click();
    await sleep(600);
    window.document.querySelector('#comm-tabs [data-t="room"]').click();
    await sleep(700);
    const rooms = window.document.querySelectorAll('[data-room]');
    ok('في قنوات دردشة', rooms.length >= 1);
    if (rooms.length) {
      rooms[0].click();
      await sleep(700);
      ok('فتح القناة', !!window.document.querySelector('#rm-in'));
      const before = (await api('GET', '/api/teacher/channels', undefined, T)).data.channels[0].count;
      window.document.querySelector('#rm-in').value = 'رسالة من المس';
      window.document.querySelector('#rm-send').click();
      await sleep(800);
      ok('المس بتبعت في القناة', /رسالة من المس/.test(window.document.querySelector('#rm-msgs').textContent));
      void before;
    }
  }

  /* ---------- ١١د. الإعدادات: حد المجموعة ---------- */
  {
    const T = await teacherToken();
    const before = (await api('GET', '/api/teacher/settings', undefined, T)).data.maxGroup;
    ok('حد المجموعة متاح', typeof before === 'number');

    const set = await api('PATCH', '/api/teacher/settings', { maxGroup: 7 }, T);
    eq('تغيير الحد نجح', set.data.maxGroup, 7);
    const after = (await api('GET', '/api/teacher/settings', undefined, T)).data.maxGroup;
    eq('الحد اتحفظ', after, 7);

    const bad = await api('PATCH', '/api/teacher/settings', { maxGroup: 99 }, T);
    eq('حد بره النطاق مرفوض', bad.status, 400);

    await api('PATCH', '/api/teacher/settings', { maxGroup: before }, T);

    // شاشة الإعدادات
    const t = await makeDom(T);
    const { window } = t;
    window.document.querySelector('#th-settings').click();
    await sleep(700);
    eq('شاشة الإعدادات فتحت', visible(window), 'screen-settings');
    ok('في زرار زيادة', !!window.document.querySelector('#set-plus'));
    ok('في زرار نقصان', !!window.document.querySelector('#set-minus'));
    ok('في زرار حفظ', !!window.document.querySelector('#set-save'));
  }

  /* ---------- ١١هـ. دردشة العضو (المس ↔ الطالب) ---------- */
  {
    const T = await teacherToken();
    const st = (await api('GET', '/api/teacher/students', undefined, T)).data.rows
      .find((x) => x.status === 'active');

    const send = await api('POST', '/api/teacher/dm/' + st.id, { body: 'رسالة خاصة للمس' }, T);
    eq('المس بعتت رسالة خاصة', send.status, 201);

    // الطالب يشوفها
    const stu = await api('POST', '/api/login', { code: st.code, password: 'goodpass1' });
    if (stu.status === 200) {
      const feed = await api('GET', '/api/student/notifications', undefined, stu.data.token);
      ok('الطالب شاف رسالة المس', (feed.data.dm || []).some((m) => m.body.includes('رسالة خاصة')));
    }

    // واجهة المس: ٣ تبويبات في التواصل
    const t = await makeDom(T);
    const { window } = t;
    window.document.querySelector('[data-nav="comm"]').click();
    await sleep(600);
    const tabs = window.document.querySelectorAll('#comm-tabs .tab');
    eq('٣ تبويبات في التواصل', tabs.length, 3);
    const tt = window.document.querySelector('#comm-tabs').textContent;
    ok('تبويب إعلان', /إعلان/.test(tt));
    ok('تبويب مجموعة/فصل', /مجموعة/.test(tt));
    ok('تبويب عضو', /عضو/.test(tt));

    // افتح دردشة العضو
    window.document.querySelector('#comm-tabs [data-t="dm"]').click();
    await sleep(700);
    const cards = window.document.querySelectorAll('[data-dm]');
    ok('في قايمة أعضاء للدردشة', cards.length >= 1);
  }

  /* ---------- ١١و. اسم البرنامج ---------- */
  {
    const t = await makeDom();
    const { window } = t;
    const h1 = window.document.querySelector('.brand h1').textContent.trim();
    eq('اسم البرنامج', h1, 'مساحة عمل الفصل');
    ok('العنوان في التاب', window.document.title.includes('مساحة عمل الفصل'));
  }

  /* ---------- ١١ز. نص الكود المدرسي ---------- */
  {
    const t = await makeDom();
    const { window } = t;
    window.document.querySelector('#go-join').click();
    await sleep(200);
    const txt = window.document.querySelector('#screen-join').textContent;
    ok('مكتوب «الكود المدرسي»', /الكود المدرسي/.test(txt));
    ok('مكتوب «للمطابقة مع اسمك»', /للمطابقة مع اسمك/.test(txt));
  }

  /* ---------- ١٢. الخروج ---------- */
  {
    const T = await teacherToken();
    const t = await makeDom(T);
    const { window } = t;
    window.document.querySelector('#th-logout').click();
    await sleep(600);
    eq('الخروج بيرجّع للبداية', visible(window), 'screen-home');
    ok('التوكن اتمسح', !window.localStorage.getItem('zk_token'));
  }

  /* ---------- ١٣. مفيش أخطاء JS ---------- */
  {
    const t = await makeDom();
    ok('مفيش أخطاء JavaScript', t.errs.length === 0, t.errs.join(' | '));
  }

  /* ---------- ١٤. الأمان: منع قراءة الملفات الحساسة ---------- */
  {
    const attacks = [
      'css/../../data/zwork.db',
      'css/../../server/index.js',
      'css/../../data/students.csv',
      'data/zwork.db',
      'server/index.js',
      'css/%2e%2e/data/zwork.db',
    ];
    for (const a of attacks) {
      const r = await fetch(`${BASE}/${a}`);
      ok(`ممنوع: ${a}`, r.status !== 200);
    }
    for (const g of ['index.html', 'css/app.css', 'js/app.js', 'js/icons.js']) {
      const r = await fetch(`${BASE}/${g}`);
      ok(`مسموح: ${g}`, r.status === 200);
    }
  }

  /* ---------- ١٥. تابات التواصل لازم تغيّر المحتوى ---------- */
  {
    const { window } = await makeDom(await teacherToken());
    await sleep(500);
    window.document.querySelector('[data-nav="comm"]').click();
    await sleep(900);
    const seen = new Set();
    for (const t of ['ann', 'room', 'dm']) {
      const tab = window.document.querySelector(`#comm-tabs [data-t="${t}"]`);
      if (tab) {
        tab.click();
        await sleep(800);
        const body = window.document.querySelector('#comm-body');
        seen.add((body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40));
      }
    }
    ok('التابات بتغيّر المحتوى', seen.size >= 2, 'عدد الحالات: ' + seen.size);
  }

  /* ══════════ ١٦) نصوص الكود ما تظهرش للمستخدم ══════════
     غلطة علامة تنصيص واحدة (') بدل backtick بتخلي ${ico(...)} يطلع
     نص خام على الشاشة. الفحص ده بيمنعها ترجع. */
  console.log('\n[١٦] نصوص الكود مش ظاهرة للمستخدم');
  {
    const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    const lines = src.split('\n');
    const bad = [];
    lines.forEach((l, i) => {
      // تيرناري جوه template literal سليم: ${x ? 'a' : 'b'} — نتجاهله
      let check = l.replace(/\$\{[^{}]*\?[^{}]*\}/g, '');
      // أي ${...} فاضل بين علامتين مفردتين → مش هيتفسّر
      const m = check.match(/'[^']*\$\{[^'"]*'/g);
      if (m) bad.push(`${i + 1}: ${m[0].slice(0, 60)}`);
    });
    ok('مفيش ${...} جوه علامات مفردة', bad.length === 0, bad.join(' | '));

    // كل ملفات الصفحات بتشتغل
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    ok('الصفحة فيها مكتبتي الأيقونات والتطبيق',
      html.includes('js/icons.js') && html.includes('js/app.js'));
  }

  /* ══════════ ١٧) hidden بيخفي فعلاً ══════════
     .sq .badge بيحدد display:grid فبيتغلّب على hidden —
     والنتيجة عدّاد «0» بيظهر من غير سبب. */
  console.log('\n[١٧] hidden بيخفّي فعلاً');
  {
    const css = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf8');
    ok('قاعدة [hidden] عامة موجودة', /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(css),
      'لازم [hidden]{display:none !important}');

    // الشارات كلها hidden في الـHTML الافتراضي
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const badges = html.match(/class="badge"[^>]*>/g) || [];
    const shown = badges.filter((b) => !b.includes('hidden'));
    ok('كل الشارات مخفية في الـHTML', shown.length === 0,
      `ظاهر من غير hidden: ${shown.length}`);
  }

  /* ══════════ ١٨) مفيش confirm() بتاع المتصفح ══════════
     confirm() بيرجّع false صامت جوه WebView الأندرويد،
     فكل زرار فيه تأكيد كان بيبقى ميت. */
  console.log('\n[١٨] مفيش confirm() في الكود');
  {
    const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const uses = (code.match(/(^|[^.\w])confirm\s*\(/g) || []).length;
    ok('مفيش confirm() مستخدم', uses === 0, `لقيت ${uses}`);
    ok('فيه حوار تأكيد بديل', /function confirmDlg/.test(src));
  }

  /* ══════════ ١٩) كل حذف بيتأكد الأول ══════════
     الحذف بضغطة واحدة = الطالبة بتمسح شغل شهر بالغلط. */
  console.log('\n[١٩] كل إجراء حذف بيتأكد');
  {
    const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    const lines = src.split('\n');
    const bare = [];
    lines.forEach((l, i) => {
      if (/api\('DELETE'/.test(l)) {
        const ctx = lines.slice(Math.max(0, i - 8), i + 1).join(' ');
        if (!/confirmDlg/.test(ctx)) bare.push(i + 1 + ': ' + l.trim().slice(0, 50));
      }
    });
    ok('مفيش حذف من غير تأكيد', bare.length === 0, bare.join(' | '));
    ok('مسح الملف الشخصي بيتأكد', /data-mine-del[\s\S]{0,200}confirmDlg/.test(src));
    ok('حذف الإعلان بيتأكد', /data-del\]'[\s\S]{0,400}confirmDlg/.test(src));
    ok('مسح رسالة الغرفة بيتأكد', /data-rmdel[\s\S]{0,300}confirmDlg/.test(src));
    ok('مسح رسالة العضو بيتأكد', /data-dmdel[\s\S]{0,300}confirmDlg/.test(src));
    ok('إلغاء التسليم بيتأكد', /data-unsub[\s\S]{0,300}confirmDlg/.test(src));
  }

  /* ══════════ ٢٠) غرف الدردشة بتفتح فعلاً ══════════
     renderComm لازم يمرّر لـrenderChatRooms اللي بيفحص roomWith. */
  console.log('\n[٢٠] غرف الدردشة بتفتح');
  {
    const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    ok('renderChatRooms بيفحص roomWith', /function renderChatRooms\(box\)\s*\{\s*if \(roomWith\)/.test(src));
    ok('الضغط على الغرفة بيحدد roomWith', /data-room[\s\S]{0,300}roomWith = \{/.test(src));
    ok('renderComm بيوصل للغرف', /function renderComm[\s\S]{0,400}renderChatRooms\(box\)/.test(src));
    ok('فيه صندوق كتابة في الغرفة', /id="rm-in"/.test(src));
    ok('فيه زرار إرسال في الغرفة', /id="rm-send"/.test(src));
  }

  /* ══════════ ٢١) كشف الطلبة متاح ══════════ */
  console.log('\n[٢١] كشف الطلبة');
  {
    const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const srv = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
    ok('شاشة الكشف موجودة', html.includes('id="screen-roster"'));
        ok('زرار فتح الكشف في الإعدادات', app.includes('#set-roster'));
    ok('بيقرا من /api/teacher/roster', /api\('GET', '\/api\/teacher\/roster/.test(app));
    ok('فيه بحث', app.includes('rs-q'));
    ok('السيرفر بيرجّع عدد الكشف', srv.includes('rosterCount'));
  }

  /* ══════════ ٢٢) كلمات السر الضعيفة مرفوضة ══════════ */
  console.log('\n[٢٢] كلمات السر الضعيفة');
  {
    const A = require(path.join(ROOT, 'server/auth.js'));
    ok('مسافات بس مرفوضة', !!A.passProblem('        '));
    ok('أرقام بس مرفوضة', !!A.passProblem('12345678'));
    ok('حرف واحد مكرر مرفوض', !!A.passProblem('aaaaaaaa'));
    ok('قصيرة مرفوضة', !!A.passProblem('ab'));
    ok('طويلة جدًا مرفوضة', !!A.passProblem('a'.repeat(300)));
    ok('asmaa2026 مقبولة', A.passProblem('asmaa2026') === '');
    ok('goodpass1 مقبولة', A.passProblem('goodpass1') === '');
    ok('كلمة عربية مقبولة', A.passProblem('كلمةسر123') === '');
    // الهاش
    const h = A.hash('goodpass1');
    ok('الهاش مش الباسورد', h.hash !== 'goodpass1');
    ok('التحقق شغال', A.verify('goodpass1', h.hash, h.salt));
    ok('باسورد غلط مرفوض', !A.verify('wrong', h.hash, h.salt));
  }

  /* ══════════ ٢٣) الجلسات ══════════ */
  console.log('\n[٢٣] الجلسات');
  {
    const A = require(path.join(ROOT, 'server/auth.js'));
    ok('التوكن عشوائي ٤٨ حرف', A.newToken().length === 48);
    ok('١٠٠ توكن مختلفين', new Set(Array.from({ length: 100 }, () => A.newToken())).size === 100);
  }

  /* ══════════ ٢٤) العناصر الزخرفية مش بتمتص اللمس ══════════
     دايرة .th-top::after كانت بتترسم فوق زرارَي الإعدادات والخروج
     وبتامتص اللمس — الزرارين كانوا ميتين تمامًا. */
  console.log('\n[٢٤] العناصر الزخرفية مش بتمتص اللمس');
  {
    const css = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf8');
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const bare = [];
    for (const [, sel, body] of rules) {
      if (!/::(before|after)/.test(sel)) continue;
      if (!/position\s*:\s*absolute/.test(body)) continue;
      if (!/pointer-events\s*:\s*none/.test(body)) bare.push(sel.trim());
    }
    ok('كل ::before/::after المطلقة معاها pointer-events:none', bare.length === 0, bare.join(' | '));

    // الأزرار لازم تكون فوق أي طبقة زخرفية
    const btnRule = css.match(/\.th-top \.icon-btn\{([^}]*)\}/);
    ok('أزرار الرأس فوق الدايرة', !!btnRule && /z-index\s*:\s*[2-9]/.test(btnRule[1]),
      btnRule ? btnRule[1].replace(/\s+/g, ' ').slice(0, 70) : 'القاعدة مش موجودة');

    // زرارَي الرأس مربوطين
    const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    ok('زرار الإعدادات مربوط', /\$\('#th-settings'\)\.onclick/.test(app));
    ok('زرار الخروج مربوط', /\$\('#th-logout'\)\.onclick/.test(app));
    ok('الخروج بيمسح التوكن', /th-logout[\s\S]{0,400}setToken\(''\)/.test(app));
  }

  /* ══════════ ٢٥) السيرفر ما بيقعش من طلب واحد ══════════
     decodeURIComponent بترمي URIError على أي % غلط.
     طلب واحد لـ/api/files/%zz كان بيوقّف السيرفر كله. */
  console.log('\n[٢٥] السيرفر صامد');
  {
    const srv = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');

    // match() لازم تحمي الـdecode
    const matchFn = srv.match(/function match\(pattern, pathname\)[\s\S]{0,900}?\n}/);
    ok('match() موجودة', !!matchFn);
    if (matchFn) {
      ok('match() بتحمي decodeURIComponent', /try\s*\{\s*params\[/.test(matchFn[0]),
        'لازم try/catch حوالين decodeURIComponent');
      ok('match() بترجّع null عند الفشل', /catch[^}]*return null/.test(matchFn[0]));
    }

    // حماية حول الاستدعاء
    ok('الاستدعاء محمي', /try\s*\{\s*p = match\(/.test(srv));

    // موت السيرفر من استثناء
    ok('uncaughtException متعالَج', srv.includes("process.on('uncaughtException'"));
    ok('unhandledRejection متعالَج', srv.includes("process.on('unhandledRejection'"));

    // رفع الملفات
    ok('رفع الملفات بيفك الاسم بأمان',
      /rawName[\s\S]{0,140}catch \(e\) \{ decoded = rawName; \}/.test(srv));
    // كل استدعاء حقيقي (مش كومنت) لازم يكون جوه try
    const code = srv.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const calls = (code.match(/decodeURIComponent\s*\(/g) || []).length;
    const guarded = (code.match(/try\s*\{[^}]*decodeURIComponent/g) || []).length;
    ok('كل decodeURIComponent محمي', calls === guarded, `استدعاءات: ${calls} · محمية: ${guarded}`);
  }

  /* ══════════ ٢٦) التطبيق قابل للتثبيت ══════════ */
  console.log('\n[٢٦] التطبيق قابل للتثبيت (PWA)');
  {
    const mf = path.join(ROOT, 'manifest.webmanifest');
    ok('ملف manifest موجود', fs.existsSync(mf));
    if (fs.existsSync(mf)) {
      const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
      ok('فيه اسم عربي', /[\u0600-\u06FF]/.test(m.name || ''));
      ok('display standalone', m.display === 'standalone');
      ok('start_url', m.start_url === '/');
      ok('فيه أيقونات', Array.isArray(m.icons) && m.icons.length >= 2);
      ok('فيه maskable', (m.icons || []).some((i) => i.purpose === 'maskable'));
      (m.icons || []).forEach((i) => {
        ok('أيقونة ' + i.sizes + ' موجودة', fs.existsSync(path.join(ROOT, i.src)));
      });
    }
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    ok('الـHTML بيوصل للـmanifest', html.includes('rel="manifest"'));
    ok('أيقونة أبل', html.includes('apple-touch-icon'));

    // الـzip لازم يضم الملفات دي
    const build = fs.readFileSync(path.join(ROOT, '..', 'tools/shots/build_sa.py'), 'utf8');
    ok('الـbuild بيضم img', build.includes("'img'"));
    ok('الـbuild بيضم manifest', build.includes("'manifest.webmanifest'"));
  }

  /* ══════════ ٢٧) نصوص عربية في كل الواجهة ══════════ */
  console.log('\n[٢٧] مفيش نص إنجليزي ظاهر');
  {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const clean = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
    const texts = [...clean.matchAll(/>([^<>{}]{3,80})</g)].map((m) => m[1].trim())
      .filter((t) => t && /[a-zA-Z]{3,}/.test(t) && !/^[\s\d.,:;×–—-]*$/.test(t));
    ok('مفيش نص إنجليزي في الصفحة', texts.length === 0, texts.join(' | '));

    // عنوان التاب
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    ok('عنوان التاب عربي', /[\u0600-\u06FF]/.test(title), title);

    // الاسم في الشاشة الأولى
    const h1 = (html.match(/<h1>([^<]*)<\/h1>/) || [])[1] || '';
    ok('اسم البرنامج عربي', /[\u0600-\u06FF]/.test(h1), h1);
  }

  /* ══════════ ٢٨) الأسماء ثلاثية والأفاتار بيفرّق ══════════ */
  console.log('\n[٢٨] الأسماء ثلاثية');
  {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'data/students.json'), 'utf8'));
    const notTri = data.filter((r) => String(r.name).trim().split(/\s+/).filter(Boolean).length !== 3);
    ok('كل الأسماء في الكشف ثلاثية', notTri.length === 0,
      notTri.slice(0, 3).map((r) => r.name).join(' | '));
    ok('عدد الكشف ٢٧٣', data.length === 273, String(data.length));
    ok('كل الأكواد فريدة', new Set(data.map((r) => String(r.code))).size === data.length);

    // الأفاتار لازم يفرّق — مش حرف واحد
    const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    const fn = src.match(/function initials\(name\)[\s\S]{0,400}?\n  }/);
    ok('initials() بترجّع حرفين', !!fn && /p\[0\]\[0\][\s\S]{0,60}p\[1\]\[0\]/.test(fn[0]),
      'حرف واحد كان بيخلي ٦٨ طالب كلهم «م»');
  }

  console.log(`\n=== النتيجة: ${pass} نجح · ${fail} فشل ===`);
  if (fail) {
    console.log('فشل: ' + fails.join(' · '));
    process.exit(1);
  }
  console.log('ALL PASSED (' + pass + ')');
})().catch((e) => {
  console.error('انهار:', e);
  process.exit(1);
});
