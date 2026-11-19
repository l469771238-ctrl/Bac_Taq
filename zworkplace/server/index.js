/* ============================================================
   Z-Project Workplace — API server (node:http + node:sqlite)
   تشغيل: node server/index.js   (الافتراضي http://0.0.0.0:3100)
   ============================================================ */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, id } = require('./db');
const A = require('./auth');

const PORT = +(process.env.PORT || 3100);
const ROOT = path.join(__dirname, '..');
const MAX_BODY = 512 * 1024;

/* ---------------- tiny helpers ---------------- */
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
}
function json(res, code, body) {
  const s = JSON.stringify(body);
  cors(res);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(s);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}
function tokenOf(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}
function me(req) { return A.readSession(tokenOf(req)); }
function audit(actor, action, detail) {
  db.prepare('INSERT INTO audit (id, at, actor, action, detail) VALUES (?,?,?,?,?)')
    .run(id('a'), Date.now(), actor || '-', action, detail ? JSON.stringify(detail).slice(0, 400) : null);
}
const q = {
  studentBySeat: db.prepare('SELECT * FROM students WHERE seat_id = ?'),
  rosterBySeat: db.prepare('SELECT * FROM roster WHERE seat_id = ?'),
};

/* ---------------- rate limit buckets ---------------- */
const bucket = (req, kind) => kind + ':' + (req.socket.remoteAddress || '?');

/* ---------------- routes ---------------- */
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, parts: pattern.split('/').filter(Boolean), handler });

/* ===== public ===== */

// فحص صحة السيرفر (بيستخدمه Docker/المنصة عشان تعرف إنه شغال)
route('GET', '/api/health', async (req, res) => {
  let dbOk = true;
  try { db.prepare('SELECT 1').get(); } catch (e) { dbOk = false; }
  return json(res, dbOk ? 200 : 503, {
    ok: dbOk,
    uptime: Math.round(process.uptime()),
    db: dbOk ? 'up' : 'down',
    version: '0.2'
  });
});

// هل رقم الجلوس موجود؟ ولو الطالب عنده حساب بالفعل؟
route('POST', '/api/lookup', async (req, res, body) => {
  const seat = String(body.seat || '').trim();
  if (!A.validSeat(seat)) return json(res, 400, { error: 'رقم الجلوس لازم 9 أرقام' });
  const who = q.rosterBySeat.get(seat);
  if (!who) return json(res, 404, { error: 'الرقم ده مش موجود في كشف الطلاب. راجع رقمك أو كلّم المدرس.' });
  const acc = q.studentBySeat.get(seat);
  return json(res, 200, {
    seat,
    name: who.full_name,
    grade: who.grade || null,
    hasAccount: !!acc,
    status: acc ? acc.status : null,
    hasPassword: !!(acc && acc.pass_hash)
  });
});

// إنشاء طلب حساب (المدرس هو اللي بيقبل)
route('POST', '/api/request', async (req, res, body) => {
  const seat = String(body.seat || '').trim();
  const pass = String(body.password || '');
  const sq = String(body.secretQ || '').trim().slice(0, 120);
  const sa = String(body.secretA || '').trim().slice(0, 120);

  if (!A.validSeat(seat)) return json(res, 400, { error: 'رقم الجلوس لازم 9 أرقام' });
  const who = q.rosterBySeat.get(seat);
  if (!who) return json(res, 404, { error: 'الرقم ده مش موجود في كشف الطلاب' });
  const pp = A.passProblem(pass);
  if (pp) return json(res, 400, { error: pp });
  if (!sq || sa.length < 3) return json(res, 400, { error: 'لازم سؤال سري وإجابته' });

  const existing = q.studentBySeat.get(seat);
  if (existing && existing.status === 'active') return json(res, 409, { error: 'الحساب ده مفعّل بالفعل — سجّل الدخول' });
  if (existing && existing.status === 'pending') return json(res, 409, { error: 'عندك طلب مستني موافقة المدرس' });

  const pending = db.prepare("SELECT id FROM requests WHERE seat_id = ? AND status = 'pending'").get(seat);
  if (pending) return json(res, 409, { error: 'عندك طلب مستني موافقة المدرس' });

  const rid = id('r');
  db.prepare(`INSERT INTO requests (id, seat_id, pass_hash, secret_q, secret_hash, status, created_at)
              VALUES (?,?,?,?,?, 'pending', ?)`)
    .run(rid, seat, A.hashPassword(pass), sq, A.hashPassword(sa.toLowerCase()), Date.now());
  audit(null, 'request.create', { seat, name: who.full_name });
  return json(res, 201, { ok: true, requestId: rid, name: who.full_name, status: 'pending' });
});

