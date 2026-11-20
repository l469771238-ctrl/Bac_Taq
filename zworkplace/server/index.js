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
const zlib = require('node:zlib');

const { open } = require('./db');
const A = require('./auth');

const ROOT = path.join(__dirname, '..');
const BUILD = '2026-11-20-fonts';   // بيتغيّر مع كل تحديث — بيبان في /api/health
/*
 * alwaysdata بيحدد IP وPORT لكل موقع وبيبعتهم كمتغيرات بيئة.
 * غيرهما (Render/SnapDeploy) بيبعت PORT بس. لو مفيش حاجة، بنقع على 3100.
 */
/*
 * كل استضافة بتسمّي البورت باسم مختلف:
 *   Waifly / Pterodactyl → SERVER_PORT
 *   alwaysdata          → PORT
 *   Render / غيره        → PORT
 * بنجرّبهم كلهم بالترتيب.
 */
const PORT = Number(
  process.env.PORT || process.env.SERVER_PORT || process.env.ZPORT || 3100
);
const HOST = process.env.IP || process.env.HOST || '0.0.0.0';
const MAX_JSON = 4 * 1024 * 1024;
const MIN_GROUP = 3;
const DEFAULT_MAX_GROUP = 8;

/** حد المجموعة — المس هي اللي تحدده من الإعدادات */
function maxGroup() {
  if (!db) return DEFAULT_MAX_GROUP;
  const r = db.prepare("SELECT value FROM settings WHERE key='max_group'").get();
  const n = r ? Number(r.value) : DEFAULT_MAX_GROUP;
  return Number.isFinite(n) && n >= 2 && n <= 30 ? n : DEFAULT_MAX_GROUP;
}

let db = null;   // بيتفتح في main() بعد استعادة القاعدة

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
let teacher = null;

/**
 * تحميل كشف الأسماء تلقائيًا.
 * على استضافة جديدة القاعدة فاضية — لازم الكشف يبقى موجود من الأول
 * عشان الطالب يكتب كوده ويلاقي اسمه.
 *
 * المصدر: ZROSTER (مسار ملف) أو data/students.csv جوه المشروع.
 */
