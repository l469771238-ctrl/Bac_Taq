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
    ok('فيها ٤ بلاطات', window.document.querySelectorAll('#th-tiles .tile').length === 4);
    const txt = window.document.querySelector('#th-tiles').textContent;
    ok('لوحة التنظيم', /لوحة التنظيم/.test(txt));
    ok('الإشعارات', /الإشعارات/.test(txt));
    ok('التواصل', /التواصل/.test(txt));
    ok('مساحة الملفات', /مساحة الملفات/.test(txt));
    ok('الإحصائيات ظاهرة', /\d/.test(window.document.querySelector('#th-stats').textContent));
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
    await sleep(700);
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

  /* ---------- ٨. الطالب يدخل ويشوف حالته ---------- */
  {
    const r = await api('POST', '/api/login', { code: NEW_CODE, password: 'goodpass1' });
    eq('دخل بعد الموافقة', r.status, 200);
    const { window } = await makeDom(r.data.token);
    await sleep(500);
    eq('على شاشة الطالب', visible(window), 'screen-student');
    const card = window.document.querySelector('#st-card').textContent;
    ok('شايف اسمه', card.includes('احمد') || card.includes(r.data.student.name.split(' ')[0]));
    ok('شايف كوده', card.includes(NEW_CODE));
    ok('شايف مجموعته', card.includes(r.data.student.group.name));
    ok('شايف دوره', /عضو|قائد/.test(card));
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

  /* ---------- ١٠. الدردشة ---------- */
  {
    const T = await teacherToken();
    const t = await makeDom(T);
    const { window } = t;
    window.document.querySelector('[data-nav="comm"]').click();
    await sleep(500);
    window.document.querySelector('#comm-tabs [data-t="chat"]').click();
    await sleep(700);
    const list = window.document.querySelectorAll('[data-chat]');
    ok('في قائمة طلاب للدردشة', list.length >= 1);
    if (list.length) {
      list[0].click();
      await sleep(600);
      ok('فتح محادثة', !!window.document.querySelector('#ch-in'));
      ok('مفيش رفع صور أو مرفقات', !window.document.querySelector('input[type="file"]'));
      window.document.querySelector('#ch-in').value = 'رسالة اختبار';
      window.document.querySelector('#ch-send').click();
      await sleep(700);
      ok('الرسالة اتبعتت', /اختبار/.test(window.document.querySelector('#ch-msgs').textContent));
    }
  }

  /* ---------- ١١. مساحة الملفات ---------- */
  {
    const T = await teacherToken();
    const t = await makeDom(T);
    const { window } = t;
    window.document.querySelector('[data-nav="files"]').click();
    await sleep(400);
    eq('فتح مساحة الملفات', visible(window), 'screen-files');
    ok('فيها شرح', /الملفات|المجموعة/.test(window.document.querySelector('#files-body').textContent));
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
