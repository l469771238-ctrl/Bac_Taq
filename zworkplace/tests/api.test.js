/* اختبار تكامل للسيرفر: كشف، طلب، قبول، دخول، استرجاع، حد المحاولات */
process.env.ZDB = '/tmp/ztest-' + Date.now() + '.db';
const { once } = require('node:events');
const results = [];
const check = (n, c, d) => results.push([c ? 'PASS' : 'FAIL', n, d == null ? '' : String(d).slice(0, 90)]);

(async () => {
  const { server, bootstrap } = require('../server/index.js');
  bootstrap();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  let token = null;

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

  // 1) teacher login
  let r = await api('POST', '/api/teacher/login', { email: 'gasser@z-school.local', password: 'wrong' });
  check('teacher: wrong password rejected', r.status === 401, r.j && r.j.error);
  r = await api('POST', '/api/teacher/login', { email: 'gasser@z-school.local', password: 'zwork2026' });
  check('teacher: login works', r.status === 200 && !!r.j.token);
  token = r.j.token;

  // 2) roster import
  const rows = [];
  for (let i = 1; i <= 300; i++) rows.push({ seat: String(100000000 + i), name: 'طالب رقم ' + i + ' محمد', grade: '3' });
  r = await api('POST', '/api/teacher/roster', { rows }, token);
  check('roster: 300 students imported', r.status === 200 && r.j.ok === 300, JSON.stringify(r.j && r.j.problems && r.j.problems[0]));
  r = await api('POST', '/api/teacher/roster', { rows: [{ seat: '123', name: 'قصير' }] }, token);
  check('roster: invalid rows rejected', r.j.ok === 0 && r.j.skipped === 1);
  r = await api('GET', '/api/teacher/roster', null, token);
  check('roster: total is 300', r.j.total === 300, r.j.total);
  r = await api('GET', '/api/teacher/roster?q=رقم 77', null, token);
  check('roster: search works', r.j.rows.length >= 1, r.j.rows.length);

  // 3) student lookup by seat
  r = await api('POST', '/api/lookup', { seat: '100000001' });
  check('lookup: returns the name for a seat', r.status === 200 && r.j.name === 'طالب رقم 1 محمد', r.j && r.j.name);
  check('lookup: hasAccount=false at first', r.j.hasAccount === false);
  r = await api('POST', '/api/lookup', { seat: '999999999' });
  check('lookup: unknown seat -> 404', r.status === 404);
  r = await api('POST', '/api/lookup', { seat: '123' });
  check('lookup: short seat -> 400', r.status === 400);

  // 4) account request
  r = await api('POST', '/api/request', { seat: '100000001', password: '123', secretQ: 'المدرسة؟', secretA: 'الامتياز' });
  check('request: weak password rejected', r.status === 400, r.j.error);
  r = await api('POST', '/api/request', { seat: '100000001', password: 'ahmed2026', secretQ: 'المدرسة؟', secretA: 'الامتياز' });
  check('request: created', r.status === 201 && r.j.status === 'pending');
  const reqId = r.j.requestId;
  r = await api('POST', '/api/request', { seat: '100000001', password: 'ahmed2026', secretQ: 'المدرسة؟', secretA: 'نفس الإجابة' });
  check('request: duplicate pending blocked', r.status === 409, r.j.error);

  // 5) login before approval
  r = await api('POST', '/api/login', { seat: '100000001', password: 'ahmed2026' });
  check('login: blocked while pending', r.status === 403, r.j.error);

  // 6) pending list + classes/groups
  r = await api('GET', '/api/teacher/requests', null, token);
  check('teacher: sees 1 pending request', r.j.rows.length === 1, r.j.rows.length);
  check('teacher: request carries the roster name', r.j.rows[0].full_name === 'طالب رقم 1 محمد', r.j.rows[0].full_name);

  r = await api('POST', '/api/teacher/classes', { name: '3/2' }, token);
  const classId = r.j.id;
  check('class: created', r.status === 201 && !!classId);
  const groupIds = [];
  for (const [n, cap] of [['مجموعة أ', 5], ['مجموعة ب', 5]]) {
    r = await api('POST', `/api/teacher/classes/${classId}/groups`, { name: n, capacity: cap }, token);
    groupIds.push(r.j.id);
    check(`group: ${n} created with capacity ${cap}`, r.status === 201 && r.j.capacity === cap);
  }
  r = await api('GET', '/api/teacher/classes', null, token);
  check('classes: list shows groups', r.j.classes.length === 1 && r.j.classes[0].groups.length === 2, r.j.classes[0].groups.length);

  // 7) approve requires class+group
  r = await api('POST', `/api/teacher/requests/${reqId}/approve`, {}, token);
  check('approve: requires class and group', r.status === 400, r.j.error);
  r = await api('POST', `/api/teacher/requests/${reqId}/approve`, { classId, groupId: 'nope' }, token);
  check('approve: rejects foreign group', r.status === 400, r.j.error);
  r = await api('POST', `/api/teacher/requests/${reqId}/approve`, { classId, groupId: groupIds[0] }, token);
  check('approve: succeeds', r.status === 200 && r.j.ok);

  // 8) now login works
  r = await api('POST', '/api/login', { seat: '100000001', password: 'ahmed2026' });
  check('login: works after approval', r.status === 200 && !!r.j.token, r.j && r.j.error);
  check('login: returns class and group', r.j.user.className === '3/2' && r.j.user.groupName === 'مجموعة أ',
        `${r.j.user.className} / ${r.j.user.groupName}`);
  const studentToken = r.j.token;
  r = await api('GET', '/api/me', null, studentToken);
  check('session: /api/me works for student', r.status === 200 && r.j.role === 'student', r.j && r.j.role);
  r = await api('POST', '/api/login', { seat: '100000001', password: 'wrongpass' });
  check('login: wrong password rejected', r.status === 401);

  // 9) group capacity = 5
  let lastReq = null;
  for (let i = 2; i <= 7; i++) {
    const seat = String(100000000 + i);
    r = await api('POST', '/api/request', { seat, password: 'pass' + i + 'x', secretQ: 'q', secretA: 'answer' + i });
    if (r.status !== 201) { check('capacity: request ' + i + ' created', false, r.j.error); continue; }
    lastReq = r.j.requestId;
    r = await api('POST', `/api/teacher/requests/${lastReq}/approve`, { classId, groupId: groupIds[0] }, token);
    if (i <= 5) check(`capacity: member ${i} of 5 accepted`, r.status === 200, r.status === 200 ? '' : r.j.error);
    else check(`capacity: member ${i} rejected (group is full)`, r.status === 409, r.j.error);
  }

  // 10) password recovery
  r = await api('POST', '/api/recover/question', { seat: '100000001' });
  check('recover: returns secret question', r.status === 200 && r.j.question === 'المدرسة؟', r.j.question);
  r = await api('POST', '/api/recover/reset', { seat: '100000001', answer: 'غلط', password: 'newpass123' });
  check('recover: wrong answer rejected', r.status === 401);
  r = await api('POST', '/api/recover/reset', { seat: '100000001', answer: 'الامتياز', password: 'newpass123' });
  check('recover: reset with right answer', r.status === 200);
  r = await api('POST', '/api/login', { seat: '100000001', password: 'newpass123' });
  check('recover: new password works', r.status === 200);
  r = await api('POST', '/api/login', { seat: '100000001', password: 'ahmed2026' });
  check('recover: old password no longer works', r.status === 401);

  // 11) auth guards
  r = await api('GET', '/api/teacher/requests');
  check('guard: teacher route needs auth', r.status === 401);
  r = await api('GET', '/api/teacher/requests', null, studentToken);
  check('guard: student token cannot use teacher route', r.status === 401);

  // 12) stats
  r = await api('GET', '/api/teacher/stats', null, token);
  check('stats: counts are consistent', r.j.roster === 300 && r.j.students === 5 && r.j.pending >= 1, JSON.stringify(r.j));

  // 13) rate limit
  let hits = 0;
  for (let i = 0; i < 12; i++) {
    const rr = await api('POST', '/api/login', { seat: '100000002', password: 'bad' + i });
    if (rr.status === 429) { hits++; break; }
  }
  check('security: brute force is throttled', hits === 1);

  // 14) static app
  const page = await fetch(base + '/');
  check('static: index.html served', page.status === 200 && (await page.text()).includes('Z-Project'));

  for (const r2 of results) console.log(r2[0], '-', r2[1], r2[2] ? '[' + r2[2] + ']' : '');
  const f = results.filter(x => x[0] === 'FAIL');
  console.log(f.length ? `\n${f.length} FAILED of ${results.length}` : `\nALL PASSED (${results.length})`);
  server.close();
  process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
