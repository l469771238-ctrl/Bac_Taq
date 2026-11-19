'use strict';
/**
 * Z-Project Workplace — سيرفر الفصل
 *
 * كل حاجة بتمشي على /api. الواجهة بتتكلم نفس الأصل في المتصفح،
 * وتطبيق الأندرويد بيحقن window.ZAPI بعنوان السيرفر.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { open } = require('./db');
const A = require('./auth');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_JSON = 4 * 1024 * 1024;
const MIN_GROUP = 3;
const MAX_GROUP = 8;

const db = open();

/* لو حساب المس لسه مش موجود، نعمله بكلمة سر افتراضية ونطبعها */
function ensureTeacher() {
  const row = db.prepare('SELECT * FROM teacher WHERE id = 1').get();
  if (row) return row;
  const pass = process.env.ZTEACHER_PASS || 'asmaa2026';
  const h = A.hash(pass);
  db.prepare(
    'INSERT INTO teacher (id, name, pass_hash, pass_salt, created_at) VALUES (1,?,?,?,?)'
  ).run('مس أسماء', h.hash, h.salt, Date.now());
  console.log(`   حساب المس: مس أسماء — كلمة المرور: ${pass}`);
  return db.prepare('SELECT * FROM teacher WHERE id = 1').get();
}
const teacher = ensureTeacher();