// تسجيل دخول الطالب (رقم الجلوس + كلمة المرور)
route('POST', '/api/login', async (req, res, body) => {
  const seat = String(body.seat || '').trim();
  const pass = String(body.password || '');
  const key = bucket(req, 'login:' + seat);
  if (A.tooMany(key)) return json(res, 429, { error: 'محاولات كتير — استنى 10 دقايق' });

  if (!A.validSeat(seat)) return json(res, 400, { error: 'رقم الجلوس لازم 9 أرقام' });
  const st = q.studentBySeat.get(seat);
  if (!st) {
    // ممكن الطالب عمل حساب ولسه مستني موافقة — نقوله كده بدل "غلط"
    const pend = db.prepare("SELECT id FROM requests WHERE seat_id = ? AND status = 'pending'").get(seat);
    if (pend) return json(res, 403, { error: 'طلبك لسه مستني موافقة المدرس' });
    return json(res, 401, { error: 'رقم الجلوس أو كلمة المرور غلط' });
  }
  if (st.status === 'pending') return json(res, 403, { error: 'طلبك لسه مستني موافقة المدرس' });
  if (st.status === 'rejected') return json(res, 403, { error: 'طلبك اترفض — كلّم المدرس' });
  if (st.locked_until && st.locked_until > Date.now()) return json(res, 423, { error: 'الحساب مقفول مؤقتًا، جرّب بعد شوية' });
  if (!A.verifyPassword(pass, st.pass_hash)) {
    const tries = (st.failed_tries || 0) + 1;
    const lock = tries >= 6 ? Date.now() + 5 * 60000 : null;
    db.prepare('UPDATE students SET failed_tries = ?, locked_until = ? WHERE id = ?').run(tries, lock, st.id);
    audit(seat, 'login.fail', { tries });
    return json(res, 401, { error: 'رقم الجلوس أو كلمة المرور غلط' });
  }
  A.clearTries(key);
  db.prepare('UPDATE students SET failed_tries = 0, locked_until = NULL, last_login = ? WHERE id = ?').run(Date.now(), st.id);

  const s = A.createSession('student', st.id);
  const roster = q.rosterBySeat.get(seat);
  const grp = st.group_id ? db.prepare('SELECT g.name AS gname, c.name AS cname FROM groups g JOIN classes c ON c.id=g.class_id WHERE g.id=?').get(st.group_id) : null;
  audit(seat, 'login.ok', {});
  return json(res, 200, {
    token: s.token,
    user: {
      role: 'student', id: st.id, seat, name: roster ? roster.full_name : null,
      className: grp ? grp.cname : null, groupName: grp ? grp.gname : null
    }
  });
});

// استرجاع كلمة المرور: يرجّع السؤال السري
route('POST', '/api/recover/question', async (req, res, body) => {
  const seat = String(body.seat || '').trim();
  if (!A.validSeat(seat)) return json(res, 400, { error: 'رقم الجلوس لازم 9 أرقام' });
  const st = q.studentBySeat.get(seat);
  if (!st || !st.secret_q) return json(res, 404, { error: 'مفيش سؤال سري متسجل للرقم ده — كلّم المدرس' });
  return json(res, 200, { question: st.secret_q });
});

route('POST', '/api/recover/reset', async (req, res, body) => {
  const seat = String(body.seat || '').trim();
  const answer = String(body.answer || '').trim().toLowerCase();
  const pass = String(body.password || '');
  const key = bucket(req, 'recover:' + seat);
  if (A.tooMany(key, 6)) return json(res, 429, { error: 'محاولات كتير — استنى شوية' });
  const st = q.studentBySeat.get(seat);
  if (!st) return json(res, 404, { error: 'مفيش حساب للرقم ده' });
  if (!A.verifyPassword(answer, st.secret_hash)) return json(res, 401, { error: 'الإجابة غلط' });
  const pp = A.passProblem(pass);
  if (pp) return json(res, 400, { error: pp });
  db.prepare('UPDATE students SET pass_hash = ?, failed_tries = 0, locked_until = NULL WHERE id = ?')
    .run(A.hashPassword(pass), st.id);
  A.clearTries(key);
  audit(seat, 'recover.reset', {});
  return json(res, 200, { ok: true });
});

/* ===== teacher ===== */
function requireTeacher(req, res) {
  const s = me(req);
  if (!s || s.role !== 'teacher') { json(res, 401, { error: 'لازم تسجيل دخول المدرس' }); return null; }
  return s;
}

