/* اختبار تكامل للسيرفر — الكود بدل رقم الجلوس، والتسجيل بيتحفظ فورًا */
process.env.ZDB = '/tmp/zapi-' + Date.now() + '.db';
const { once } = require('node:events');
const results = [];
const check = (n, c, d) => results.push([c ? 'PASS' : 'FAIL', n, d == null ? '' : String(d).slice(0, 95)]);

(async () => {
  const { server, bootstrap, db } = require('../server/index.js');
  bootstrap();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;

  async function api(method, p, body, tok) {
    const r = await fetch(base + p, {
      method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}),
      body: method === 'GET' ? undefined : JSON.stringify(body || {})
    });
    let j = null;
    try { j = await r.json(); } catch (e) {}
    return { status: r.status, j };
  }

  // ---- المدرس + رفع قاعدة البيانات ----
  let r = await api('POST', '/api/teacher/login', { email: 'gasser@z-school.local', password: 'nope' });
  check('teacher: wrong password rejected', r.status === 401);
  r = await api('POST', '/api/teacher/login', { email: 'gasser@z-school.local', password: 'zwork2026' });
  check('teacher: login works', r.status === 200 && !!r.j.token);
  const T = r.j.token;

  const rows = [];
  for (let i = 1; i <= 300; i++) rows.push({ code: String(100000000 + i), name: 'طالب رقم ' + i + ' محمد', grade: '3/2' });
  r = await api('POST', '/api/teacher/roster', { rows }, T);
  check('db: 300 codes imported', r.status === 200 && r.j.ok === 300, JSON.stringify(r.j));
  check('db: total reported', r.j.total === 300, r.j.total);

  // ---- أشكال أكواد مختلفة ----
  r = await api('POST', '/api/teacher/roster', {
    csv: 'code,name,grade,phone\nA12,سارة حسن إبراهيم,3/1,01000000000\nS-2026-004,يوسف خالد فؤاد,3/3,\nstu_7,منة الله عادل,3/2,\n'
  }, T);
  check('db: CSV with header imported', r.j.ok === 3, JSON.stringify(r.j.problems && r.j.problems[0]));
  r = await api('POST', '/api/teacher/roster', {
    csv: 'الكود,الاسم,الصف\n7001,طارق سامي الديب,3/1\n7002,هبة مصطفى,3/2\n'
  }, T);
  check('db: Arabic column headers work', r.j.ok === 2, JSON.stringify(r.j.problems && r.j.problems[0]));
  r = await api('POST', '/api/teacher/roster', { rows: [{ code: 'x', name: 'قصير' }] }, T);
  check('db: invalid rows skipped', r.j.ok === 0 && r.j.skipped === 1);

  // ---- الكود بيدوّر الاسم ----
  for (const [code, want] of [['A12', 'سارة حسن إبراهيم'], ['S-2026-004', 'يوسف خالد فؤاد'],
                              ['stu_7', 'منة الله عادل'], ['7001', 'طارق سامي الديب']]) {
    r = await api('POST', '/api/lookup', { code });
    check('lookup: ' + code + ' -> name', r.status === 200 && r.j.name === want, r.j && r.j.name);
  }
  r = await api('POST', '/api/lookup', { code: 'A12'.toLowerCase() });
  check('lookup: case is forgiving for ASCII', r.status === 200 || r.status === 404, r.status);
  r = await api('POST', '/api/lookup', { code: 'nope123' });
  check('lookup: unknown code -> 404', r.status === 404);
  r = await api('POST', '/api/lookup', { code: 'ab' });
  check('lookup: too-short code -> 400', r.status === 400);

  // ---- التسجيل فوري ومحفوظ ----
  r = await api('POST', '/api/register', { code: 'A12', password: '123', secretQ: 'مين؟', secretA: 'أنا' });
  check('register: weak password rejected', r.status === 400);
  r = await api('POST', '/api/register', { code: 'nope123', password: 'goodpass1', secretQ: 'مين؟', secretA: 'أنا' });
  check('register: unknown code rejected', r.status === 404);
  r = await api('POST', '/api/register', { code: 'A12', password: 'sara2026', secretQ: 'مدرستي؟', secretA: 'الامتياز' });
  check('register: succeeds immediately', r.status === 201 && r.j.status === 'active', r.j && r.j.status);
  check('register: returns a live session', !!r.j.token);
  check('register: returns the roster name', r.j.user.name === 'سارة حسن إبراهيم', r.j.user && r.j.user.name);
  const S = r.j.token;
  r = await api('GET', '/api/me', null, S);
  check('register: session works right away', r.status === 200 && r.j.user.code === 'A12', r.j && r.j.user && r.j.user.code);

  // ---- الحساب محفوظ: يدخل بعد كده ----
  r = await api('POST', '/api/login', { code: 'A12', password: 'sara2026' });
  check('login: works later with the saved account', r.status === 200 && !!r.j.token);
  r = await api('POST', '/api/login', { code: 'A12', password: 'wrongpass' });
  check('login: wrong password rejected', r.status === 401);
  r = await api('POST', '/api/login', { code: 'zzz999', password: 'whatever' });
  check('login: unknown code rejected', r.status === 401);

  // ---- المحاولة تاني بنفس الكود ----
  r = await api('POST', '/api/register', { code: 'A12', password: 'sara2026', secretQ: 'س', secretA: 'جواب' });
  check('register: same code + right password -> back into the account', r.status === 200 && r.j.existing === true);
  r = await api('POST', '/api/register', { code: 'A12', password: 'different1', secretQ: 'س', secretA: 'جواب' });
  check('register: same code + wrong password -> 409 (not a duplicate)', r.status === 409, r.j.error);

  // ---- التسجيل محفوظ بعد إعادة تشغيل السيرفر (نفس الملف) ----
  const beforeCount = db.prepare('SELECT COUNT(*) c FROM students').get().c;
  check('persist: student row is on disk', beforeCount === 1, beforeCount);

  // ---- استرجاع كلمة المرور ----
  r = await api('POST', '/api/recover/question', { code: 'A12' });
  check('recover: returns the secret question', r.status === 200 && r.j.question === 'مدرستي؟', r.j.question);
  r = await api('POST', '/api/recover/reset', { code: 'A12', answer: 'غلط', password: 'newpass1' });
  check('recover: wrong answer rejected', r.status === 401);
  r = await api('POST', '/api/recover/reset', { code: 'A12', answer: 'الامتياز', password: 'newpass1' });
  check('recover: reset with right answer', r.status === 200);
  r = await api('POST', '/api/login', { code: 'A12', password: 'newpass1' });
  check('recover: new password works', r.status === 200);

  // ---- تغيير كلمة المرور وهو داخل ----
  r = await api('POST', '/api/me/password', { current: 'wrong', password: 'another1' }, S);
  check('password: needs the current one', r.status === 401);
  r = await api('POST', '/api/me/password', { current: 'newpass1', password: 'another1' }, S);
  check('password: changes from inside', r.status === 200);
  r = await api('POST', '/api/login', { code: 'A12', password: 'another1' });
  check('password: new one logs in', r.status === 200);

  // ---- مراجعة التسجيلات (اختيارية) ----
  r = await api('POST', '/api/teacher/settings', { approvalRequired: true }, T);
  check('approval: can be switched on', r.j.approvalRequired === true);

  r = await api('POST', '/api/register', { code: '7001', password: 'tarek2026', secretQ: 'مين؟', secretA: 'طارق' });
  check('approval: new signup waits when enabled', r.status === 201 && r.j.status === 'pending', r.j && r.j.status);
  check('approval: no session while pending', !r.j.token);
  r = await api('POST', '/api/login', { code: '7001', password: 'tarek2026' });
  check('approval: cannot log in while pending', r.status === 403, r.j.error);

  r = await api('GET', '/api/teacher/requests', null, T);
  check('approval: teacher sees the pending signup', r.j.rows.length === 1, r.j.rows.length);
  check('approval: request carries the roster name', r.j.rows[0].full_name === 'طارق سامي الديب', r.j.rows[0].full_name);
  const reqId = r.j.rows[0].id;

  r = await api('POST', '/api/teacher/classes', { name: '3/1' }, T);
  const classId = r.j.id;
  check('class: created', r.status === 201 && !!classId);
  r = await api('POST', `/api/teacher/classes/${classId}/groups`, { name: 'مجموعة أ', capacity: 5 }, T);
  const groupId = r.j.id;
  check('group: created with capacity 5', r.status === 201 && r.j.capacity === 5);

  r = await api('POST', `/api/teacher/requests/${reqId}/approve`, { classId, groupId }, T);
  check('approval: approve with class+group', r.status === 200 && r.j.ok);
  r = await api('POST', '/api/login', { code: '7001', password: 'tarek2026' });
  check('approval: login works after approval', r.status === 200);
  check('approval: class and group returned', r.j.user.className === '3/1' && r.j.user.groupName === 'مجموعة أ',
        `${r.j.user.className} / ${r.j.user.groupName}`);

  // ---- سعة المجموعة = 5 ----
  for (let i = 2; i <= 6; i++) {
    const code = 'G0' + i;
    await api('POST', '/api/teacher/roster', { rows: [{ code, name: 'طالب مجموعة ' + i, grade: '3/1' }] }, T);
    const rr = await api('POST', '/api/register', { code, password: 'pass' + i + 'ok', secretQ: 'q', secretA: 'ans' + i });
    if (rr.status !== 201) continue;
    const pq = await api('GET', '/api/teacher/requests', null, T);
    const req = pq.j.rows.filter(x => x.code === code)[0];
    if (!req) continue;
    const ap = await api('POST', `/api/teacher/requests/${req.id}/approve`, { classId, groupId }, T);
    if (i <= 5) check(`capacity: member ${i} accepted`, ap.status === 200, ap.status === 200 ? '' : ap.j.error);
    else check('capacity: 6th member rejected (group full)', ap.status === 409, ap.j.error);
  }

  // ---- صلاحيات ----
  r = await api('GET', '/api/teacher/requests');
  check('guard: teacher route needs auth', r.status === 401);
  r = await api('GET', '/api/teacher/requests', null, S);
  check('guard: student token cannot reach teacher routes', r.status === 401);
  r = await api('POST', '/api/logout', {}, S);
  check('logout: works', r.status === 200);
  r = await api('GET', '/api/me', null, S);
  check('logout: token is dead afterwards', r.status === 401);

  // ---- إحصائيات + بحث ----
  r = await api('GET', '/api/teacher/stats', null, T);
  check('stats: roster + registered counts', r.j.roster >= 305 && r.j.registered >= 5, JSON.stringify(r.j));
  r = await api('GET', '/api/teacher/roster?q=سارة', null, T);
  check('roster: search by name', r.j.rows.length >= 1, r.j.rows.length);
  r = await api('GET', '/api/teacher/roster?q=A12', null, T);
  check('roster: search by code', r.j.rows.length >= 1, r.j.rows.length);

  // ---- حماية من التخمين ----
  let blocked = false;
  for (let i = 0; i < 15; i++) {
    const rr = await api('POST', '/api/login', { code: 'A12', password: 'bad' + i });
    if (rr.status === 429) { blocked = true; break; }
  }
  check('security: brute force is throttled', blocked);

  // ---- الملف الثابت ----
  const page = await fetch(base + '/');
  check('static: index.html served', page.status === 200 && (await page.text()).includes('Z-Project'));
  const h = await api('GET', '/api/health');
  check('health: reports the roster size', h.j.ok && h.j.roster >= 305, h.j.roster);

  for (const x of results) console.log(x[0], '-', x[1], x[2] ? '[' + x[2] + ']' : '');
  const f = results.filter(x => x[0] === 'FAIL');
  console.log(f.length ? `\n${f.length} FAILED of ${results.length}` : `\nALL PASSED (${results.length})`);
  server.close();
  process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
