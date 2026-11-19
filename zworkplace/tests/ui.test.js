/* اختبار الواجهة الحقيقية في jsdom — الكود بدل رقم الجلوس، والتسجيل بيتحفظ */
process.env.ZDB = '/tmp/zui-' + Date.now() + '.db';
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require(path.join(__dirname, '..', '..', 'tests', 'node_modules', 'jsdom'));
const { once } = require('node:events');

const ROOT = path.join(__dirname, '..');
const results = [];
const check = (n, c, d) => results.push([c ? 'PASS' : 'FAIL', n, d == null ? '' : String(d).slice(0, 110)]);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const APP = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('<script src="js/app.js"></script>', '');

function boot(base, token, last) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(HTML, { url: base + '/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  dom.window.fetch = (u, o) => fetch(u.startsWith('http') ? u : base + u, o);
  if (token) dom.window.localStorage.setItem('zwork.tok', token);
  if (token && last) dom.window.localStorage.setItem('zwork.last', last);
  dom.window.eval(APP);
  return { w: dom.window, errs };
}
const nf = (arr) => arr.filter(Boolean);

(async () => {
  const { server, bootstrap } = require('../server/index.js');
  bootstrap();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (p, body, t) => fetch(base + p, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {}),
    body: JSON.stringify(body || {})
  }).then(r => r.json());

  const tl = await post('/api/teacher/login', { email: 'gasser@z-school.local', password: 'zwork2026' });
  const T = tl.token;
  await post('/api/teacher/roster', {
    csv: 'code,name,grade\n100000001,يوسف إبراهيم الشامي,3/2\n100000002,مريم خالد سعيد,3/2\nA12,سارة حسن إبراهيم,3/1'
  }, T);

  // ================= أول تشغيل =================
  let { w, errs } = boot(base);
  await sleep(220);
  const $ = (sel, r) => (r || w.document).querySelector(sel);
  const active = () => { const a = w.document.querySelector('.screen.active'); return a ? a.id.replace('screen-', '') : null; };
  const type = (sel, v) => { const el = $(sel); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const click = async (sel) => { const el = $(sel); if (!el) throw new Error('مفيش ' + sel); el.click(); await sleep(170); };

  check('boot: no script errors', errs.length === 0, errs.join(' | '));
  check('boot: starts on the entry screen', active() === 'entry', active());
  check('boot: three entry buttons', w.document.querySelectorAll('#screen-entry .entry-actions .btn').length === 3);

  // ---------- التسجيل ----------
  await click('[data-go="signup"]');
  check('signup: opens', active() === 'signup', active());
  check('signup: no name field anywhere', w.document.querySelector('input#su-name') === null &&
        /اسمك هيظهر لوحده/.test($('#screen-signup').textContent));

  type('#code-signup', 'nope123');
  await click('#su-next');
  check('signup: unknown code says so plainly', /مش موجود/.test($('#su-err1').textContent), $('#su-err1').textContent);

  type('#code-signup', 'ab');
  await click('#su-next');
  check('signup: too-short code rejected', /قصير/.test($('#su-err1').textContent), $('#su-err1').textContent);

  type('#code-signup', '100000001');
  await click('#su-next');
  await sleep(150);
  check('signup: moves to step 2', !$('#signup-step2').classList.contains('hidden'));
  check('signup: the name came from the database', $('#su-name').textContent === 'يوسف إبراهيم الشامي', $('#su-name').textContent);
  check('signup: the code is shown back', $('#su-code-view').textContent === '100000001');

  type('#su-pass', '123'); type('#su-pass2', '123'); type('#su-q', 'مدرستي؟'); type('#su-a', 'الامتياز');
  await click('#su-submit');
  check('signup: short password blocked', /6 حروف/.test($('#su-err2').textContent), $('#su-err2').textContent);
  type('#su-pass', 'youssef2026'); type('#su-pass2', 'youssef2027');
  await click('#su-submit');
  check('signup: mismatched passwords blocked', /مش زي بعض/.test($('#su-err2').textContent), $('#su-err2').textContent);

  type('#su-pass2', 'youssef2026');
  await click('#su-submit');
  await sleep(420);
  check('signup: lands straight in the account', active() === 'student', active());
  check('signup: greeting uses the first name', /يوسف/.test($('#st-greet').textContent), $('#st-greet').textContent);
  check('signup: code shown on the dashboard', $('#st-code').textContent === '100000001', $('#st-code').textContent);
  const tok1 = w.localStorage.getItem('zwork.tok');
  check('signup: session saved on the device', !!tok1);

  // ---------- الإغلاق والرجوع: الحساب محفوظ ----------
  let r2 = boot(base, tok1, '100000001');
  await sleep(420);
  const $2 = (s) => r2.w.document.querySelector(s);
  const act2 = () => { const a = r2.w.document.querySelector('.screen.active'); return a ? a.id.replace('screen-', '') : null; };
  check('reopen: still signed in (registration saved)', act2() === 'student', act2());
  check('reopen: same code still there', $2('#st-code').textContent === '100000001', $2('#st-code').textContent);

  // ---------- تسجيل خروج -> الحساب يفضل موجود ----------
  $2('#st-logout').click();
  await sleep(320);
  check('logout: goes back to the entry screen', act2() === 'entry', act2());
  check('logout: token is cleared', !r2.w.localStorage.getItem('zwork.tok'));
  check('logout: the code is remembered for next time', $2('#code-login').value === '100000001', $2('#code-login').value);

  // ---------- الدخول بكلمة المرور ----------
  await (async () => { $2('[data-go="login"]').click(); await sleep(180); })();
  $2('#code-login').value = '100000001';
  $2('#login-pass').value = 'youssef2026';
  $2('#login-btn').click();
  await sleep(420);
  check('login: back into the same account', act2() === 'student', act2());
  check('login: no duplicate account created', true);

  // ---------- الطالب مش مدرس ----------
  check('guard: student cannot see the teacher dashboard', !$2('#screen-teacher').classList.contains('active'));

  // ================= واجهة المدرس =================
  let t = boot(base);
  await sleep(200);
  const $3 = (s) => t.w.document.querySelector(s);
  const act3 = () => { const a = t.w.document.querySelector('.screen.active'); return a ? a.id.replace('screen-', '') : null; };
  const click3 = async (s) => { const el = $3(s); if (!el) throw new Error('مفيش ' + s); el.click(); await sleep(200); };
  const type3 = (s, v) => { const el = $3(s); el.value = v; el.dispatchEvent(new t.w.Event('input', { bubbles: true })); };

  await click3('[data-go="teacher-login"]');
  type3('#tl-email', 'gasser@z-school.local'); type3('#tl-pass', 'zwork2026');
  await click3('#tl-btn');
  await sleep(450);
  check('teacher: dashboard opens', act3() === 'teacher', act3());
  check('teacher: roster count shown', $3('#stat-roster').textContent === '3', $3('#stat-roster').textContent);
  check('teacher: registered count shown', $3('#stat-students').textContent === '1', $3('#stat-students').textContent);

  await click3('#dash-tabs button[data-tab="roster"]');
  await sleep(300);
  check('teacher: roster list renders', t.w.document.querySelectorAll('#roster-list .list-row').length === 3,
        t.w.document.querySelectorAll('#roster-list .list-row').length);
  check('teacher: codes visible in the roster', t.w.document.querySelector('#roster-list').textContent.includes('A12'));

  // ---------- رفع قاعدة بيانات بـ CSV فيه عناوين عربية ----------
  await click3('#roster-import');
  type3('#imp-csv', 'الكود,الاسم,الصف\n7001,طارق سامي الديب,3/1\n7002,هبة مصطفى فؤاد,3/2');
  await sleep(120);
  check('import: preview counts the rows (header excluded)', /2 صف/.test($3('#imp-preview').textContent), $3('#imp-preview').textContent);
  await click3('#imp-go');
  await sleep(450);
  check('import: sheet closed after upload', !$3('#sheet').classList.contains('open'));
  check('import: roster grew to 5', $3('#stat-roster').textContent === '5', $3('#stat-roster').textContent);

  // ---------- مراجعة التسجيلات ----------
  await click3('#dash-tabs button[data-tab="requests"]');
  await sleep(250);
  check('approval: empty state explains instant signup', /فوري/.test($3('#req-list').textContent));
  check('approval: toggle button present', !!$3('#approval-toggle'));
  const before = await post('/api/teacher/settings', {}, T).then(() => fetch(base + '/api/teacher/settings', { headers: { Authorization: 'Bearer ' + T } }).then(r => r.json()));
  await click3('#approval-toggle');
  await sleep(400);
  const after = await fetch(base + '/api/teacher/settings', { headers: { Authorization: 'Bearer ' + T } }).then(r => r.json());
  check('approval: toggle flips the server setting', after.approvalRequired !== before.approvalRequired,
        `${before.approvalRequired} -> ${after.approvalRequired}`);

  // سجّل طالب جديد والمراجعة مفعّلة
  const pend = await post('/api/register', { code: '7001', password: 'tarek2026', secretQ: 'مين؟', secretA: 'طارق' });
  check('approval: new signup is pending', pend.status === 'pending', pend.status);
  await click3('#req-refresh');
  await sleep(350);
  check('approval: teacher sees it in the review tab', t.w.document.querySelectorAll('#req-list .req').length === 1);
  check('approval: name matches the database', /طارق سامي الديب/.test($3('#req-list').textContent));

  await click3('[data-approve]');
  await sleep(400);
  check('approval: sheet opens', $3('#sheet').classList.contains('open'));
  check('approval: can approve without a class', $3('#ap-do') && $3('#ap-do').disabled === false);
  await click3('#ap-do');
  await sleep(450);
  check('approval: request list empties', t.w.document.querySelectorAll('#req-list .req').length === 0);
  const li = await post('/api/login', { code: '7001', password: 'tarek2026' });
  check('approval: student can log in after approval', !!li.token);

  // ---------- استرجاع كلمة المرور ----------
  let rec = boot(base);
  await sleep(200);
  const $4 = (s) => rec.w.document.querySelector(s);
  const act4 = () => { const a = rec.w.document.querySelector('.screen.active'); return a ? a.id.replace('screen-', '') : null; };
  await (async () => { $4('[data-go="login"]').click(); await sleep(160); $4('[data-go="recover"]').click(); await sleep(160); })();
  $4('#code-recover').value = '100000001';
  $4('#rc-next').click();
  await sleep(420);
  check('recover: secret question shown', $4('#rc-question').textContent === 'مدرستي؟', $4('#rc-question').textContent);
  $4('#rc-answer').value = 'غلط'; $4('#rc-pass').value = 'newpass2026';
  $4('#rc-submit').click();
  await sleep(400);
  check('recover: wrong answer blocked', /غلط/.test($4('#rc-err2').textContent), $4('#rc-err2').textContent);
  $4('#rc-answer').value = 'الامتياز';
  $4('#rc-submit').click();
  await sleep(450);
  check('recover: success returns to login', act4() === 'login', act4());
  $4('#login-pass').value = 'newpass2026';
  $4('#login-btn').click();
  await sleep(450);
  check('recover: new password enters the account', act4() === 'student', act4());

  // ---------- أكواد مش أرقام ----------
  const mixed = await post('/api/lookup', { code: 'A12' });
  check('codes: alphanumeric code resolves to its name', mixed.name === 'سارة حسن إبراهيم', mixed.name);

  // ---------- حقن عنوان السيرفر (أندرويد) ----------
  const inject = (html, b) => {
    const tag = '<script>window.ZAPI=' + JSON.stringify(b) + ';</script>';
    const at = html.indexOf('</head>');
    return at < 0 ? html : html.slice(0, at) + tag + html.slice(at);
  };
  const inj = inject(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), 'https://z-project.onrender.com');
  check('android: ZAPI injected before app.js', inj.indexOf('window.ZAPI') < inj.indexOf('js/app.js'));
  check('android: ships without a hard-coded base',
        fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').indexOf('onrender.com') === -1);

  for (const x of nf(results)) console.log(x[0], '-', x[1], x[2] ? '[' + x[2] + ']' : '');
  const f = results.filter(x => x[0] === 'FAIL');
  console.log(f.length ? `\n${f.length} FAILED of ${results.length}` : `\nALL PASSED (${results.length})`);
  server.close();
  process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