/* ---------------- أدوات ---------------- */

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = MAX_JSON) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('الملف أكبر من المسموح'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (!buf.length) return resolve({});
      try {
        resolve(JSON.parse(buf.toString('utf8')));
      } catch (e) {
        reject(Object.assign(new Error('البيانات مش صحيحة'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function bearer(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : '';
}

/** بيرجّع {role, uid} أو null */
function who(req) {
  const s = A.readSession(db, bearer(req));
  return s ? { role: s.role, uid: s.uid } : null;
}

function needTeacher(req, res) {
  const w = who(req);
  if (!w || w.role !== 'teacher') {
    json(res, 401, { error: 'الدخول للمس بس' });
    return null;
  }
  return w;
}

function needStudent(req, res) {
  const w = who(req);
  if (!w || w.role !== 'student') {
    json(res, 401, { error: 'سجّل دخول الأول' });
    return null;
  }
  const st = db.prepare('SELECT * FROM students WHERE id = ?').get(w.uid);
  if (!st) {
    json(res, 401, { error: 'الحساب مش موجود' });
    return null;
  }
  if (st.status !== 'active') {
    json(res, 403, { error: 'حسابك لسه مش مفعّل', status: st.status });
    return null;
  }
  return st;
}

const clean = (v, max = 80) => String(v == null ? '' : v).trim().slice(0, max);

/* ---------------- شكل البيانات اللي بتروح للواجهة ---------------- */

function studentView(st) {
  const g = st.group_id
    ? db.prepare(
        `SELECT g.*, c.name AS class_name
           FROM groups g JOIN classes c ON c.id = g.class_id
          WHERE g.id = ?`
      ).get(st.group_id)
    : null;
  return {
    id: st.id,
    code: st.code,
    name: st.full_name,
    status: st.status,
    isLeader: !!st.is_leader,
    group: g ? { id: g.id, name: g.name, gender: g.gender, classId: g.class_id, className: g.class_name } : null,
  };
}

function classTree() {
  const classes = db.prepare('SELECT * FROM classes ORDER BY id').all();
  const groups = db.prepare('SELECT * FROM groups ORDER BY id').all();
  const members = db
    .prepare(
      `SELECT id, code, full_name, gender, is_leader, group_id, status
         FROM students WHERE group_id IS NOT NULL ORDER BY is_leader DESC, full_name`
    )
    .all();
  return classes.map((c) => ({
    id: c.id,
    name: c.name,
    groups: groups
      .filter((g) => g.class_id === c.id)
      .map((g) => {
        const mem = members.filter((m) => m.group_id === g.id);
        return {
          id: g.id,
          name: g.name,
          gender: g.gender,
          members: mem.map((m) => ({
            id: m.id,
            code: m.code,
            name: m.full_name,
            gender: m.gender,
            isLeader: !!m.is_leader,
            status: m.status,
          })),
          leader: (mem.find((m) => m.is_leader) || {}).id || null,
          ready: mem.some((m) => m.is_leader),
        };
      }),
  }));
}

/* ---------------- المسارات ---------------- */

const routes = [];
const route = (method, pattern, fn) => routes.push({ method, pattern, fn });

/* ====== المس ====== */

route('POST', '/api/teacher/login', async (req, res, body) => {
  const pass = String(body.password || '');
  const t = db.prepare('SELECT * FROM teacher WHERE id = 1').get();
  if (!A.verify(pass, t.pass_hash, t.pass_salt)) {
    return json(res, 401, { error: 'كلمة المرور غلط' });
  }
  const token = A.createSession(db, 'teacher', 1);
  json(res, 200, { token, name: t.name });
});

route('GET', '/api/teacher/me', async (req, res) => {
  if (!needTeacher(req, res)) return;
  const counts = db
    .prepare(
      `SELECT
         SUM(status='pending') AS pending,
         SUM(status='active')  AS active,
         COUNT(*)              AS all_students
       FROM students`
    )
    .get();
  json(res, 200, {
    name: teacher.name,
    pending: counts.pending || 0,
    students: counts.active || 0,
    classes: db.prepare('SELECT COUNT(*) n FROM classes').get().n,
    groups: db.prepare('SELECT COUNT(*) n FROM groups').get().n,
    roster: db.prepare('SELECT COUNT(*) n FROM roster').get().n,
  });
});

route('POST', '/api/teacher/password', async (req, res, body) => {
  if (!needTeacher(req, res)) return;
  const p = String(body.password || '');
  const bad = A.passProblem(p);
  if (bad) return json(res, 400, { error: bad });
  const h = A.hash(p);
  db.prepare('UPDATE teacher SET pass_hash=?, pass_salt=? WHERE id=1').run(h.hash, h.salt);
  json(res, 200, { ok: true });
});

/* ====== كشف الأسماء ====== */

route('GET', '/api/teacher/roster', async (req, res, body, p, u) => {
  if (!needTeacher(req, res)) return;
  const q = clean(u.searchParams.get('q') || '', 60);
  const rows = q
    ? db.prepare('SELECT * FROM roster WHERE code LIKE ? OR name LIKE ? ORDER BY sort_no, code LIMIT 200').all(`%${q}%`, `%${q}%`)
    : db.prepare('SELECT * FROM roster ORDER BY sort_no, code').all();
  json(res, 200, { total: db.prepare('SELECT COUNT(*) n FROM roster').get().n, rows });
});

/** استيراد كشف من CSV (code,name) */
route('POST', '/api/teacher/roster', async (req, res, body) => {
  if (!needTeacher(req, res)) return;
  const rows = parseRoster(body.csv || body.rows || []);
  if (!rows.length) return json(res, 400, { error: 'مفيش صفوف في الملف' });
  if (rows.length > 5000) return json(res, 400, { error: 'الحد الأقصى 5000 طالب' });
  const ins = db.prepare('INSERT OR REPLACE INTO roster (code, name, sort_no) VALUES (?,?,?)');
  db.exec('BEGIN');
  try {
    rows.forEach((r, i) => ins.run(r.code, r.name, i));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  json(res, 200, { ok: rows.length, total: db.prepare('SELECT COUNT(*) n FROM roster').get().n });
});

/** استبدال الكشف بالكامل */
route('PUT', '/api/teacher/roster', async (req, res, body) => {
  if (!needTeacher(req, res)) return;
  const rows = parseRoster(body.csv || body.rows || []);
  if (!rows.length) return json(res, 400, { error: 'مفيش صفوف في الملف' });
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM roster');
    const ins = db.prepare('INSERT OR REPLACE INTO roster (code, name, sort_no) VALUES (?,?,?)');
    rows.forEach((r, i) => ins.run(r.code, r.name, i));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  json(res, 200, { ok: rows.length, total: rows.length });
});

function parseRoster(input) {
  let lines;
  if (Array.isArray(input)) {
    return input
      .map((r) => ({
        code: A.normalizeCode(r.code || r.id || r['الكود'] || ''),
        name: clean(r.name || r.full_name || r['الاسم'] || '', 90),
      }))
      .filter((r) => A.validCode(r.code) && r.name);
  }
  lines = String(input || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const sep = lines[i].includes('\t') ? '\t' : lines[i].includes(';') ? ';' : ',';
    const cells = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (i === 0 && /code|كود|الكود/i.test(cells[0]) && /name|اسم|الاسم/i.test(cells[1] || '')) continue;
    const code = A.normalizeCode(cells[0]);
    const name = clean(cells[1] || '', 90);
    if (A.validCode(code) && name) out.push({ code, name });
  }
  return out;
}

/* ====== الفصول والمجموعات ====== */

route('GET', '/api/teacher/classes', async (req, res) => {
  if (!needTeacher(req, res)) return;
  json(res, 200, { classes: classTree() });
});

route('POST', '/api/teacher/classes', async (req, res, body) => {
  if (!needTeacher(req, res)) return;
  const name = clean(body.name, 40);
  if (!name) return json(res, 400, { error: 'اكتب اسم الفصل' });
  const dup = db.prepare('SELECT id FROM classes WHERE name = ?').get(name);
  if (dup) return json(res, 400, { error: 'فيه فصل بنفس الاسم' });
  const r = db
    .prepare('INSERT INTO classes (name, created_at) VALUES (?,?)')
    .run(name, Date.now());
  json(res, 201, { id: Number(r.lastInsertRowid), name });
});

route('PATCH', '/api/teacher/classes/:id', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  const name = clean(body.name, 40);
  if (!name) return json(res, 400, { error: 'اكتب اسم الفصل' });
  db.prepare('UPDATE classes SET name = ? WHERE id = ?').run(name, Number(p.id));
  json(res, 200, { ok: true });
});

route('DELETE', '/api/teacher/classes/:id', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  db.prepare('DELETE FROM classes WHERE id = ?').run(Number(p.id));
  json(res, 200, { ok: true });
});

route('POST', '/api/teacher/classes/:id/groups', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  const classId = Number(p.id);
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
  if (!cls) return json(res, 404, { error: 'الفصل مش موجود' });
  const name = clean(body.name, 40);
  const gender = body.gender === 'girls' ? 'girls' : 'boys';
  if (!name) return json(res, 400, { error: 'اكتب اسم المجموعة' });
  const dup = db.prepare('SELECT id FROM groups WHERE class_id = ? AND name = ?').get(classId, name);
  if (dup) return json(res, 400, { error: 'فيه مجموعة بنفس الاسم في الفصل ده' });
  const r = db
    .prepare('INSERT INTO groups (class_id, name, gender, created_at) VALUES (?,?,?,?)')
    .run(classId, name, gender, Date.now());
  json(res, 201, { id: Number(r.lastInsertRowid), name, gender });
});

route('PATCH', '/api/teacher/groups/:id', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  const gid = Number(p.id);
  const sets = [];
  const vals = [];
  if (body.name !== undefined) {
    const name = clean(body.name, 40);
    if (!name) return json(res, 400, { error: 'اكتب اسم المجموعة' });
    sets.push('name = ?');
    vals.push(name);
  }
  if (body.gender !== undefined) {
    sets.push('gender = ?');
    vals.push(body.gender === 'girls' ? 'girls' : 'boys');
  }
  if (!sets.length) return json(res, 400, { error: 'مفيش تغيير' });
  vals.push(gid);
  db.prepare(`UPDATE groups SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  json(res, 200, { ok: true });
});

route('DELETE', '/api/teacher/groups/:id', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  db.prepare('DELETE FROM groups WHERE id = ?').run(Number(p.id));
  json(res, 200, { ok: true });
});

/** حط طالب في مجموعة (أو شيله منها بـ groupId=null) */
route('POST', '/api/teacher/students/:id/group', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  const sid = Number(p.id);
  const gid = body.groupId === null || body.groupId === 0 ? null : Number(body.groupId);
  if (gid) {
    const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(gid);
    if (!g) return json(res, 404, { error: 'المجموعة مش موجودة' });
  }
  db.prepare('UPDATE students SET group_id = ?, is_leader = CASE WHEN ? IS NULL THEN 0 ELSE is_leader END WHERE id = ?')
    .run(gid, gid, sid);
  const st = db.prepare('SELECT * FROM students WHERE id = ?').get(sid);
  json(res, 200, { student: studentView(st) });
});

/** شارة القيادة — مجموعة واحدة = قائد واحد */
route('POST', '/api/teacher/students/:id/leader', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  const sid = Number(p.id);
  const make = body.leader !== false;
  const st = db.prepare('SELECT * FROM students WHERE id = ?').get(sid);
  if (!st) return json(res, 404, { error: 'الطالب مش موجود' });
  if (make && !st.group_id) {
    return json(res, 400, { error: 'حط الطالب في مجموعة الأول، بعدين امنحه شارة القيادة' });
  }
  if (make) {
    db.prepare('UPDATE students SET is_leader = 0 WHERE group_id = ?').run(st.group_id);
  }
  db.prepare('UPDATE students SET is_leader = ? WHERE id = ?').run(make ? 1 : 0, sid);
  json(res, 200, { ok: true, groupId: st.group_id });
});

/* ====== طلبات الانضمام ====== */

route('GET', '/api/teacher/requests', async (req, res, body, p, u) => {
  if (!needTeacher(req, res)) return;
  const status = u.searchParams.get('status') || 'pending';
  const rows = db
    .prepare(
      `SELECT id, code, full_name, status, created_at, decided_at, note
         FROM students WHERE status = ? ORDER BY created_at DESC`
    )
    .all(status);
  json(res, 200, {
    rows: rows.map((r) => ({
      id: r.id, code: r.code, name: r.full_name, status: r.status,
      at: r.created_at, decidedAt: r.decided_at, note: r.note,
    })),
    counts: {
      pending: db.prepare("SELECT COUNT(*) n FROM students WHERE status='pending'").get().n,
      active: db.prepare("SELECT COUNT(*) n FROM students WHERE status='active'").get().n,
      rejected: db.prepare("SELECT COUNT(*) n FROM students WHERE status='rejected'").get().n,
    },
  });
});

/**
 * القبول = لازم تختار فصل + مجموعة.
 * لو المجموعة فاضية، الطالب بيبقى قائدها تلقائيًا (المجموعة مش بتتعمل من غير قائد).
 */
route('POST', '/api/teacher/requests/:id/approve', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  const sid = Number(p.id);
  const st = db.prepare('SELECT * FROM students WHERE id = ?').get(sid);
  if (!st) return json(res, 404, { error: 'الطلب مش موجود' });
  if (st.status === 'active') return json(res, 400, { error: 'الطالب مفعّل بالفعل' });

  const classId = Number(body.classId || 0);
  const groupId = Number(body.groupId || 0);
  if (!classId) return json(res, 400, { error: 'اختار الفصل' });
  if (!groupId) return json(res, 400, { error: 'اختار المجموعة' });
  const g = db.prepare('SELECT * FROM groups WHERE id = ? AND class_id = ?').get(groupId, classId);
  if (!g) return json(res, 400, { error: 'المجموعة مش تابعة للفصل ده' });

  const count = db.prepare('SELECT COUNT(*) n FROM students WHERE group_id = ?').get(groupId).n;
  if (count >= MAX_GROUP) return json(res, 400, { error: `المجموعة وصلت الحد (${MAX_GROUP})` });

  // قائد المجموعة = أول عضو لو مفيش قائد
  const hasLeader = db.prepare('SELECT id FROM students WHERE group_id = ? AND is_leader = 1').get(groupId);
  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE students SET status='active', group_id=?, is_leader=?, decided_at=?, note=''
        WHERE id = ?`
    ).run(groupId, hasLeader ? 0 : 1, Date.now(), sid);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  json(res, 200, { ok: true, student: studentView(db.prepare('SELECT * FROM students WHERE id = ?').get(sid)) });
});

route('POST', '/api/teacher/requests/:id/reject', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  const sid = Number(p.id);
  const st = db.prepare('SELECT * FROM students WHERE id = ?').get(sid);
  if (!st) return json(res, 404, { error: 'الطلب مش موجود' });
  const note = clean(body.note, 200);
  db.prepare("UPDATE students SET status='rejected', note=?, decided_at=? WHERE id=?")
    .run(note, Date.now(), sid);
  json(res, 200, { ok: true });
});

/** مسح الطالب نهائيًا (للاختبارات أو لو المس عايزة تشيل حد خالص) */
route('POST', '/api/teacher/students/:id/purge', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  db.prepare('DELETE FROM students WHERE id = ?').run(Number(p.id));
  json(res, 200, { ok: true });
});