function bootstrapRoster() {
  const n = db.prepare('SELECT COUNT(*) n FROM roster').get().n;
  if (n > 0) return;
  const src = process.env.ZROSTER || path.join(ROOT, 'data', 'students.csv');
  if (!fs.existsSync(src)) {
    console.log('   ⚠️ مفيش كشف أسماء — ارفعه من لوحة المس');
    return;
  }
  const A2 = A;
  const lines = fs.readFileSync(src, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const ins = db.prepare('INSERT OR REPLACE INTO roster (code, name, sort_no) VALUES (?,?,?)');
  let added = 0;
  db.exec('BEGIN');
  try {
    lines.slice(1).forEach((l, i) => {
      const cells = l.split(',');
      const code = A2.normalizeCode(cells[0]);
      const name = (cells[1] || '').trim();
      if (A2.validCode(code) && name) {
        ins.run(code, name, i);
        added++;
      }
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  if (added) console.log(`   ✅ كشف الأسماء: ${added} طالب اتحمّلوا`);
}
// bootstrapRoster();  — بتتنادى في main() بعد الاستعادة

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
    let tooBig = false;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit && !tooBig) {
        tooBig = true;
        /* ما ننفّذش req.destroy() هنا: بيقفل الاتصال قبل ما الرد
           يوصل، والمتصفح بيوري 'فشل الاتصال' بدل رسالة مفهومة.
           بنرفض بس ونسيب الرد يتكتب (الـres بيكمّل القراءة ويرمي). */
        reject(Object.assign(new Error('البيانات أكبر من المسموح (١ ميجا)'), { status: 413 }));
        return;
      }
      if (!tooBig) chunks.push(c);
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

/* بنشيل رموز التحكم (\u0000- و \u007f) — كانت بتتحفظ في
   الأسماء وتظهر مربعات فاضية للمستخدم. */
const CTRL = /[\u0000-\u001f\u007f\u200b-\u200f\ufeff\ufffd]/g;
const clean = (v, max = 80) =>
  String(v == null ? '' : v).replace(CTRL, '').trim().slice(0, max);

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
    avatar: st.avatar || '',
    gender: st.gender || '',
    group: g ? { id: g.id, name: g.name, gender: g.gender, classId: g.class_id, className: g.class_name } : null,
  };
}

function classTree() {
  const classes = db.prepare('SELECT * FROM classes ORDER BY id').all();
  const groups = db.prepare('SELECT * FROM groups ORDER BY id').all();
  const members = db
    .prepare(
      `SELECT id, code, full_name, gender, is_leader, group_id, status, avatar
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
            avatar: m.avatar || '',
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

/* ====== الإعدادات ====== */

route('GET', '/api/teacher/settings', async (req, res) => {
  if (!needTeacher(req, res)) return;
  const rows = db.prepare('SELECT * FROM settings').all();
  const map = {};
  rows.forEach((r) => (map[r.key] = r.value));
  json(res, 200, {
    maxGroup: maxGroup(),
    defaults: { maxGroup: DEFAULT_MAX_GROUP },
    classCount: db.prepare('SELECT COUNT(*) n FROM classes').get().n,
    groupCount: db.prepare('SELECT COUNT(*) n FROM groups').get().n,
    rosterCount: db.prepare('SELECT COUNT(*) n FROM roster').get().n,
  });
});

route('PATCH', '/api/teacher/settings', async (req, res, body) => {
  if (!needTeacher(req, res)) return;
  if (body.maxGroup !== undefined) {
    const n = Number(body.maxGroup);
    if (!Number.isInteger(n) || n < 2 || n > 30) {
      return json(res, 400, { error: 'حد المجموعة من ٢ لـ ٣٠' });
    }
    db.prepare("INSERT INTO settings (key,value) VALUES ('max_group',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(String(n));
  }
  json(res, 200, { ok: true, maxGroup: maxGroup() });
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
      `SELECT id, code, full_name, status, created_at, decided_at, note, avatar
         FROM students WHERE status = ? ORDER BY created_at DESC`
    )
    .all(status);
  json(res, 200, {
    rows: rows.map((r) => ({
      id: r.id, code: r.code, name: r.full_name, status: r.status,
      at: r.created_at, decidedAt: r.decided_at, note: r.note,
      avatar: r.avatar || '',
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
  const cap = maxGroup();
  if (count >= cap) return json(res, 400, { error: `المجموعة وصلت الحد (${cap} أعضاء) — كبّريه من الإعدادات` });

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
      `SELECT m.student_id, s.full_name, s.code, s.avatar, MAX(m.id) AS last_id, COUNT(*) AS n
         FROM messages m JOIN students s ON s.id = m.student_id
        WHERE m.kind='chat' GROUP BY m.student_id ORDER BY last_id DESC`
    )
    .all();
  json(res, 200, {
    announcements: ann.map((m) => ({
      id: m.id, body: m.body, scope: m.scope, at: m.created_at,
      to: m.scope === 'all' ? 'كل الأعضاء' : 'قادة المجموعات بس',
    })),
    chats: chats.map((c) => ({ studentId: c.student_id, name: c.full_name, code: c.code, avatar: c.avatar || '', count: c.n, at: Date.now() })),
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
      /*
       * الرسالة لازم تقول الحقيقة. قبل كده كانت بتقول "مستني الموافقة"
       * لأي حالة — فالمرفوض كان بيفضل يستنى على الفاضي.
       */
      const STATE_MSG = {
        pending: 'طلبك متسجل — مستني موافقة المس أسماء',
        rejected: 'طلبك اترفض. طلبك وصل للمس أسماء — كلّمها لو حابة ترجعي الطلب.',
        blocked: 'حسابك موقوف. كلّم المس أسماء.',
        active: 'حسابك جاهز.',
      };
      return json(res, 200, {
        resume: true,
        state: existing.status,
        status: existing.status,
        canRetry: existing.status === 'rejected',
        message: STATE_MSG[existing.status] || 'حالة غير معروفة',
      });
    }
    return json(res, 409, { error: 'الكود ده مسجّل بالفعل — سجّل دخول بكلمة المرور بتاعتك' });
  }

  const ros = db.prepare('SELECT * FROM roster WHERE code = ?').get(code);
  if (!ros) return json(res, 404, { error: 'الكود ده مش في كشف الأسماء — كلّم المس أسماء' });

  const h = A.hash(pass);
  /* النوع بيتبعت مع التسجيل — بنستخدمه عشان نفلتر الأفاتارات،
     مش عشان نمنع حد. القيمة الافتراضية 'boy' لو مبعوتش. */
  const gender = body.gender === 'girl' ? 'girl' : 'boy';
  /* الأفاتار: لازم يكون من الـ٢٨ ويطابق النوع. أي حاجة تانية بتتجاهل. */
  const pick = typeof body.avatar === 'string' ? body.avatar.trim() : '';
  const av = AVATAR_KEYS.indexOf(pick) >= 0 && matchesGender(pick, gender) ? pick : '';
  const r = db
    .prepare(
      `INSERT INTO students (code, full_name, pass_hash, pass_salt, status, note, created_at, avatar, gender)
       VALUES (?,?,?,?, 'pending', '', ?, ?, ?)`
    )
    .run(code, ros.name, h.hash, h.salt, Date.now(), av, gender);
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

/* ───── اختيار الأفاتار ─────
   الشكل مخزّن كمفتاح نصي قصير («star» · «cat» …) مش صورة.
   يعني ٨ بايت للطالب بدل ٣-١٥ كيلو، ومفيش رفع ولا ضغط ولا مساحة. */
/* ٢٨ أفاتار بشري — ١٤ ولد و١٤ بنت.
   لازم يطابق ZAvatar.list في js/avatars.js (فيه اختبار بيتأكد). */
const AVATAR_KEYS = [];
for (let i = 1; i <= 14; i++) AVATAR_KEYS.push('b' + i);
for (let i = 1; i <= 14; i++) AVATAR_KEYS.push('g' + i);
/* الأفاتار لازم يطابق نوع الطالب — ولد ميلبس حجاب بيبقى غلط */
const isBoyKey = (k) => /^b\d+$/.test(k);
const isGirlKey = (k) => /^g\d+$/.test(k);
/* gender مخزّن كـ'boy'/'girl' — لو مش معروف بنسمح بأي حاجة (توافق مع الحسابات القديمة) */
function matchesGender(key, gender) {
  if (gender === 'boy') return isBoyKey(key);
  if (gender === 'girl') return isGirlKey(key);
  return true;
}

route('POST', '/api/student/avatar', async (req, res, body) => {
  const st = needStudent(req, res);
  if (!st) return;
  /* String({toString:1}) بترمي TypeError → ٥٠٠. الأيقونة المفروض
     تكون نص أصلاً، فأي حاجة مش نص بتتجاهل على طول. */
  const key = typeof body.avatar === 'string' ? body.avatar.trim() : '';
  if (key && AVATAR_KEYS.indexOf(key) < 0) {
    return json(res, 400, { error: 'الأفاتار ده مش موجود' });
  }
  /* الأفاتار لازم يطابق نوع الطالب — ولد مش هياخد حجاب */
  if (key && !matchesGender(key, st.gender)) {
    return json(res, 400, { error: 'الأفاتار ده مش مناسب لحسابك' });
  }
  db.prepare('UPDATE students SET avatar = ? WHERE id = ?').run(key, st.id);
  json(res, 200, { ok: true, avatar: key, keys: AVATAR_KEYS, gender: st.gender });
});

route('GET', '/api/student/avatar', async (req, res) => {
  const st = needStudent(req, res);
  if (!st) return;
  json(res, 200, {
    avatar: st.avatar || '',
    gender: st.gender || '',
    keys: st.gender === 'girl' ? AVATAR_KEYS.filter(isGirlKey)
        : st.gender === 'boy' ? AVATAR_KEYS.filter(isBoyKey)
        : AVATAR_KEYS,
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

/* ====== الملفات ====== */

const F = require('./files');

/** هل المدرس/الطالب مسموح له يشوف ملف ده؟ */
function canSeeFile(student, file) {
  if (!student.group_id) return false;
  if (file.student_id) {
    // ملف عضو — كل المجموعة تشوفه
    const owner = db.prepare('SELECT group_id FROM students WHERE id = ?').get(file.student_id);
    return !!owner && owner.group_id === student.group_id;
  }
  return file.group_id === student.group_id;
}

/** رفع ملف — للطالب */
route('POST', '/api/files', async (req, res) => {
  const st = needStudent(req, res);
  if (!st) return;
  if (!st.group_id) return json(res, 400, { error: 'لسه مش في مجموعة — كلّم المس أسماء' });
  /* decodeURIComponent بترمي 'URI malformed' على أي % غلط —
     وملفات زي «تقرير 100%.pdf» كان رفعها بيرجّع 500 ويفشل.
     لو الفك فشل، بناخد الاسم زي ما هو. */
  const rawName = req.headers['x-filename'] || 'ملف';
  let decoded = rawName;
  try { decoded = decodeURIComponent(rawName); } catch (e) { decoded = rawName; }
  const name = F.safeName(decoded);
  const mime = String(req.headers['content-type'] || 'application/octet-stream');
  const meta = await F.receive(req, { mime });
  const r = db
    .prepare(
      `INSERT INTO files (group_id, student_id, stored_name, orig_name, mime, size, created_at)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run(st.group_id, st.id, meta.storedName, name, mime, meta.size, Date.now());
  json(res, 201, {
    id: Number(r.lastInsertRowid),
    name,
    size: meta.size,
  });
});

/** ملفات مجموعتي — الطالب بيشوف شغل كل مجموعته (ومحدش غيرهم) */
route('GET', '/api/student/files', async (req, res) => {
  const st = needStudent(req, res);
  if (!st) return;
  if (!st.group_id) return json(res, 200, { files: [], tasks: [] });

  const files = db
    .prepare(
      `SELECT f.*, s.full_name, s.code, s.avatar
         FROM files f JOIN students s ON s.id = f.student_id
        WHERE f.group_id = ? ORDER BY f.id DESC`
    )
    .all(st.group_id);

  const tasks = tasksFor(st);
  const subs = db
    .prepare('SELECT task_id, file_id, link FROM submissions WHERE student_id = ?')
    .all(st.id);
  const subByTask = {};
  subs.forEach((s) => (subByTask[s.task_id] = s));

  json(res, 200, {
    files: files.map((f) => ({
      id: f.id,
      name: f.orig_name,
      size: f.size,
      mime: f.mime,
      at: f.created_at,
      owner: { id: f.student_id, name: f.full_name, code: f.code, avatar: f.avatar || '', mine: f.student_id === st.id },
    })),
    tasks: tasks.map((t) => {
      const sub = subByTask[t.id];
      return {
        id: t.id,
        title: t.title,
        body: t.body,
        scope: t.student_id ? 'me' : 'group',
        done: !!sub,
        link: sub ? sub.link : '',
        fileId: sub ? sub.file_id : null,
      };
    }),
  });
});

/** المهمات اللي تخص الطالب: لمجموعته + له شخصيًا */
function tasksFor(st) {
  if (!st.group_id) return [];
  return db
    .prepare(
      `SELECT * FROM tasks
        WHERE (group_id = ? AND student_id IS NULL)
           OR (student_id = ?)
        ORDER BY id DESC`
    )
    .all(st.group_id, st.id);
}

/** تحميل ملف — بيتأكد إنه من مجموعته قبل ما يبعت أي بايت */
route('GET', '/api/files/:id', async (req, res, body, p) => {
  const w = who(req);
  if (!w) return json(res, 401, { error: 'سجّل دخول الأول' });
  const f = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(p.id));
  if (!f) return json(res, 404, { error: 'الملف مش موجود' });

  if (w.role === 'student') {
    const st = db.prepare('SELECT * FROM students WHERE id = ?').get(w.uid);
    if (!st || st.status !== 'active' || !canSeeFile(st, f)) {
      return json(res, 403, { error: 'الملف ده مش لمجموعتك' });
    }
  }
  const driver = require('./storage').store;
  let stream;
  try {
    stream = await driver.get(f.stored_name);
  } catch (e) {
    return json(res, e.status || 404, { error: e.message || 'الملف مش موجود' });
  }
  res.writeHead(200, {
    'Content-Type': f.mime || 'application/octet-stream',
    'Content-Length': f.size,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.orig_name)}`,
  });
  if (Buffer.isBuffer(stream)) res.end(stream);
  else stream.pipe(res);
});

/** مسح ملف — صاحبه أو المس */
route('DELETE', '/api/files/:id', async (req, res, body, p) => {
  const w = who(req);
  if (!w) return json(res, 401, { error: 'سجّل دخول الأول' });
  const f = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(p.id));
  if (!f) return json(res, 404, { error: 'الملف مش موجود' });
  if (w.role === 'student' && f.student_id !== w.uid) {
    return json(res, 403, { error: 'مش ملفك' });
  }
  db.prepare('DELETE FROM submissions WHERE file_id = ?').run(f.id);
  db.prepare('DELETE FROM files WHERE id = ?').run(f.id);
  await F.remove(f.stored_name);
  json(res, 200, { ok: true });
});

/* ====== المهمات (المس) ====== */

/** الشجرة الكاملة: فصل → مجموعة → أعضاء → ملفات + مطلوبات */
route('GET', '/api/teacher/files/tree', async (req, res) => {
  if (!needTeacher(req, res)) return;
  const tree = classTree();
  const allFiles = db
    .prepare('SELECT * FROM files WHERE student_id IS NOT NULL ORDER BY id DESC')
    .all();
  const allTasks = db.prepare('SELECT * FROM tasks ORDER BY id DESC').all();
  const subs = db.prepare('SELECT * FROM submissions').all();

  const classes = tree.map((c) => ({
    ...c,
    groups: c.groups.map((g) => ({
      ...g,
      members: g.members.map((m) => {
        const mine = allFiles.filter((f) => f.student_id === m.id);
        const myTasks = allTasks.filter((t) => t.student_id === m.id);
        return {
          ...m,
          files: mine.map((f) => ({ id: f.id, name: f.orig_name, size: f.size, at: f.created_at })),
          tasks: myTasks.map((t) => taskState(t, subs, m.id)),
        };
      }),
      tasks: allTasks
        .filter((t) => t.group_id === g.id && !t.student_id)
        .map((t) => ({
          ...taskState(t, subs, null),
          doneCount: g.members.filter((m) =>
            subs.some((s) => s.task_id === t.id && s.student_id === m.id)
          ).length,
          total: g.members.length,
          pending: g.members
            .filter((m) => !subs.some((s) => s.task_id === t.id && s.student_id === m.id))
            .map((m) => ({ id: m.id, name: m.name })),
        })),
    })),
  }));

  json(res, 200, { classes });
});

function taskState(t, subs, sid) {
  if (sid == null) return { id: t.id, title: t.title, body: t.body };
  const s = subs.find((x) => x.task_id === t.id && x.student_id === sid);
  return { id: t.id, title: t.title, body: t.body, done: !!s, link: s ? s.link : '' };
}

/** إنشاء مطلوب — لمجموعة أو لعضو */
route('POST', '/api/teacher/tasks', async (req, res, body) => {
  if (!needTeacher(req, res)) return;
  const title = clean(body.title, 120);
  if (!title) return json(res, 400, { error: 'اكتب اسم المطلوب' });
  const bodyText = clean(body.body, 600);
  const groupId = body.groupId ? Number(body.groupId) : null;
  const studentId = body.studentId ? Number(body.studentId) : null;

  let classId = null;
  if (studentId) {
    const st = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    if (!st) return json(res, 404, { error: 'الطالب مش موجود' });
    if (!st.group_id) return json(res, 400, { error: 'الطالب مش في مجموعة' });
    const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(st.group_id);
    classId = g.class_id;
    // لو المطلوب لعضو، بنربطه بمجموعته كمان عشان يظهر صح
  } else if (groupId) {
    const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
    if (!g) return json(res, 404, { error: 'المجموعة مش موجودة' });
    classId = g.class_id;
  } else {
    return json(res, 400, { error: 'اختار مجموعة أو عضو' });
  }

  const r = db
    .prepare(
      'INSERT INTO tasks (class_id, group_id, student_id, title, body, created_at) VALUES (?,?,?,?,?,?)'
    )
    .run(classId, groupId, studentId, title, bodyText, Date.now());
  json(res, 201, { id: Number(r.lastInsertRowid), title });
});

route('DELETE', '/api/teacher/tasks/:id', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  db.prepare('DELETE FROM tasks WHERE id = ?').run(Number(p.id));
  json(res, 200, { ok: true });
});

/* ====== التسليم ====== */

/** الطالب بيسلّم: ملف مرفوع أو لينك درايف */
route('POST', '/api/student/submit/:taskId', async (req, res, body, p) => {
  const st = needStudent(req, res);
  if (!st) return;
  const taskId = Number(p.taskId);
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!t) return json(res, 404, { error: 'المطلوب مش موجود' });
  const mine = tasksFor(st).some((x) => x.id === taskId);
  if (!mine) return json(res, 403, { error: 'المطلوب ده مش ليك' });

  const link = clean(body.link, 500);
  const fileId = body.fileId ? Number(body.fileId) : null;
  if (!link && !fileId) return json(res, 400, { error: 'ارفع ملف أو حط لينك' });
  if (link && !/^https?:\/\//i.test(link)) {
    return json(res, 400, { error: 'اللينك لازم يبدأ بـ http أو https' });
  }
  if (fileId) {
    const f = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
    if (!f || f.student_id !== st.id) return json(res, 403, { error: 'الملف ده مش ملفك' });
  }

  db.prepare(
    `INSERT INTO submissions (task_id, student_id, file_id, link, created_at)
     VALUES (?,?,?,?,?)
     ON CONFLICT(task_id, student_id) DO UPDATE SET
       file_id = excluded.file_id, link = excluded.link, created_at = excluded.created_at`
  ).run(taskId, st.id, fileId, link, Date.now());

  json(res, 200, { ok: true, done: true });
});

route('DELETE', '/api/student/submit/:taskId', async (req, res, body, p) => {
  const st = needStudent(req, res);
  if (!st) return;
  db.prepare('DELETE FROM submissions WHERE task_id = ? AND student_id = ?')
    .run(Number(p.taskId), st.id);
  json(res, 200, { ok: true });
});

/* ====== ZIP منظم ====== */

/**
 * بيبني ZIP للمجموعة أو الفصل أو عضو، بفولدر لكل حاجة.
 * الهيكل: الفصل/المجموعة/العضو/اسم الملف
 */
route('GET', '/api/download/zip', async (req, res, body, p, u) => {
  const w = who(req);
  if (!w) return json(res, 401, { error: 'سجّل دخول الأول' });

  const groupId = Number(u.searchParams.get('groupId') || 0);
  const classId = Number(u.searchParams.get('classId') || 0);
  const studentId = Number(u.searchParams.get('studentId') || 0);

  if (w.role === 'student') {
    const st = db.prepare('SELECT * FROM students WHERE id = ?').get(w.uid);
    if (!st || !st.group_id) return json(res, 403, { error: 'مفيش ملفات' });
    if (groupId !== st.group_id) return json(res, 403, { error: 'ده مش مجلد مجموعتك' });
  }

  const entries = [];
  const base = [];

  if (studentId) {
    const st = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    if (!st) return json(res, 404, { error: 'الطالب مش موجود' });
    const g = db.prepare('SELECT g.*, c.name AS cname FROM groups g JOIN classes c ON c.id=g.class_id WHERE g.id=?').get(st.group_id);
    base.push(g ? g.cname : 'فصل', g ? g.name : 'مجموعة');
    pushMember(entries, base, st);
    return sendZip(res, entries, `${st.full_name}`);
  }

  if (groupId) {
    const g = db
      .prepare('SELECT g.*, c.name AS cname FROM groups g JOIN classes c ON c.id=g.class_id WHERE g.id=?')
      .get(groupId);
    if (!g) return json(res, 404, { error: 'المجموعة مش موجودة' });
    base.push(g.cname, g.name);
    const members = db
      .prepare('SELECT * FROM students WHERE group_id = ? ORDER BY is_leader DESC, full_name')
      .all(groupId);
    members.forEach((m) => pushMember(entries, base, m));
    return sendZip(res, entries, `${g.cname} - ${g.name}`);
  }

  if (classId) {
    const c = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
    if (!c) return json(res, 404, { error: 'الفصل مش موجود' });
    base.push(c.name);
    const groups = db.prepare('SELECT * FROM groups WHERE class_id = ?').all(classId);
    groups.forEach((g) => {
      const members = db
        .prepare('SELECT * FROM students WHERE group_id = ? ORDER BY is_leader DESC, full_name')
        .all(g.id);
      members.forEach((m) => pushMember(entries, [...base, g.name], m));
    });
    return sendZip(res, entries, c.name);
  }

  return json(res, 400, { error: 'اختار فصل أو مجموعة أو عضو' });
});

function pushMember(entries, base, member) {
  const files = db.prepare('SELECT * FROM files WHERE student_id = ? ORDER BY id').all(member.id);
  // فولدر العضو موجود حتى لو فاضي — عشان التنظيم يبان
  entries.push({ name: [...base, member.full_name, '.gitkeep'].join('/'), data: Buffer.alloc(0) });
  files.forEach((f) => {
    entries.push({ name: [...base, member.full_name, F.safeName(f.orig_name)].join('/'), storedName: f.stored_name });
  });
}

async function sendZip(res, entries, name) {
  const zip = await F.buildZip(entries);
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Length': zip.length,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(F.safeName(name) + '.zip')}`,
  });
  res.end(zip);
}

