/* ============================================================
   Z-Project Workplace — سيرفر الفصل
   تشغيل:  node server/index.js           (الافتراضي http://0.0.0.0:3100)
   متغيرات: PORT · ZDB · TEACHER_EMAIL · TEACHER_PASS · TEACHER_NAME

   الفكرة:
   المدرس عنده قاعدة بيانات فيها كود كل طالب واسمه. الطالب بيكتب كوده،
   اسمه بيظهر، ويسجّل. التسجيل **بيتحفظ** — لما يرجع يدخل يلاقي حسابه
   زي ما هو، إلا لو سجّل خروج.
   ============================================================ */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { db, id, setting, setSetting, approvalRequired } = require('./db');
const A = require('./auth');

const PORT = +(process.env.PORT || 3100);
const ROOT = path.join(__dirname, '..');
const MAX_BODY = 4 * 1024 * 1024;   // قاعدة بيانات المدرس ممكن تكون كبيرة

/* ---------------- helpers ---------------- */
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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
const bucket = (req, kind) => kind + ':' + (req.socket.remoteAddress || '?');

/* ---------------- routes ---------------- */
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, parts: pattern.split('/').filter(Boolean), handler });

/* ============================================================
   عام — الطالب
   ============================================================ */

// فحص صحة السيرفر
route('GET', '/api/health', async (req, res) => {
  let dbOk = true, n = 0;
  try {
    db.prepare('SELECT 1').get();
    n = db.prepare('SELECT COUNT(*) c FROM roster').get().c;
  } catch (e) { dbOk = false; }
  return json(res, dbOk ? 200 : 503, {
    ok: dbOk, uptime: Math.round(process.uptime()), db: dbOk ? 'up' : 'down',
    version: '0.3', roster: n, approvalRequired: approvalRequired()
  });
});

/**
 * الطالب يكتب كوده -> بيرجع اسمه وحالة حسابه.
 * ده اللي بيخلي الاسم يظهر لوحده قبل التسجيل.
 */
route('POST', '/api/lookup', async (req, res, body) => {
  const code = A.normalizeCode(body.code !== undefined ? body.code : body.seat);
  const bad = A.codeProblem(code);
  if (bad) return json(res, 400, { error: bad });

  const who = db.prepare('SELECT * FROM roster WHERE code = ?').get(code);
  if (!who) return json(res, 404, { error: 'الكود ده مش موجود — راجع الكود اللي معاك أو كلّم المدرس' });

  const acc = db.prepare('SELECT * FROM students WHERE code = ?').get(code);
  return json(res, 200, {
    code,
    name: who.full_name,
    grade: who.grade || null,
    hasAccount: !!acc,
    status: acc ? acc.status : null,
    hasPassword: !!(acc && acc.pass_hash)
  });
});

/**
 * التسجيل.
 * - الافتراضي: التسجيل بيتحفظ فورًا (status = active) والطالب بيدخل على طول.
 * - لو المدرس فعّل "مراجعة التسجيلات": الطلب بيتحفظ كـ pending لحد الموافقة.
 * - لو الطالب عنده حساب وحاول يسجّل تاني بكلمة مرور صح: بنرجّعه لحسابه (مش بنعمله واحد جديد).
 */