route('POST', '/api/teacher/students/:id/status', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  const sid = Number(p.id);
  const st = String(body.status || '');
  if (!['pending', 'active', 'rejected', 'blocked'].includes(st)) {
    return json(res, 400, { error: 'حالة غير معروفة' });
  }
  if (st !== 'active') {
    db.prepare('UPDATE students SET status=?, group_id=NULL, is_leader=0 WHERE id=?').run(st, sid);
  } else {
    db.prepare('UPDATE students SET status=? WHERE id=?').run(st, sid);
  }
  json(res, 200, { ok: true });
});

/* ====== الطلاب ====== */

route('GET', '/api/teacher/students', async (req, res, body, p, u) => {
  if (!needTeacher(req, res)) return;
  const q = clean(u.searchParams.get('q') || '', 60);
  const rows = db
    .prepare(
      `SELECT s.*, g.name AS group_name, c.name AS class_name
         FROM students s
         LEFT JOIN groups g ON g.id = s.group_id
         LEFT JOIN classes c ON c.id = g.class_id
        WHERE (? = '' OR s.full_name LIKE ? OR s.code LIKE ?)
        ORDER BY s.status, c.name, g.name, s.full_name`
    )
    .all(q, `%${q}%`, `%${q}%`);
  json(res, 200, { rows: rows.map((r) => ({ ...studentView(r), note: r.note })) });
});