route('POST', '/api/teacher/login', async (req, res, body) => {
  const email = String(body.email || '').trim().toLowerCase();
  const pass = String(body.password || '');
  const key = bucket(req, 'tlogin');
  if (A.tooMany(key, 10)) return json(res, 429, { error: 'محاولات كتير — استنى شوية' });
  const t = db.prepare('SELECT * FROM teachers WHERE lower(email) = ?').get(email);
  if (!t || !A.verifyPassword(pass, t.pass_hash)) return json(res, 401, { error: 'البريد أو كلمة المرور غلط' });
  A.clearTries(key);
  const s = A.createSession('teacher', t.id);
  return json(res, 200, { token: s.token, user: { role: 'teacher', id: t.id, name: t.name, email: t.email } });
});

// تحميل كشف الطلاب (المدرس) — بيقبل مصفوفة أو CSV نصّي
route('POST', '/api/teacher/roster', async (req, res, body) => {
  if (!requireTeacher(req, res)) return;
  let rows = body.rows;
  if (typeof body.csv === 'string') {
    rows = body.csv.split(/\r?\n/).map(l => l.split(',')).filter(c => c.length >= 2)
      .map(c => ({ seat: c[0], name: c[1], national_id: c[2], phone: c[3], guardian: c[4], grade: c[5] }));
  }
  if (!Array.isArray(rows)) return json(res, 400, { error: 'ابعت rows أو csv' });

  const ins = db.prepare(`INSERT INTO roster (seat_id, full_name, national_id, phone, guardian, grade, note, imported_at, imported_by)
                          VALUES (?,?,?,?,?,?,?,?,?)
                          ON CONFLICT(seat_id) DO UPDATE SET full_name=excluded.full_name,
                            national_id=excluded.national_id, phone=excluded.phone, guardian=excluded.guardian,
                            grade=excluded.grade, note=excluded.note, imported_at=excluded.imported_at`);
  let ok = 0; const bad = [];
  const now = Date.now();
  for (const r of rows) {
    const seat = String(r.seat || r.seat_id || '').replace(/\D/g, '');
    const name = String(r.name || r.full_name || '').trim();
    if (!A.validSeat(seat) || name.length < 5) { bad.push({ seat, name, why: 'رقم/اسم غير صالح' }); continue; }
    ins.run(seat, name, r.national_id || null, r.phone || null, r.guardian || null, r.grade || null, r.note || null, now, me(req).subject_id);
    ok++;
  }
  audit('teacher', 'roster.import', { ok, bad: bad.length });
  return json(res, 200, { ok, skipped: bad.length, problems: bad.slice(0, 20) });
});

route('GET', '/api/teacher/roster', async (req, res, body, params, url) => {
  if (!requireTeacher(req, res)) return;
  const search = (url.searchParams.get('q') || '').trim();
  const rows = search
    ? db.prepare('SELECT * FROM roster WHERE full_name LIKE ? OR seat_id LIKE ? ORDER BY full_name LIMIT 300').all('%' + search + '%', '%' + search + '%')
    : db.prepare('SELECT * FROM roster ORDER BY full_name LIMIT 300').all();
  const total = db.prepare('SELECT COUNT(*) c FROM roster').get().c;
  return json(res, 200, { total, rows });
});

route('DELETE', '/api/teacher/roster/:seat', async (req, res, body, params) => {
  if (!requireTeacher(req, res)) return;
  db.prepare('DELETE FROM roster WHERE seat_id = ?').run(params.seat);
  return json(res, 200, { ok: true });
});

// الطلبات
route('GET', '/api/teacher/requests', async (req, res, body, params, url) => {
  if (!requireTeacher(req, res)) return;
  const status = url.searchParams.get('status') || 'pending';
  const rows = db.prepare(`SELECT r.*, ro.full_name, ro.grade FROM requests r
                           JOIN roster ro ON ro.seat_id = r.seat_id
                           WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 300`).all(status);
  return json(res, 200, { rows });
});

