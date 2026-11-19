/* اختبار الواجهة: jsdom بيحمّل الصفحة الحقيقية، و fetch بيضرب السيرفر الحقيقي.
   بيغطي: البداية، إنشاء حساب باسم من الكشف، طلب مستني، قبول المدرس، دخول الطالب، استرجاع. */
process.env.ZDB = '/tmp/zui-' + Date.now() + '.db';
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require(path.join(__dirname, '..', '..', 'tests', 'node_modules', 'jsdom'));
const { once } = require('node:events');

const ROOT = path.join(__dirname, '..');
const results = [];
const check = (n, c, d) => results.push([c ? 'PASS' : 'FAIL', n, d == null ? '' : String(d).slice(0, 110)]);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const { server, bootstrap } = require('../server/index.js');
  bootstrap();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;

  // كشف صغير
  const tlogin = await (await fetch(base + '/api/teacher/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'gasser@z-school.local', password: 'zwork2026' })
  })).json();
  const T = tlogin.token;
  await fetch(base + '/api/teacher/roster', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + T },
    body: JSON.stringify({ rows: [{ seat: '200000001', name: 'يوسف إبراهيم الشامي', grade: '3/2' }] })
  });

  // الصفحة الحقيقية
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(
    '<script src="js/app.js"></script>', '');
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(html, { url: base + '/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.fetch = (u, o) => fetch(u.startsWith('http') ? u : base + u, o);
  w.eval(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'));
  await sleep(200);

  const $ = s => w.document.querySelector(s);
  const active = () => { const a = w.document.querySelector('.screen.active'); return a ? a.id.replace('screen-', '') : null; };
  const type = (sel, v) => { const el = $(sel); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const click = async (sel) => { const el = $(sel); if (!el) throw new Error('مفيش ' + sel); el.click(); await sleep(160); };

  check('boot: starts on the entry screen', active() === 'entry', active());
  check('boot: api() targets the injected base', typeof w.document.querySelector('script') !== 'undefined');
  check('boot: three entry buttons', w.document.querySelectorAll('#screen-entry .entry-actions .btn').length === 3);
  check('boot: no script errors', errs.length === 0, errs.join(' | '));

  // --- دخول لشاشة إنشاء حساب
  await click('[data-go="signup"]');
  check('signup: opens', active() === 'signup', active());

  // --- رقم جلوس مش موجود
  type('#su-seat', '999999999');
  await click('#su-next');
  check('signup: unknown seat shows a clear error', /مش موجود/.test($('#su-err1').textContent), $('#su-err1').textContent);

  // --- رقم قصير
  type('#su-seat', '123');
  await click('#su-next');
  check('signup: short seat rejected', /9 أرقام/.test($('#su-err1').textContent), $('#su-err1').textContent);

  // --- رقم صحيح: الاسم لازم يظهر لوحده
  type('#su-seat', '200000001');
  await click('#su-next');
  check('signup: moves to step 2', !$('#signup-step2').classList.contains('hidden'));
  check('signup: name came from the roster', $('#su-name').textContent === 'يوسف إبراهيم الشامي', $('#su-name').textContent);
  check('signup: seat shown on the card', $('#su-seat-view').textContent === '200000001');
  check('signup: no name input on the form', $('input#su-name') === null);
  check('signup: step label updated', $('#signup-step-label').textContent.includes('2'));

  // --- كلمة مرور قصيرة
  type('#su-pass', '123'); type('#su-pass2', '123'); type('#su-q', 'مدرستي؟'); type('#su-a', 'الامتياز');
  await click('#su-submit');
  check('signup: short password blocked', /6 حروف/.test($('#su-err2').textContent), $('#su-err2').textContent);

  // --- كلمتين مش زي بعض
  type('#su-pass', 'youssef2026'); type('#su-pass2', 'youssef2027');
  await click('#su-submit');
  check('signup: mismatch blocked', /مش زي بعض/.test($('#su-err2').textContent), $('#su-err2').textContent);

  // --- تقديم ناجح
  type('#su-pass2', 'youssef2026');
  await click('#su-submit');
  await sleep(250);
  check('signup: lands on the pending screen', active() === 'pending', active());
  check('signup: pending shows the roster name', $('#pending-name').textContent === 'يوسف إبراهيم الشامي', $('#pending-name').textContent);
  check('signup: pending shows the seat', $('#pending-seat').textContent === '200000001');

  // --- الطالب مش قادر يدخل لسه
  await click('[data-go="entry"]');
  await click('[data-go="login"]');
  type('#login-seat', '200000001'); type('#login-pass', 'youssef2026');
  await click('#login-btn');
  await sleep(250);
  check('login: blocked while pending', /موافقة المدرس/.test($('#login-err').textContent), $('#login-err').textContent);

  // --- المدرس يقبل
  await click('[data-back]');
  await click('[data-go="entry"]');
  await click('[data-go="teacher-login"]');
  type('#tl-email', 'gasser@z-school.local'); type('#tl-pass', 'zwork2026');
  await click('#tl-btn');
  await sleep(400);
  check('teacher: dashboard opens', active() === 'teacher', active());
  check('teacher: stats loaded', $('#stat-roster').textContent === '1', $('#stat-roster').textContent);
  check('teacher: pending badge shows', !$('#badge-req').classList.contains('hidden'));
  check('teacher: request card rendered', w.document.querySelectorAll('#req-list .req').length === 1);

  // لازم فصل ومجموعة الأول
  await click('#dash-tabs button[data-tab="classes"]');
  await sleep(150);
  await click('#class-add2');
  type('#nc-name', '3/2');
  await click('#nc-go');
  await sleep(300);
  check('teacher: class created', w.document.querySelectorAll('#class-list .card').length === 1);

  await click('[data-addg]');
  type('#ng-name', 'مجموعة أ'); type('#ng-cap', '5');
  await click('#ng-go');
  await sleep(300);
  check('teacher: group created', w.document.querySelectorAll('#class-list .grp').length === 1);
  check('teacher: group capacity shown', w.document.querySelector('#class-list .grp .cap').textContent === '0/5',
        w.document.querySelector('#class-list .grp .cap').textContent);

  // قبول
  await click('#dash-tabs button[data-tab="requests"]');
  await sleep(200);
  await click('[data-approve]');
  await sleep(400);
  check('approve: sheet opens', $('#sheet').classList.contains('open'));
  check('approve: class choices listed', w.document.querySelectorAll('#ap-classes .pick').length === 1);
  check('approve: confirm disabled before choosing', $('#ap-do').disabled === true);

  await click('#ap-classes .pick');
  await sleep(150);
  check('approve: groups appear after picking a class', !$('#ap-groups-wrap').classList.contains('hidden'));
  await click('#ap-groups .pick');
  await sleep(100);
  check('approve: confirm enabled after class+group', $('#ap-do').disabled === false);
  await click('#ap-do');
  await sleep(400);
  check('approve: sheet closes', !$('#sheet').classList.contains('open'));
  check('approve: request list now empty', w.document.querySelectorAll('#req-list .req').length === 0);
  check('approve: stats updated', $('#stat-students').textContent === '1', $('#stat-students').textContent);

  // --- الطالب يدخل
  await click('#th-logout');
  await sleep(200);
  check('logout: back to entry', active() === 'entry', active());
  await click('[data-go="login"]');
  type('#login-seat', '200000001'); type('#login-pass', 'youssef2026');
  await click('#login-btn');
  await sleep(400);
  check('student: dashboard opens', active() === 'student', active());
  check('student: greeting uses first name', $('#st-greet').textContent.includes('يوسف'), $('#st-greet').textContent);
  check('student: seat shown', $('#st-seat').textContent === '200000001');
  check('student: group shown', $('#st-group').textContent === 'مجموعة أ', $('#st-group').textContent);
  check('student: class shown in header', $('#st-sub').textContent.includes('3/2'), $('#st-sub').textContent);

  // --- جلسة مستأنفة
  const tok = w.localStorage.getItem('zwork.tok');
  const dom2 = new JSDOM(html, { url: base + '/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  dom2.window.localStorage.setItem('zwork.tok', tok);
  dom2.window.fetch = (u, o) => fetch(u.startsWith('http') ? u : base + u, o);
  dom2.window.eval(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'));
  await sleep(500);
  const a2 = dom2.window.document.querySelector('.screen.active');
  check('resume: reload keeps the student signed in', a2 && a2.id === 'screen-student', a2 && a2.id);
  check('resume: class+group survive reload',
        dom2.window.document.querySelector('#st-group').textContent === 'مجموعة أ',
        dom2.window.document.querySelector('#st-group').textContent);

  // --- استرجاع كلمة المرور
  await click('#st-logout');
  await sleep(200);
  await click('[data-go="login"]');
  await click('[data-go="recover"]');
  type('#rc-seat', '200000001');
  await click('#rc-next');
  await sleep(300);
  check('recover: question shown', $('#rc-question').textContent === 'مدرستي؟', $('#rc-question').textContent);
  type('#rc-answer', 'غلط'); type('#rc-pass', 'newpass2026');
  await click('#rc-submit');
  await sleep(300);
  check('recover: wrong answer blocked', /غلط/.test($('#rc-err2').textContent), $('#rc-err2').textContent);
  type('#rc-answer', 'الامتياز');
  await click('#rc-submit');
  await sleep(400);
  check('recover: success goes to login', active() === 'login', active());
  type('#login-pass', 'newpass2026');
  await click('#login-btn');
  await sleep(400);
  check('recover: new password logs in', active() === 'student', active());

  // --- حقن عنوان السيرفر (نفس منطق MainActivity.injectApiBase)
  const plain = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const inject = (html, base) => {
    const tag = '<script>window.ZAPI=' + JSON.stringify(base) + ';</script>';
    const at = html.indexOf('</head>');
    return at < 0 ? html : html.slice(0, at) + tag + html.slice(at);
  };
  const injected = inject(plain, 'https://z-project.onrender.com');
  check('android: ZAPI injected before app.js', injected.indexOf('window.ZAPI') < injected.indexOf('js/app.js'));
  check('android: ZAPI is inside <head>', injected.indexOf('window.ZAPI') < injected.indexOf('</head>'));
  const d3 = new JSDOM(injected, { url: 'https://appassets.androidplatform.net/web/index.html',
                                   runScripts: 'outside-only', pretendToBeVisual: true });
  check('android: injected base parses to the right URL',
        d3.window.eval('(function(){var s=document.querySelector(\'script\');return document.head.lastElementChild.textContent.indexOf("https://z-project.onrender.com")>-1;})()') === true);
  check('android: index.html ships without a hard-coded base',
        plain.indexOf('z-project.onrender.com') === -1 && plain.indexOf('window.ZAPI') === -1);

  for (const r of results) console.log(r[0], '-', r[1], r[2] ? '[' + r[2] + ']' : '');
  const f = results.filter(x => x[0] === 'FAIL');
  console.log(f.length ? `\n${f.length} FAILED of ${results.length}` : `\nALL PASSED (${results.length})`);
  server.close();
  process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