/* ====== الإعلانات والدردشة ====== */

route('GET', '/api/teacher/messages', async (req, res) => {
  if (!needTeacher(req, res)) return;
  const ann = db.prepare("SELECT * FROM messages WHERE kind='announce' ORDER BY id DESC LIMIT 100").all();
  const chats = db
    .prepare(
      `SELECT m.student_id, s.full_name, s.code, MAX(m.id) AS last_id, COUNT(*) AS n
         FROM messages m JOIN students s ON s.id = m.student_id
        WHERE m.kind='chat' GROUP BY m.student_id ORDER BY last_id DESC`
    )
    .all();
  json(res, 200, {
    announcements: ann.map((m) => ({
      id: m.id, body: m.body, scope: m.scope, at: m.created_at,
      to: m.scope === 'all' ? 'كل الأعضاء' : 'قادة المجموعات بس',
    })),
    chats: chats.map((c) => ({ studentId: c.student_id, name: c.full_name, code: c.code, count: c.n, at: Date.now() })),
  });
});

route('POST', '/api/teacher/announce', async (req, res, body) => {
  if (!needTeacher(req, res)) return;
  const text = clean(body.body, 2000);
  const scope = body.scope === 'leaders' ? 'leaders' : 'all';
  if (!text) return json(res, 400, { error: 'اكتب نص الإعلان' });
  const r = db
    .prepare('INSERT INTO messages (kind, scope, student_id, body, created_at) VALUES (?,?,NULL,?,?)')
    .run('announce', scope, text, Date.now());
  const targets =
    scope === 'all'
      ? db.prepare("SELECT COUNT(*) n FROM students WHERE status='active'").get().n
      : db.prepare("SELECT COUNT(*) n FROM students WHERE status='active' AND is_leader=1").get().n;
  json(res, 201, { id: Number(r.lastInsertRowid), reached: targets });
});