route('POST', '/api/teacher/requests/:id/approve', async (req, res, body, params) => {
  const t = requireTeacher(req, res); if (!t) return;
  const rq = db.prepare("SELECT * FROM requests WHERE id = ? AND status = 'pending'").get(params.id);
  if (!rq) return json(res, 404, { error: 'الطلب مش موجود أو اتقرر' });
  let classId = String(body.classId || '').trim();
  let groupId = String(body.groupId || '').trim();
  if (!classId || !groupId) return json(res, 400, { error: 'لازم تحدد الفصل والمجموعة' });

  const grp = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  if (!grp || grp.class_id !== classId) return json(res, 400, { error: 'المجموعة مش تابعة للفصل ده' });
  const count = db.prepare("SELECT COUNT(*) c FROM students WHERE group_id = ? AND status='active'").get(groupId).c;
  if (count >= grp.capacity) return json(res, 409, { error: `المجموعة "${grp.name}" كاملة (${grp.capacity} أفراد) — اختار مجموعة تانية` });

  const exists = q.studentBySeat.get(rq.seat_id);
  if (exists && exists.status === 'active') return json(res, 409, { error: 'الطالب عنده حساب مفعّل بالفعل' });

  const sid = exists ? exists.id : id('s');
  if (exists) {
    db.prepare(`UPDATE students SET pass_hash=?, secret_q=?, secret_hash=?, status='active',
                class_id=?, group_id=?, approved_at=?, approved_by=?, failed_tries=0, locked_until=NULL WHERE id=?`)
      .run(rq.pass_hash, rq.secret_q, rq.secret_hash, classId, groupId, Date.now(), t.subject_id, sid);
  } else {
    db.prepare(`INSERT INTO students (id, seat_id, pass_hash, secret_q, secret_hash, status, class_id, group_id, created_at, approved_at, approved_by)
                VALUES (?,?,?,?,?, 'active', ?,?,?,?,?)`)
      .run(sid, rq.seat_id, rq.pass_hash, rq.secret_q, rq.secret_hash, classId, groupId, Date.now(), Date.now(), t.subject_id);
  }
  db.prepare("UPDATE requests SET status='approved', decided_at=?, decided_by=? WHERE id=?")
    .run(Date.now(), t.subject_id, rq.id);
  audit('teacher', 'request.approve', { seat: rq.seat_id, classId, groupId });
  return json(res, 200, { ok: true, studentId: sid });
});

route('POST', '/api/teacher/requests/:id/reject', async (req, res, body, params) => {
  const t = requireTeacher(req, res); if (!t) return;
  const rq = db.prepare("SELECT * FROM requests WHERE id = ? AND status = 'pending'").get(params.id);
  if (!rq) return json(res, 404, { error: 'الطلب مش موجود' });
  db.prepare("UPDATE requests SET status='rejected', decided_at=?, decided_by=?, note=? WHERE id=?")
    .run(Date.now(), t.subject_id, String(body.note || '').slice(0, 200), rq.id);
  audit('teacher', 'request.reject', { seat: rq.seat_id });
  return json(res, 200, { ok: true });
});

// الفصول والمجموعات
route('GET', '/api/teacher/classes', async (req, res) => {
  if (!requireTeacher(req, res)) return;
  const classes = db.prepare('SELECT * FROM classes ORDER BY name').all();
  for (const c of classes) {
    c.groups = db.prepare(`SELECT g.*, (SELECT COUNT(*) FROM students s WHERE s.group_id=g.id AND s.status='active') AS filled
                           FROM groups g WHERE g.class_id = ? ORDER BY g.name`).all(c.id);
  }
  return json(res, 200, { classes });
});

route('POST', '/api/teacher/classes', async (req, res, body) => {
  if (!requireTeacher(req, res)) return;
  const name = String(body.name || '').trim().slice(0, 40);
  if (!name) return json(res, 400, { error: 'اكتب اسم الفصل' });
  const cid = id('c');
  db.prepare('INSERT INTO classes (id, name, grade, created_at) VALUES (?,?,?,?)').run(cid, name, body.grade || null, Date.now());
  audit('teacher', 'class.create', { name });
  return json(res, 201, { id: cid, name });
});

route('POST', '/api/teacher/classes/:id/groups', async (req, res, body, params) => {
  if (!requireTeacher(req, res)) return;
  const name = String(body.name || '').trim().slice(0, 40);
  const cap = Math.max(1, Math.min(20, +(body.capacity || 5)));
  if (!name) return json(res, 400, { error: 'اكتب اسم المجموعة' });
  if (!db.prepare('SELECT id FROM classes WHERE id = ?').get(params.id)) return json(res, 404, { error: 'الفصل مش موجود' });
  const gid = id('g');
  db.prepare('INSERT INTO groups (id, class_id, name, capacity, created_at) VALUES (?,?,?,?,?)')
    .run(gid, params.id, name, cap, Date.now());
  audit('teacher', 'group.create', { name, cap });
  return json(res, 201, { id: gid, name, capacity: cap });
});