route('POST', '/api/register', async (req, res, body) => {
  const code = A.normalizeCode(body.code !== undefined ? body.code : body.seat);
  const pass = String(body.password || '');
  const sq = String(body.secretQ || '').trim().slice(0, 120);
  const sa = String(body.secretA || '').trim().slice(0, 120);

  const bad = A.codeProblem(code);
  if (bad) return json(res, 400, { error: bad });
  const who = db.prepare('SELECT * FROM roster WHERE code = ?').get(code);
  if (!who) return json(res, 404, { error: 'الكود ده مش موجود في كشف الطلاب' });

  const pp = A.passProblem(pass);
  if (pp) return json(res, 400, { error: pp });
  if (!sq || sa.length < 3) return json(res, 400, { error: 'لازم سؤال سري وإجابته' });

  const existing = db.prepare('SELECT * FROM students WHERE code = ?').get(code);

  // عنده حساب بالفعل؟ لو كلمة المرور صح نرجّعه لحسابه
  if (existing) {
    if (existing.status === 'blocked') return json(res, 403, { error: 'حسابك موقوف — كلّم المدرس' });
    if (existing.pass_hash && A.verifyPassword(pass, existing.pass_hash)) {
      const s = A.createSession('student', existing.id);
      audit(code, 'register.existing', {});
      return json(res, 200, { ok: true, existing: true, token: s.token, status: existing.status, user: studentUser(existing) });
    }
    return json(res, 409, { error: 'الكود ده مسجّل بالفعل — سجّل الدخول بكلمة المرور، أو استرجعها بالسؤال السري' });
  }

  // طلب قديم مستني؟
  const pendingReq = db.prepare("SELECT * FROM requests WHERE code = ? AND status = 'pending'").get(code);
  if (pendingReq) return json(res, 409, { error: 'عندك تسجيل مستني — استنى المدرس يراجعه', status: 'pending' });

  const needApproval = approvalRequired();
  const status = needApproval ? 'pending' : 'active';
  const now = Date.now();

  db.exec('BEGIN');
  let sid;
  try {
    sid = id('s');
    db.prepare(`INSERT INTO students (id, code, pass_hash, secret_q, secret_hash, status, created_at, approved_at)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(sid, code, A.hashPassword(pass), sq, A.hashPassword(sa.toLowerCase()), status, now,
           needApproval ? null : now);

    if (needApproval) {
      const rid = id('r');
      db.prepare(`INSERT INTO requests (id, code, pass_hash, secret_q, secret_hash, status, created_at)
                  VALUES (?,?,?,?,?, 'pending', ?)`)
        .run(rid, code, db.prepare('SELECT pass_hash FROM students WHERE id=?').get(sid).pass_hash,
             sq, db.prepare('SELECT secret_hash FROM students WHERE id=?').get(sid).secret_hash, now);
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw e;
  }

  audit(code, 'register.new', { status, name: who.full_name });

  const row = db.prepare('SELECT * FROM students WHERE id = ?').get(sid);
  // التسجيل محفوظ على طول. لو محتاج مراجعة مفيش جلسة لحد ما يتقبل.
  if (status !== 'active') {
    return json(res, 201, { ok: true, status, user: studentUser(row) });
  }
  const token = A.createSession('student', sid).token;
  return json(res, 201, { ok: true, status, token, user: studentUser(row) });
});

/* -------------------- دخول الطالب -------------------- */
route('POST', '/api/login', async (req, res, body) => {
  const code = A.normalizeCode(body.code !== undefined ? body.code : body.seat);
  const pass = String(body.password || '');
  const key = bucket(req, 'login:' + code);
  if (A.tooMany(key)) return json(res, 429, { error: 'محاولات كتير — استنى 10 دقايق' });

  const bad = A.codeProblem(code);
  if (bad) return json(res, 400, { error: bad });

  const st = db.prepare('SELECT * FROM students WHERE code = ?').get(code);
  if (!st) {
    const pend = db.prepare("SELECT id FROM requests WHERE code = ? AND status = 'pending'").get(code);
    if (pend) return json(res, 403, { error: 'تسجيلك مستني — استنى المدرس يراجعه' });
    return json(res, 401, { error: 'الكود أو كلمة المرور غلط' });
  }
  if (st.status === 'pending') return json(res, 403, { error: 'تسجيلك مستني — استنى المدرس يراجعه' });
  if (st.status === 'rejected') return json(res, 403, { error: 'تسجيلك اترفض — كلّم المدرس' });
  if (st.status === 'blocked') return json(res, 403, { error: 'حسابك موقوف — كلّم المدرس' });
  if (st.locked_until && st.locked_until > Date.now()) return json(res, 423, { error: 'الحساب مقفول مؤقتًا، جرّب بعد شوية' });

  if (!A.verifyPassword(pass, st.pass_hash)) {
    const tries = (st.failed_tries || 0) + 1;
    const lock = tries >= 6 ? Date.now() + 5 * 60000 : null;
    db.prepare('UPDATE students SET failed_tries = ?, locked_until = ? WHERE id = ?').run(tries, lock, st.id);
    audit(code, 'login.fail', { tries });
    return json(res, 401, { error: 'الكود أو كلمة المرور غلط' });
  }
  A.clearTries(key);
  db.prepare('UPDATE students SET failed_tries = 0, locked_until = NULL, last_login = ? WHERE id = ?')
    .run(Date.now(), st.id);

  const s = A.createSession('student', st.id);
  audit(code, 'login.ok', {});
  return json(res, 200, { token: s.token, user: studentUser(Object.assign({}, st, { last_login: Date.now() })) });
});

/** بيانات الطالب اللي بترجع للواجهة (من غير أي هاش) */
function studentUser(st) {
  const ro = db.prepare('SELECT full_name, grade FROM roster WHERE code = ?').get(st.code);
  const grp = st.group_id
    ? db.prepare('SELECT g.name AS gname, c.name AS cname FROM groups g JOIN classes c ON c.id = g.class_id WHERE g.id = ?').get(st.group_id)
    : null;
  return {
    role: 'student',
    id: st.id,
    code: st.code,
    name: ro ? ro.full_name : null,
    grade: ro ? ro.grade : null,
    status: st.status,
    className: grp ? grp.cname : null,
    groupName: grp ? grp.gname : null,
    createdAt: st.created_at || null,
    lastLogin: st.last_login || null
  };
}

/* -------------------- استرجاع كلمة المرور -------------------- */
route('POST', '/api/recover/question', async (req, res, body) => {
  const code = A.normalizeCode(body.code !== undefined ? body.code : body.seat);
  const bad = A.codeProblem(code);
  if (bad) return json(res, 400, { error: bad });
  const st = db.prepare('SELECT * FROM students WHERE code = ?').get(code);
  if (!st || !st.secret_q) return json(res, 404, { error: 'مفيش سؤال سري للكود ده — كلّم المدرس' });
  return json(res, 200, { question: st.secret_q });
});

route('POST', '/api/recover/reset', async (req, res, body) => {
  const code = A.normalizeCode(body.code !== undefined ? body.code : body.seat);
  const answer = String(body.answer || '').trim().toLowerCase();
  const pass = String(body.password || '');
  const key = bucket(req, 'recover:' + code);
  if (A.tooMany(key, 6)) return json(res, 429, { error: 'محاولات كتير — استنى شوية' });

  const st = db.prepare('SELECT * FROM students WHERE code = ?').get(code);
  if (!st) return json(res, 404, { error: 'مفيش حساب للكود ده' });
  if (!A.verifyPassword(answer, st.secret_hash)) return json(res, 401, { error: 'الإجابة غلط' });
  const pp = A.passProblem(pass);
  if (pp) return json(res, 400, { error: pp });
  db.prepare('UPDATE students SET pass_hash = ?, failed_tries = 0, locked_until = NULL WHERE id = ?')
    .run(A.hashPassword(pass), st.id);
  A.clearTries(key);
  audit(code, 'recover.reset', {});
  return json(res, 200, { ok: true });
});

/* -------------------- الجلسة -------------------- */
route('GET', '/api/me', async (req, res) => {
  const s = me(req);
  if (!s) return json(res, 401, { error: 'مش مسجل دخول' });
  if (s.role === 'teacher') {
    const t = db.prepare('SELECT id, name, email FROM teachers WHERE id = ?').get(s.subject_id);
    if (!t) return json(res, 401, { error: 'الحساب مش موجود' });
    return json(res, 200, { role: 'teacher', user: t });
  }
  const st = db.prepare('SELECT * FROM students WHERE id = ?').get(s.subject_id);
  if (!st) return json(res, 401, { error: 'الحساب مش موجود' });
  return json(res, 200, { role: 'student', user: studentUser(st) });
});

route('POST', '/api/logout', async (req, res) => {
  const t = tokenOf(req);
  A.destroySession(t);
  return json(res, 200, { ok: true });
});

// تغيير كلمة المرور وهو داخل
route('POST', '/api/me/password', async (req, res, body) => {
  const s = me(req);
  if (!s || s.role !== 'student') return json(res, 401, { error: 'مش مسجل دخول' });
  const st = db.prepare('SELECT * FROM students WHERE id = ?').get(s.subject_id);
  if (!st) return json(res, 401, { error: 'الحساب مش موجود' });
  if (!A.verifyPassword(String(body.current || ''), st.pass_hash)) return json(res, 401, { error: 'كلمة المرور الحالية غلط' });
  const pp = A.passProblem(String(body.password || ''));
  if (pp) return json(res, 400, { error: pp });
  db.prepare('UPDATE students SET pass_hash = ? WHERE id = ?').run(A.hashPassword(String(body.password)), st.id);
  audit(st.code, 'password.change', {});
  return json(res, 200, { ok: true });
});

/* ============================================================
   المدرس
   ============================================================ */
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

/* ---------- رفع قاعدة بيانات الطلاب (كشف الأكواد) ---------- */
/** يحوّل صفوف بأي أسماء أعمدة معقولة -> { code, name, ... } */
function normRow(r) {
  const g = (keys) => {
    for (const k of keys) {
      if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') return String(r[k]).trim();
    }
    return '';
  };
  return {
    code: A.normalizeCode(g(['code', 'student_code', 'كود', 'الكود', 'code_id', 'id_code', 'student_id', 'id'])),
    name: g(['name', 'full_name', 'student_name', 'اسم', 'الاسم', 'اسم الطالب']),
    national_id: g(['national_id', 'national', 'ssn', 'الرقم القومي', 'رقم قومي']) || null,
    phone: g(['phone', 'mobile', 'tel', 'الموبايل', 'الهاتف', 'تليفون']) || null,
    guardian: g(['guardian', 'parent', 'ولي الأمر', 'ولي الامر', 'الأب']) || null,
    grade: g(['grade', 'class', 'section', 'الصف', 'الفصل', 'المستوى']) || null,
    note: g(['note', 'notes', 'ملاحظات', 'ملاحظة']) || null
  };
}

function importRoster(req, rows) {
  const ins = db.prepare(`INSERT INTO roster (code, full_name, national_id, phone, guardian, grade, note, imported_at, imported_by)
                          VALUES (?,?,?,?,?,?,?,?,?)
                          ON CONFLICT(code) DO UPDATE SET full_name=excluded.full_name,
                            national_id=excluded.national_id, phone=excluded.phone, guardian=excluded.guardian,
                            grade=COALESCE(excluded.grade, roster.grade), note=excluded.note,
                            imported_at=excluded.imported_at`);
  let ok = 0, skipped = 0; const problems = [];
  const now = Date.now();
  const actor = me(req) ? me(req).subject_id : null;
  db.exec('BEGIN');
  try {
    for (const raw of rows) {
      const r = normRow(raw);
      const bad = A.codeProblem(r.code);
      if (bad || r.name.length < 3) {
        skipped++;
        if (problems.length < 25) problems.push({ code: r.code, name: r.name, why: bad || 'الاسم قصير' });
        continue;
      }
      if (r.name.length > 80) r.name = r.name.slice(0, 80);
      ins.run(r.code, r.name, r.national_id, r.phone, r.guardian, r.grade, r.note, now, actor);
      ok++;
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw e;
  }
  return { ok, skipped, problems };
}

/** CSV بسيط بيدعم علامات التنصيص والفواصل العربية */
function parseCSV(text) {
  const t = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const sep = ['\t', ';', ','].map(s => [s, (t.split('\n')[0].match(new RegExp('\\' + s, 'g')) || []).length])
    .sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

/** يحوّل مصفوفة CSV -> كائنات، بيدوّر على صف العناوين */
function csvToRows(text) {
  const table = parseCSV(text);
  if (!table.length) return [];
  const HEAD = ['code', 'name', 'id', 'كود', 'الكود', 'اسم', 'الاسم', 'full_name', 'student_name'];
  let headIdx = table.findIndex(r => r.some(c => HEAD.includes(String(c).trim().toLowerCase())));
  let head = null;
  if (headIdx >= 0) head = table[headIdx].map(c => String(c).trim().toLowerCase());
  const body = head ? table.slice(headIdx + 1) : table;
  if (!head) head = ['code', 'name'];   // ملف من غير عناوين: أول عمود كود، تاني اسم
  return body.map(r => {
    const o = {};
    head.forEach((h, i) => { if (h) o[h] = r[i]; });
    return o;
  });
}

// رفع كشف الطلاب: { rows: [...] } أو { csv: "..." } أو { students: [...] }
route('POST', '/api/teacher/roster', async (req, res, body) => {
  if (!requireTeacher(req, res)) return;
  let rows = body.rows || body.students || body.roster;
  if (!Array.isArray(rows) && typeof body.csv === 'string') rows = csvToRows(body.csv);
  if (!Array.isArray(rows)) return json(res, 400, { error: 'ابعت rows أو csv' });
  if (!rows.length) return json(res, 400, { error: 'الملف فاضي' });
  if (rows.length > 5000) return json(res, 400, { error: 'الحد الأقصى 5000 طالب في المرة' });

  const r = importRoster(req, rows);
  audit('teacher', 'roster.import', { ok: r.ok, skipped: r.skipped });
  const total = db.prepare('SELECT COUNT(*) c FROM roster').get().c;
  return json(res, 200, Object.assign({ total }, r));
});

// استبدال الكشف بالكامل (لما المدرس يرفع نسخة محدّثة)
route('PUT', '/api/teacher/roster', async (req, res, body) => {
  if (!requireTeacher(req, res)) return;
  let rows = body.rows || body.students || body.roster;
  if (!Array.isArray(rows) && typeof body.csv === 'string') rows = csvToRows(body.csv);
  if (!Array.isArray(rows)) return json(res, 400, { error: 'ابعت rows أو csv' });
  // استبدال حقيقي: بنشيل الكشف القديم بس منسيبش حساب أي طالب مسجّل
  db.exec('BEGIN');
  try {
    db.exec("DELETE FROM roster WHERE code NOT IN (SELECT code FROM students)");
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
  const r = importRoster(req, rows);
  audit('teacher', 'roster.replace', { ok: r.ok });
  const total = db.prepare('SELECT COUNT(*) c FROM roster').get().c;
  return json(res, 200, Object.assign({ total }, r));
});

route('GET', '/api/teacher/roster', async (req, res, body, params, url) => {
  if (!requireTeacher(req, res)) return;
  const search = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(1000, +(url.searchParams.get('limit') || 300));
  const rows = search
    ? db.prepare(`SELECT r.*, s.status AS account_status FROM roster r
                  LEFT JOIN students s ON s.code = r.code
                  WHERE r.full_name LIKE ? OR r.code LIKE ?
                  ORDER BY r.full_name LIMIT ?`).all('%' + search + '%', '%' + search + '%', limit)
    : db.prepare(`SELECT r.*, s.status AS account_status FROM roster r
                  LEFT JOIN students s ON s.code = r.code
                  ORDER BY r.full_name LIMIT ?`).all(limit);
  const total = db.prepare('SELECT COUNT(*) c FROM roster').get().c;
  const registered = db.prepare('SELECT COUNT(*) c FROM students').get().c;
  return json(res, 200, { total, registered, rows });
});

route('DELETE', '/api/teacher/roster/:code', async (req, res, body, params) => {
  if (!requireTeacher(req, res)) return;
  db.prepare('DELETE FROM roster WHERE code = ?').run(decodeURIComponent(params.code));
  return json(res, 200, { ok: true });
});

/* ---------- الطلبات (لما "مراجعة التسجيلات" مفعّلة) ---------- */
route('GET', '/api/teacher/requests', async (req, res, body, params, url) => {
  if (!requireTeacher(req, res)) return;
  const status = url.searchParams.get('status') || 'pending';
  const rows = db.prepare(`SELECT q.*, ro.full_name, ro.grade FROM requests q
                           JOIN roster ro ON ro.code = q.code
                           WHERE q.status = ? ORDER BY q.created_at DESC LIMIT 300`).all(status);
  return json(res, 200, { rows });
});

route('POST', '/api/teacher/requests/:id/approve', async (req, res, body, params) => {
  const t = requireTeacher(req, res);
  if (!t) return;
  const rq = db.prepare("SELECT * FROM requests WHERE id = ? AND status = 'pending'").get(params.id);
  if (!rq) return json(res, 404, { error: 'الطلب مش موجود أو اتقرر' });

  // class/group اختيارية — لو اتبعتت بنتحقق منها، ولو لأ الطالب بيتفعّل من غير توزيع
  const classId = String(body.classId || '').trim() || null;
  const groupId = String(body.groupId || '').trim() || null;
  if (groupId && !classId) return json(res, 400, { error: 'لو حددت مجموعة لازم تحدد الفصل' });
  if (classId) {
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
    if (!cls) return json(res, 400, { error: 'الفصل مش موجود' });
  }
  if (groupId) {
    const grp = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
    if (!grp) return json(res, 400, { error: 'المجموعة مش موجودة' });
    if (classId && grp.class_id !== classId) return json(res, 400, { error: 'المجموعة مش تابعة للفصل ده' });
    const count = db.prepare("SELECT COUNT(*) c FROM students WHERE group_id = ? AND status='active'").get(groupId).c;
    if (count >= grp.capacity) return json(res, 409, { error: `المجموعة "${grp.name}" كاملة (${grp.capacity} أفراد) — اختار مجموعة تانية` });
  }

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE students SET status='active', class_id=?, group_id=?, approved_at=?, approved_by=?
                WHERE code=?`).run(classId, groupId, Date.now(), t.subject_id, rq.code);
    db.prepare("UPDATE requests SET status='approved', decided_at=?, decided_by=? WHERE id=?")
      .run(Date.now(), t.subject_id, rq.id);
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
  audit('teacher', 'request.approve', { code: rq.code });
  return json(res, 200, { ok: true });
});

route('POST', '/api/teacher/requests/:id/reject', async (req, res, body, params) => {
  const t = requireTeacher(req, res);
  if (!t) return;
  const rq = db.prepare("SELECT * FROM requests WHERE id = ? AND status = 'pending'").get(params.id);
  if (!rq) return json(res, 404, { error: 'الطلب مش موجود أو اتقرر' });
  db.exec('BEGIN');
  try {
    db.prepare("UPDATE requests SET status='rejected', decided_at=?, decided_by=? WHERE id=?")
      .run(Date.now(), t.subject_id, rq.id);
    db.prepare("UPDATE students SET status='rejected' WHERE code=?").run(rq.code);
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
  audit('teacher', 'request.reject', { code: rq.code });
  return json(res, 200, { ok: true });
});

/* ---------- الفصول والمجموعات ---------- */
route('GET', '/api/teacher/classes', async (req, res) => {
  if (!requireTeacher(req, res)) return;
  const classes = db.prepare('SELECT * FROM classes ORDER BY name').all();
  for (const c of classes) {
    c.groups = db.prepare(`SELECT g.*, (SELECT COUNT(*) FROM students s WHERE s.group_id=g.id AND s.status='active') AS filled
                           FROM groups g WHERE g.class_id = ? ORDER BY g.name`).all(c.id);
    c.students = db.prepare("SELECT COUNT(*) c FROM students WHERE class_id=? AND status='active'").get(c.id).c;
  }
  return json(res, 200, { classes });
});

route('POST', '/api/teacher/classes', async (req, res, body) => {
  if (!requireTeacher(req, res)) return;
  const name = String(body.name || '').trim().slice(0, 40);
  if (!name) return json(res, 400, { error: 'اكتب اسم الفصل' });
  const cid = id('c');
  db.prepare('INSERT INTO classes (id, name, grade, created_at) VALUES (?,?,?,?)')
    .run(cid, name, body.grade ? String(body.grade).slice(0, 20) : null, Date.now());
  audit('teacher', 'class.create', { name });
  return json(res, 201, { id: cid, name });
});

route('POST', '/api/teacher/classes/:id/groups', async (req, res, body, params) => {
  if (!requireTeacher(req, res)) return;
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(params.id);
  if (!cls) return json(res, 404, { error: 'الفصل مش موجود' });
  const name = String(body.name || '').trim().slice(0, 40);
  if (!name) return json(res, 400, { error: 'اكتب اسم المجموعة' });
  const cap = Math.max(2, Math.min(50, +(body.capacity || 5)));
  const gid = id('g');
  db.prepare('INSERT INTO groups (id, class_id, name, capacity, created_at) VALUES (?,?,?,?,?)')
    .run(gid, params.id, name, cap, Date.now());
  audit('teacher', 'group.create', { name, cap });
  return json(res, 201, { id: gid, name, capacity: cap });
});

// حط طالب في فصل/مجموعة أو شيله
route('PATCH', '/api/teacher/students/:code', async (req, res, body, params) => {
  if (!requireTeacher(req, res)) return;
  const code = A.normalizeCode(decodeURIComponent(params.code));
  const st = db.prepare('SELECT * FROM students WHERE code = ?').get(code);
  if (!st) return json(res, 404, { error: 'مفيش حساب للكود ده' });
  let classId = body.classId !== undefined ? (String(body.classId || '').trim() || null) : st.class_id;
  let groupId = body.groupId !== undefined ? (String(body.groupId || '').trim() || null) : st.group_id;
  if (groupId) {
    const grp = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
    if (!grp) return json(res, 400, { error: 'المجموعة مش موجودة' });
    if (classId && grp.class_id !== classId) return json(res, 400, { error: 'المجموعة مش تابعة للفصل ده' });
    const n = db.prepare("SELECT COUNT(*) c FROM students WHERE group_id=? AND status='active' AND code<>?").get(groupId, code).c;
    if (n >= grp.capacity) return json(res, 409, { error: 'المجموعة كاملة' });
  }
  db.prepare('UPDATE students SET class_id=?, group_id=? WHERE code=?').run(classId, groupId, code);
  return json(res, 200, { ok: true });
});

// تفعيل / إيقاف حساب
route('POST', '/api/teacher/students/:code/status', async (req, res, body, params) => {
  if (!requireTeacher(req, res)) return;
  const code = A.normalizeCode(decodeURIComponent(params.code));
  const status = String(body.status || '');
  if (!['active', 'blocked'].includes(status)) return json(res, 400, { error: 'حالة غير معروفة' });
  db.prepare('UPDATE students SET status=? WHERE code=?').run(status, code);
  audit('teacher', 'student.status', { code, status });
  return json(res, 200, { ok: true });
});

/* ---------- الطلاب المسجلين ---------- */
route('GET', '/api/teacher/students', async (req, res, body, params, url) => {
  if (!requireTeacher(req, res)) return;
  const search = (url.searchParams.get('q') || '').trim();
  const where = search ? 'WHERE ro.full_name LIKE ? OR s.code LIKE ?' : '';
  const args = search ? ['%' + search + '%', '%' + search + '%'] : [];
  const rows = db.prepare(`SELECT s.id, s.code, s.status, s.created_at, s.last_login,
                                  ro.full_name, ro.phone, ro.grade,
                                  c.name AS class_name, g.name AS group_name
                           FROM students s
                           JOIN roster ro ON ro.code = s.code
                           LEFT JOIN classes c ON c.id = s.class_id
                           LEFT JOIN groups g ON g.id = s.group_id
                           ${where}
                           ORDER BY s.created_at DESC LIMIT 500`).all(...args);
  return json(res, 200, { rows });
});

/* ---------- إحصائيات ---------- */
route('GET', '/api/teacher/stats', async (req, res) => {
  if (!requireTeacher(req, res)) return;
  const one = (sql) => db.prepare(sql).get().c;
  return json(res, 200, {
    roster: one('SELECT COUNT(*) c FROM roster'),
    registered: one('SELECT COUNT(*) c FROM students'),
    active: one("SELECT COUNT(*) c FROM students WHERE status='active'"),
    pending: one("SELECT COUNT(*) c FROM requests WHERE status='pending'"),
    classes: one('SELECT COUNT(*) c FROM classes'),
    groups: one('SELECT COUNT(*) c FROM groups'),
    today: one('SELECT COUNT(*) c FROM students WHERE created_at > ?'),
    _t: 0
  });
});

/* ---------- إعدادات المدرس ---------- */
route('GET', '/api/teacher/settings', async (req, res) => {
  if (!requireTeacher(req, res)) return;
  return json(res, 200, {
    approvalRequired: approvalRequired(),
    teacherName: (db.prepare('SELECT name FROM teachers LIMIT 1').get() || {}).name || null
  });
});

route('POST', '/api/teacher/settings', async (req, res, body) => {
  if (!requireTeacher(req, res)) return;
  if (body.approvalRequired !== undefined) setSetting('approval_required', body.approvalRequired ? '1' : '0');
  audit('teacher', 'settings.change', { approvalRequired: approvalRequired() });
  return json(res, 200, { ok: true, approvalRequired: approvalRequired() });
});

/* ============================================================
   الملفات الثابتة
   ============================================================ */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json'
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
        catch (e) { return json(res, 400, { error: 'طلب غير صالح أو كبير أوي' }); }
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

/* ---------------- bootstrap ---------------- */
function bootstrap() {
  const email = (process.env.TEACHER_EMAIL || 'gasser@z-school.local').toLowerCase();
  const pass = process.env.TEACHER_PASS || 'zwork2026';
  const name = process.env.TEACHER_NAME || 'مستر جاسر';
  const existing = db.prepare('SELECT id FROM teachers WHERE lower(email) = ?').get(email);
  if (!existing) {
    db.prepare('INSERT INTO teachers (id,name,email,pass_hash,created_at) VALUES (?,?,?,?,?)')
      .run(id('t'), name, email, A.hashPassword(pass), Date.now());
    console.log(`👤 teacher created: ${email} / ${pass}   (غيّرها من TEACHER_PASS)`);
  }
  // تنظيف الجلسات المنتهية
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`✖ البورت ${PORT} مشغول — السيرفر شغال بالفعل`);
    process.exit(0);
  }
  throw e;
});

if (require.main === module) {
  bootstrap();
  server.listen(PORT, '0.0.0.0', () => {
    const n = db.prepare('SELECT COUNT(*) c FROM roster').get().c;
    console.log(`Z-Project server on http://0.0.0.0:${PORT}`);
    console.log(`   كشف الطلاب: ${n} كود · مراجعة التسجيلات: ${approvalRequired() ? 'مفعّلة' : 'مقفولة (التسجيل فوري)'}`);
  });
}

module.exports = { server, bootstrap, db };