/* ====== رفع بإرسال خام (للملفات الكبيرة) ====== */
// نفس مسار الرفع بس للمدرس
route('POST', '/api/teacher/files', async (req, res) => {
  if (!needTeacher(req, res)) return;
  const studentId = Number(req.headers['x-student-id'] || 0);
  if (!studentId) return json(res, 400, { error: 'اختار الطالب' });
  const st = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!st || !st.group_id) return json(res, 400, { error: 'الطالب مش في مجموعة' });
  /* decodeURIComponent بترمي 'URI malformed' على أي % غلط —
     وملفات زي «تقرير 100%.pdf» كان رفعها بيرجّع 500 ويفشل.
     لو الفك فشل، بناخد الاسم زي ما هو. */
  const rawName = req.headers['x-filename'] || 'ملف';
  let decoded = rawName;
  try { decoded = decodeURIComponent(rawName); } catch (e) { decoded = rawName; }
  const name = F.safeName(decoded);
  const mime = String(req.headers['content-type'] || 'application/octet-stream');
  const meta = await F.receive(req, { mime });
  const r = db
    .prepare(
      `INSERT INTO files (group_id, student_id, stored_name, orig_name, mime, size, created_at)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run(st.group_id, st.id, meta.storedName, name, mime, meta.size, Date.now());
  json(res, 201, { id: Number(r.lastInsertRowid), name, size: meta.size });
});

/* ====== دردشة المجموعة والفصل ====== */
/*
 * قواعد صارمة:
 *   - الطالب بيبعت في دردشة مجموعته أو دردشة فصله بس. مفيش فرد لفرد.
 *   - مفيش مسار يخلي طالب يختار مجموعة أو فصل تاني.
 *   - أي محاولة تتقفل بـ403.
 */

/** قنوات الطالب المسموحة له */
route('GET', '/api/student/channels', async (req, res) => {
  const st = needStudent(req, res);
  if (!st) return;
  if (!st.group_id) {
    return json(res, 200, {
      channels: [],
      note: 'لسه مش في مجموعة — كلّم المس أسماء',
    });
  }
  const g = db
    .prepare('SELECT g.*, c.id AS cid, c.name AS cname FROM groups g JOIN classes c ON c.id = g.class_id WHERE g.id = ?')
    .get(st.group_id);
  json(res, 200, {
    channels: [
      { scope: 'group', id: g.id, name: g.name, kind: 'مجموعتك', gender: g.gender },
      { scope: 'class', id: g.cid, name: g.cname, kind: 'الفصل' },
    ],
    note: '',
  });
});

/** رسايل قناة — الطالب بياخد قنواته هو بس */
route('GET', '/api/student/chat/:scope/:id', async (req, res, body, p) => {
  const st = needStudent(req, res);
  if (!st) return;
  const scope = p.scope === 'class' ? 'class' : 'group';
  const id = Number(p.id);
  if (!st.group_id) return json(res, 403, { error: 'لسه مش في مجموعة' });

  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(st.group_id);
  if (scope === 'group' && id !== g.id) return json(res, 403, { error: 'ده مش مجلد مجموعتك' });
  if (scope === 'class' && id !== g.class_id) return json(res, 403, { error: 'ده مش فصلك' });

  const rows = db
    .prepare(
      `SELECT m.*, s.full_name, s.code, s.is_leader, s.avatar
         FROM chat_msgs m LEFT JOIN students s ON s.id = m.student_id
        WHERE m.scope = ? AND m.target_id = ? ORDER BY m.id`
    )
    .all(scope, id);

  json(res, 200, {
    scope,
    id,
    msgs: rows.map((m) => ({
      id: m.id,
      body: m.body,
      at: m.created_at,
      from: m.from_teacher ? 'teacher' : 'student',
      name: m.from_teacher ? 'مس أسماء' : m.full_name,
      code: m.code || '',
      leader: !!m.is_leader,
      avatar: m.avatar || '',
      mine: !m.from_teacher && m.student_id === st.id,
    })),
  });
});

/** إرسال — الطالب في قناته بس */
route('POST', '/api/student/chat/:scope/:id', async (req, res, body, p) => {
  const st = needStudent(req, res);
  if (!st) return;
  const scope = p.scope === 'class' ? 'class' : 'group';
  const id = Number(p.id);
  if (!st.group_id) return json(res, 403, { error: 'لسه مش في مجموعة' });

  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(st.group_id);
  if (scope === 'group' && id !== g.id) return json(res, 403, { error: 'ده مش مجلد مجموعتك' });
  if (scope === 'class' && id !== g.class_id) return json(res, 403, { error: 'ده مش فصلك' });

  const text = clean(body.body, 2000);
  if (!text) return json(res, 400, { error: 'اكتب رسالة' });
  const r = db
    .prepare(
      'INSERT INTO chat_msgs (scope, target_id, student_id, from_teacher, body, created_at) VALUES (?,?,?,0,?,?)'
    )
    .run(scope, id, st.id, text, Date.now());
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

/**
 * المس: دردشة خاصة مع عضو — ودي الحاجة الوحيدة "الخاصة" في التطبيق.
 * مهم: دي بين المس والطالب. مفيش أي طريق يخلي طالبين يتكلموا خاص.
 * الطالب بيشوفها من شاشة "رسايل المس" في مركز إشعاراته.
 */
route('GET', '/api/teacher/dm/:studentId', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  const sid = Number(p.studentId);
  const st = db.prepare('SELECT * FROM students WHERE id = ?').get(sid);
  if (!st) return json(res, 404, { error: 'الطالب مش موجود' });
  const rows = db
    .prepare("SELECT * FROM messages WHERE kind='chat' AND student_id=? ORDER BY id")
    .all(sid);
  json(res, 200, {
    student: studentView(st),
    msgs: rows.map((m) => ({
      id: m.id,
      body: m.body,
      at: m.created_at,
      from: m.id ? 'teacher' : 'teacher',
    })),
  });
});

route('POST', '/api/teacher/dm/:studentId', async (req, res, body, p) => {
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

route('DELETE', '/api/teacher/dm/message/:id', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  db.prepare("DELETE FROM messages WHERE id=? AND kind='chat'").run(Number(p.id));
  json(res, 200, { ok: true });
});

/** المس: بتشوف كل قنوات الفصل (بس القنوات، مش خاص) */
route('GET', '/api/teacher/channels', async (req, res) => {
  if (!needTeacher(req, res)) return;
  const tree = classTree();
  const out = [];
  for (const c of tree) {
    const classMsgs = db
      .prepare("SELECT COUNT(*) n FROM chat_msgs WHERE scope='class' AND target_id = ?")
      .get(c.id).n;
    out.push({ scope: 'class', id: c.id, name: c.name, kind: 'دردشة الفصل', count: classMsgs, gender: null });
    c.groups.forEach((g) => {
      const n = db
        .prepare("SELECT COUNT(*) n FROM chat_msgs WHERE scope='group' AND target_id = ?")
        .get(g.id).n;
      out.push({ scope: 'group', id: g.id, name: `${c.name} · ${g.name}`, kind: 'دردشة المجموعة', count: n, gender: g.gender });
    });
  }
  json(res, 200, { channels: out });
});

/** المس: قراءة قناة */
route('GET', '/api/teacher/chatroom/:scope/:id', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  const scope = p.scope === 'class' ? 'class' : 'group';
  const id = Number(p.id);
  const rows = db
    .prepare(
      `SELECT m.*, s.full_name, s.code, s.is_leader, s.avatar
         FROM chat_msgs m LEFT JOIN students s ON s.id = m.student_id
        WHERE m.scope = ? AND m.target_id = ? ORDER BY m.id`
    )
    .all(scope, id);
  let title = '';
  if (scope === 'class') {
    const c = db.prepare('SELECT name FROM classes WHERE id = ?').get(id);
    title = c ? c.name : '';
  } else {
    const g = db.prepare('SELECT g.name, c.name AS cname FROM groups g JOIN classes c ON c.id=g.class_id WHERE g.id=?').get(id);
    title = g ? `${g.cname} · ${g.name}` : '';
  }
  json(res, 200, {
    scope, id, title,
    msgs: rows.map((m) => ({
      id: m.id, body: m.body, at: m.created_at,
      from: m.from_teacher ? 'teacher' : 'student',
      name: m.from_teacher ? 'مس أسماء' : m.full_name,
      leader: !!m.is_leader,
      avatar: m.avatar || '',
    })),
  });
});

/** المس: تكتب في قناة */
route('POST', '/api/teacher/chatroom/:scope/:id', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  const scope = p.scope === 'class' ? 'class' : 'group';
  const id = Number(p.id);
  const text = clean(body.body, 2000);
  if (!text) return json(res, 400, { error: 'اكتب رسالة' });
  const r = db
    .prepare(
      'INSERT INTO chat_msgs (scope, target_id, student_id, from_teacher, body, created_at) VALUES (?,?,NULL,1,?,?)'
    )
    .run(scope, id, text, Date.now());
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

/** المس: تمسح رسالة */
route('DELETE', '/api/teacher/chatroom/:id', async (req, res, body, p) => {
  if (!needTeacher(req, res)) return;
  db.prepare('DELETE FROM chat_msgs WHERE id = ?').run(Number(p.id));
  json(res, 200, { ok: true });
});

/** مركز إشعارات الطالب */
route('GET', '/api/student/notifications', async (req, res) => {
  const st = needStudent(req, res);
  if (!st) return;
  const ann = db
    .prepare("SELECT * FROM messages WHERE kind='announce' ORDER BY id DESC LIMIT 60")
    .all()
    .filter((m) => m.scope === 'all' || (m.scope === 'leaders' && st.is_leader));
  const tasks = tasksFor(st);
  const subs = db.prepare('SELECT task_id FROM submissions WHERE student_id = ?').all(st.id);
  const doneSet = new Set(subs.map((s) => s.task_id));
  const dm = db
    .prepare("SELECT * FROM messages WHERE kind='chat' AND student_id=? ORDER BY id")
    .all(st.id);

  json(res, 200, {
    items: ann.map((a) => ({
      kind: 'announce',
      id: a.id,
      body: a.body,
      scope: a.scope,
      at: a.created_at,
    })),
    dm: dm.map((m) => ({ id: m.id, body: m.body, at: m.created_at })),
    pendingTasks: tasks.filter((t) => !doneSet.has(t.id)).length,
    totalTasks: tasks.length,
  });
});

/* ====== الصحة والتخزين ====== */

const STORAGE = require('./storage');
const PERSIST = require('./persist');

route('GET', '/api/health', async (req, res) => {
  json(res, 200, {
    ok: true,
    version: '1.0',
    build: BUILD,
    uptime: Math.round(process.uptime()),
    roster: db.prepare('SELECT COUNT(*) n FROM roster').get().n,
    students: db.prepare('SELECT COUNT(*) n FROM students').get().n,
    classes: db.prepare('SELECT COUNT(*) n FROM classes').get().n,
    files: db.prepare('SELECT COUNT(*) n FROM files').get().n,
    storage: STORAGE.kind,
  });
});

/** المس: حالة التخزين — كام مستخدم، إيه المتاح، فيه مشكلة؟ */
route('GET', '/api/teacher/storage', async (req, res) => {
  if (!needTeacher(req, res)) return;
  let h;
  try { h = await STORAGE.store.health(); } catch (e) { h = { ok: false, used: 0, note: e.message }; }
  const dbSize = db.prepare('SELECT COALESCE(SUM(size),0) n FROM files').get().n;
  const count = db.prepare('SELECT COUNT(*) n FROM files').get().n;
  json(res, 200, {
    kind: STORAGE.kind,
    ok: !!h.ok,
    note: h.note || '',
    used: h.used || 0,
    limit: h.limit || 0,
    files: count,
    onServer: dbSize,
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

/*
 * 🔴 كارثة أمنية كانت هنا:
 *
 *   decodeURIComponent() بيتحوّل لـ'..' بعد الـdecode، و path.normalize
 *   بيلغيها، فالنتيجة إن '/css/../../data/zwork.db' بتوصل للداتابيز.
 *   جربت: curl http://host/css/../../data/zwork.db → 200 مع الملف كامل!
 *
 *   يعني أي طالب في الفصل كان يقدر ينزّل قاعدة البيانات كلها:
 *   أسماء الـ٢٧٣، أكوادهم، كل الرسايل، كل حاجة.
 *
 * الإصلاح بثلاث طبقات:
 *   ١. بنمنع أي '..' في المسار خالص قبل أي معالجة.
 *   ٢. اللي بيخرج بره ROOT بيترفض فورًا.
 *   ٣. قايمة بيضا للمجلدات — أي حاجة تانية 403 حتى لو جوه ROOT.
 */

/* مجلدات مسموح تخدم من ROOT بس */
const PUBLIC_DIRS = new Set(['css', 'js', 'fonts', 'img', 'icons']);
/* ملفات مسموح في الجذر */
const PUBLIC_ROOT_FILES = new Set([
  'index.html', 'dist-standalone.html', 'manifest.webmanifest',
  'favicon.ico', 'sw.js', 'robots.txt',
]);
/* امتدادات ممنوعة نهائيًا مهما كان مكانها */
const BLOCKED_EXT = new Set([
  '.db', '.db-wal', '.db-shm', '.sqlite', '.sqlite3', '.csv', '.json',
  '.log', '.env', '.pem', '.key', '.bak', '.restore', '.zip', '.md',
]);

function isPublicPath(rel) {
  const clean = rel.replace(/^\/+/, '');
  const parts = clean.split('/').filter(Boolean);
  if (!parts.length) return true;              // '/' → index.html
  if (parts.length === 1) return PUBLIC_ROOT_FILES.has(parts[0].toLowerCase());
  if (parts[0] === 'data' || parts[0] === 'server' || parts[0] === 'tests'
      || parts[0] === 'backups' || parts[0] === 'uploads') return false;
  return PUBLIC_DIRS.has(parts[0].toLowerCase());
}

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('طلب غلط');
    return;
  }

  /* الطبقة ١: أي '..' — مرفوض قبل أي حاجة */
  if (rel.includes('..') || rel.includes('\\') || rel.includes('%2e')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('forbidden');
    return;
  }
  /* حماية إضافية: أي بايت تحكم أو null */
  if (/[\x00-\x1f]/.test(rel)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('طلب غلط');
    return;
  }

  if (rel === '/' || rel === '') rel = '/index.html';

  /* الطبقة ٣: قايمة بيضا */
  if (!isPublicPath(rel)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('مش موجود');
    return;
  }

  const file = path.join(ROOT, path.normalize(rel));
  /* الطبقة ٢: لازم يفضل جوه ROOT */
  const realRoot = path.resolve(ROOT);
  const realFile = path.resolve(file);
  if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('forbidden');
    return;
  }

  /* الطبقة ٤: امتدادات خطرة ممنوعة */
  const low = realFile.toLowerCase();
  for (const bad of BLOCKED_EXT) {
    if (low.endsWith(bad)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('مش موجود');
      return;
    }
  }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('مش موجود');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    /*
     * الكاش: كان 'max-age=3600' على CSS و JS — يعني بعد أي تحديث
     * المتصفح بيفضل يعرض النسخة القديمة لمدة ساعة كاملة. ده كان بيخلي
     * المستخدم يحسب إن الرفع مش شغال. دلوقتي no-store على كل حاجة،
     * عشان أي تعديل يبان على طول.
     */
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate',
      'Pragma': 'no-cache',
      'ETag': '"' + st.size + '-' + Math.round(st.mtimeMs) + '"',
    };

    /* gzip للملفات النصية: js/avatars.js فيه ٢٨ صورة SVG = ١٠٤ كيلو خام
       و١٥ كيلو مضغوط. من غير الضغط ده، أول تحميل على نت ضعيف بياخد وقت.
       الصور والخطوط مضغوطة أصلاً فمش بنعيد ضغطها. */
    const GZIP_EXT = ['.js', '.css', '.html', '.svg', '.json', '.webmanifest', '.txt'];
    const wantsGz = GZIP_EXT.indexOf(ext) >= 0 &&
      /\bgzip\b/.test(req.headers['accept-encoding'] || '') && st.size > 1024;

    if (wantsGz) {
      res.writeHead(200, Object.assign({}, headers, { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' }));
      fs.createReadStream(file).pipe(zlib.createGzip({ level: 6 })).pipe(res);
    } else {
      res.writeHead(200, Object.assign({}, headers, { 'Content-Length': st.size }));
      fs.createReadStream(file).pipe(res);
    }
  });
}

/* ---------------- التوجيه ---------------- */

function match(pattern, pathname) {
  const a = pattern.split('/');
  const b = pathname.split('/');
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) {
      /* decodeURIComponent بترمي URIError على أي % غلط —
         وده كان بيوقّع السيرفر كله من طلب واحد. */
      try { params[a[i].slice(1)] = decodeURIComponent(b[i]); }
      catch (e) { return null; }
    } else if (a[i] !== b[i]) return null;
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
    let p;
    /* match() ممكن ترمي على باراميتر مشفّر غلط — لو حصل،
       نتجاهل المسار ده بدل ما نوقّع السيرفر كله. */
    try { p = match(r.pattern, pathname); } catch (e) { continue; }
    if (!p) continue;
    try {
      const rawUpload = pathname === '/api/files' || pathname === '/api/teacher/files';
      let body = !rawUpload && ['POST', 'PUT', 'PATCH'].includes(req.method)
        ? await readBody(req)
        : {};
      /* JSON.parse ممكن يرجّع null أو مصفوفة أو رقم —
         وكل المعالجات بتفترض كائن. */
      if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
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

/* أي استثناء مش متوقّع في أي مكان ما يقفلش السيرفر.
   قبل كده طلب واحد فيه '%' غلط كان بيوقّف الخدمة لكل الطلبة. */
process.on('uncaughtException', (e) => {
  console.error('⚠️ استثناء مش متوقّع:', e && e.message);
});
process.on('unhandledRejection', (e) => {
  console.error('⚠️ وعد مرفوض:', e && (e.message || e));
});


/*
 * ══════════════ الإقلاع ══════════════
 *
 * الترتيب ده هو أهم حاجة في التطبيق كله:
 *
 *   ١. نستعيد القاعدة من التخزين الخارجي   ← الحسابات والملفات
 *   ٢. نفتح القاعدة
 *   ٣. نعمل حساب المس لو مش موجود
 *   ٤. نحمّل كشف الأسماء لو القاعدة فاضية
 *   ٥. نبدأ نسمع
 *
 * لو عكسنا أي خطوة، الطالب ممكن يدخل ويشوف قاعدة فاضية — أو أسوأ،
 * السيرفر يمسح القاعدة القديمة بكتابة فوقها.
 */
async function main() {
  const st0 = { enabled: PERSIST.available() };

  // ١+٢ الاستعادة لازم تسبق الفتح
  if (st0.enabled) {
    const r = await require('./db').prefetch(
      require('./db').DB_PATH,
      STORAGE.store,
      PERSIST.KEY
    );
    console.log(
      r.restored
        ? `   ✅ القاعدة اترجعت من التخزين (${(r.bytes / 1024).toFixed(1)} ك.ب)`
        : `   ℹ️ ${r.note}`
    );
  }

  db = open();
  A.sweepSessions(db);

  // ٣+٤
  teacher = ensureTeacher();
  bootstrapRoster();

  // اطبع الحالة
  console.log(`   التخزين: ${STORAGE.kind} · الحفظ: ${PERSIST.available() ? 'شغال' : 'مقفول'}`);

  server.listen(PORT, HOST, () => {
    console.log(`Z-Project server on http://${HOST}:${PORT}`);
    console.log(
      `   كشف الأسماء: ${db.prepare('SELECT COUNT(*) n FROM roster').get().n} كود` +
        ` · الطلاب: ${db.prepare('SELECT COUNT(*) n FROM students').get().n}` +
        ` · الفصول: ${db.prepare('SELECT COUNT(*) n FROM classes').get().n}`
    );
  });

  // حفظ أخير عند الإغلاق
  const bye = () => {
    PERSIST.flush(true).finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  };
  process.on('SIGTERM', bye);
  process.on('SIGINT', bye);
}

main().catch((e) => {
  console.error('فشل الإقلاع:', e);
  process.exit(1);
});

module.exports = { server, db };