route('GET', '/api/teacher/students', async (req, res, body, params, url) => {
  if (!requireTeacher(req, res)) return;
  const rows = db.prepare(`SELECT s.id, s.seat_id, s.status, s.last_login, ro.full_name, ro.phone,
                                  c.name AS class_name, g.name AS group_name
                           FROM students s JOIN roster ro ON ro.seat_id = s.seat_id
                           LEFT JOIN classes c ON c.id = s.class_id
                           LEFT JOIN groups g ON g.id = s.group_id
                           ORDER BY ro.full_name LIMIT 300`).all();
  return json(res, 200, { rows });
});

route('GET', '/api/teacher/stats', async (req, res) => {
  if (!requireTeacher(req, res)) return;
  const g = n => db.prepare(n).get().c;
  return json(res, 200, {
    roster: g('SELECT COUNT(*) c FROM roster'),
    students: g("SELECT COUNT(*) c FROM students WHERE status='active'"),
    pending: g("SELECT COUNT(*) c FROM requests WHERE status='pending'"),
    classes: g('SELECT COUNT(*) c FROM classes'),
    groups: g('SELECT COUNT(*) c FROM groups')
  });
});

/* ===== session ===== */
route('GET', '/api/me', async (req, res) => {
  const s = me(req);
  if (!s) return json(res, 401, { error: 'مش مسجل دخول' });
  if (s.role === 'teacher') {
    const t = db.prepare('SELECT id, name, email FROM teachers WHERE id = ?').get(s.subject_id);
    return json(res, 200, { role: 'teacher', user: t });
  }
  const st = db.prepare(`SELECT s.*, ro.full_name FROM students s JOIN roster ro ON ro.seat_id=s.seat_id WHERE s.id=?`).get(s.subject_id);
  if (!st) return json(res, 401, { error: 'الحساب مش موجود' });
  const g = st.group_id
    ? db.prepare('SELECT g.name AS gname, c.name AS cname FROM groups g JOIN classes c ON c.id=g.class_id WHERE g.id=?').get(st.group_id)
    : null;
  return json(res, 200, { role: 'student', user: {
    id: st.id, seat: st.seat_id, name: st.full_name,
    className: g ? g.cname : null, groupName: g ? g.gname : null
  } });
});

route('POST', '/api/logout', async (req, res) => {
  A.destroySession(tokenOf(req));
  return json(res, 200, { ok: true });
});

/* ---------------- static files (web app) ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  cors(res);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600'
  });
  fs.createReadStream(file).pipe(res);
}

/* ---------------- dispatcher ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

  if (pathname.startsWith('/api/')) {
    const parts = pathname.split('/').filter(Boolean);
    for (const r of routes) {
      if (r.method !== req.method) continue;
      if (r.parts.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < r.parts.length; i++) {
        const p = r.parts[i];
        if (p.startsWith(':')) params[p.slice(1)] = parts[i];
        else if (p !== parts[i]) { ok = false; break; }
      }
      if (!ok) continue;
      let body = {};
      if (req.method !== 'GET') {
        try { body = await readBody(req); }
        catch (e) { return json(res, 400, { error: 'طلب غير صالح' }); }
      }
      try {
        await r.handler(req, res, body, params, url);
      } catch (e) {
        console.error('API error', pathname, e);
        if (!res.headersSent) json(res, 500, { error: 'حصل خطأ في السيرفر' });
      }
      return;
    }
    return json(res, 404, { error: 'المسار مش موجود' });
  }

  serveStatic(req, res, pathname);
});

/* ---------------- first-run bootstrap ---------------- */
function bootstrap() {
  const n = db.prepare('SELECT COUNT(*) c FROM teachers').get().c;
  if (n === 0) {
    const email = process.env.TEACHER_EMAIL || 'gasser@z-school.local';
    const pass = process.env.TEACHER_PASS || 'zwork2026';
    db.prepare('INSERT INTO teachers (id, name, email, pass_hash, created_at) VALUES (?,?,?,?,?)')
      .run(id('t'), process.env.TEACHER_NAME || 'مستر جاسر', email, A.hashPassword(pass), Date.now());
    console.log(`👤 teacher created: ${email} / ${pass}  (غيّرها من TEACHER_PASS)`);
  }
}

if (require.main === module) {
  bootstrap();
  server.listen(PORT, '0.0.0.0', () => console.log(`Z-Project server on http://0.0.0.0:${PORT}`));
}

module.exports = { server, bootstrap };