route('DELETE', '/api/teacher/announce/:id', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  db.prepare("DELETE FROM messages WHERE id=? AND kind='announce'").run(Number(p.id));
  json(res, 200, { ok: true });
});

route('GET', '/api/teacher/chat/:studentId', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  const sid = Number(p.studentId);
  const st = db.prepare('SELECT * FROM students WHERE id = ?').get(sid);
  if (!st) return json(res, 404, { error: 'الطالب مش موجود' });
  const rows = db
    .prepare("SELECT * FROM messages WHERE kind='chat' AND student_id=? ORDER BY id")
    .all(sid);
  json(res, 200, {
    student: studentView(st),
    msgs: rows.map((m) => ({ id: m.id, body: m.body, from: 'teacher', at: m.created_at })),
  });
});

route('POST', '/api/teacher/chat/:studentId', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  const sid = Number(p.studentId);
  const st = db.prepare('SELECT * FROM students WHERE id = ?').get(sid);
  if (!st) return json(res, 404, { error: 'الطالب مش موجود' });
  const text = clean(body.body, 2000);
  if (!text) return json(res, 400, { error: 'اكتب رسالة' });
  const r = db
    .prepare('INSERT INTO messages (kind, scope, student_id, body, created_at) VALUES (?,?,?,?,?)')
    .run('chat', 'student', sid, text, Date.now());
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

/* ====== الطالب ====== */

route('POST', '/api/lookup', async (req, res, body) => {
  const code = A.normalizeCode(body.code);
  if (!A.validCode(code)) return json(res, 400, { error: A.codeProblem(body.code) || 'الكود مش صحيح' });
  const reg = db.prepare('SELECT * FROM students WHERE code = ?').get(code);
  if (reg) {
    return json(res, 200, {
      code,
      name: reg.full_name,
      state: reg.status,
      registered: true,
      action: reg.status === 'active' ? 'login' : reg.status === 'pending' ? 'pending' : 'blocked',
      message:
        reg.status === 'pending'
          ? 'طلبك مستني موافقة المس أسماء'
          : reg.status === 'rejected'
            ? 'طلبك اترفض — كلّم المس أسماء'
            : reg.status === 'blocked'
              ? 'حسابك موقوف — كلّم المس أسماء'
              : '',
    });
  }
  const ros = db.prepare('SELECT * FROM roster WHERE code = ?').get(code);
  if (!ros) return json(res, 404, { error: 'الكود ده مش موجود — اتأكد منه أو كلّم المس أسماء' });
  json(res, 200, { code, name: ros.name, state: 'new', registered: false, action: 'signup' });
});

route('POST', '/api/register', async (req, res, body) => {
  const code = A.normalizeCode(body.code);
  const pass = String(body.password || '');
  if (!A.validCode(code)) return json(res, 400, { error: A.codeProblem(body.code) || 'الكود مش صحيح' });
  const bad = A.passProblem(pass);
  if (bad) return json(res, 400, { error: bad });

  const existing = db.prepare('SELECT * FROM students WHERE code = ?').get(code);
  if (existing) {
    if (A.verify(pass, existing.pass_hash, existing.pass_salt)) {
      if (existing.status === 'active') {
        const token = A.createSession(db, 'student', existing.id);
        return json(res, 200, { token, student: studentView(existing), resume: true });
      }
      return json(res, 200, { resume: true, state: existing.status, message: 'طلبك متسجل — مستني الموافقة' });
    }
    return json(res, 409, { error: 'الكود ده مسجّل بالفعل — سجّل دخول بكلمة المرور بتاعتك' });
  }

  const ros = db.prepare('SELECT * FROM roster WHERE code = ?').get(code);
  if (!ros) return json(res, 404, { error: 'الكود ده مش في كشف الأسماء — كلّم المس أسماء' });

  const h = A.hash(pass);
  const gender = body.gender === 'girl' ? 'girl' : 'boy';
  const r = db
    .prepare(
      `INSERT INTO students (code, full_name, pass_hash, pass_salt, status, note, created_at)
       VALUES (?,?,?,?, 'pending', '', ?)`
    )
    .run(code, ros.name, h.hash, h.salt, Date.now());
  void gender;
  json(res, 201, { state: 'pending', id: Number(r.lastInsertRowid), name: ros.name, message: 'طلبك اتبعت للمس أسماء' });
});

route('POST', '/api/login', async (req, res, body) => {
  const code = A.normalizeCode(body.code);
  const pass = String(body.password || '');
  const st = db.prepare('SELECT * FROM students WHERE code = ?').get(code);
  if (!st || !A.verify(pass, st.pass_hash, st.pass_salt)) {
    return json(res, 401, { error: 'الكود أو كلمة المرور غلط' });
  }
  if (st.status !== 'active') {
    return json(res, 403, {
      error: st.status === 'pending' ? 'طلبك لسه مستني موافقة المس أسماء' : 'حسابك مش مفعّل',
      state: st.status,
    });
  }
  const token = A.createSession(db, 'student', st.id);
  json(res, 200, { token, student: studentView(st) });
});

route('POST', '/api/logout', async (req, res) => {
  A.dropSession(db, bearer(req));
  json(res, 200, { ok: true });
});

route('GET', '/api/me', async (req, res) => {
  const st = needStudent(req, res);
  if (!st) return;
  json(res, 200, { student: studentView(st) });
});

/** الطالب: إعلاناته + آخر رسالة */
route('GET', '/api/student/feed', async (req, res) => {
  const st = needStudent(req, res);
  if (!st) return;
  const ann = db
    .prepare(
      `SELECT * FROM messages
        WHERE kind='announce' AND (scope='all' OR scope='leaders')
        ORDER BY id DESC LIMIT 50`
    )
    .all()
    .filter((m) => m.scope === 'all' || st.is_leader);
  const chats = db
    .prepare("SELECT * FROM messages WHERE kind='chat' AND student_id=? ORDER BY id")
    .all(st.id);
  json(res, 200, {
    student: studentView(st),
    announcements: ann.map((m) => ({ id: m.id, body: m.body, scope: m.scope, at: m.created_at })),
    chat: chats.map((m) => ({ id: m.id, body: m.body, at: m.created_at })),
  });
});

route('POST', '/api/student/chat', async (req, res, body) => {
  const st = needStudent(req, res);
  if (!st) return;
  const text = clean(body.body, 2000);
  if (!text) return json(res, 400, { error: 'اكتب رسالة' });
  const r = db
    .prepare('INSERT INTO messages (kind, scope, student_id, body, created_at) VALUES (?,?,?,?,?)')
    .run('chat', 'student', st.id, text, Date.now());
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

/* ====== الملفات — المرحلة القادمة ====== */
route('GET', '/api/teacher/files/tree', async (req, res) => {
  if (!needTeacher(req, res)) return;
  const classes = classTree();
  json(res, 200, { classes, note: 'رفع الملفات هيتفتح في المرحلة الجاية' });
});

/* ====== الصحة ====== */

route('GET', '/api/health', async (req, res) => {
  json(res, 200, {
    ok: true,
    version: '1.0',
    uptime: Math.round(process.uptime()),
    roster: db.prepare('SELECT COUNT(*) n FROM roster').get().n,
    students: db.prepare('SELECT COUNT(*) n FROM students').get().n,
    classes: db.prepare('SELECT COUNT(*) n FROM classes').get().n,
  });
});

/* ---------------- الملفات الساكنة ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('مش موجود');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
    });
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------------- التوجيه ---------------- */

function match(pattern, pathname) {
  const a = pattern.split('/');
  const b = pathname.split('/');
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const pathname = u.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  if (!pathname.startsWith('/api/')) {
    serveStatic(req, res, pathname);
    return;
  }

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const p = match(r.pattern, pathname);
    if (!p) continue;
    try {
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      await r.fn(req, res, body, p, u);
    } catch (e) {
      if (!res.headersSent) {
        json(res, e.status || 500, { error: e.message || 'حصل خطأ في السيرفر' });
      }
      if (!e.status) console.error(pathname, e);
    }
    return;
  }
  json(res, 404, { error: 'المسار مش موجود' });
});

A.sweepSessions(db);
server.listen(PORT, HOST, () => {
  console.log(`Z-Project server on http://${HOST}:${PORT}`);
  console.log(
    `   كشف الأسماء: ${db.prepare('SELECT COUNT(*) n FROM roster').get().n} كود` +
      ` · الطلاب: ${db.prepare('SELECT COUNT(*) n FROM students').get().n}` +
      ` · الفصول: ${db.prepare('SELECT COUNT(*) n FROM classes').get().n}`
  );
});

module.exports = { server, db };
