/* ============================================================
   قاعدة البيانات — SQLite (node:sqlite، بدون أي تبعيات)

   الفكرة: الطالب عنده "كود" من قاعدة بيانات المدرس (كشف الفصل).
   الكود ده هو اللي بيتكتب وقت التسجيل، والاسم بيظهر منه.
   بعد التسجيل التسجيل بيتحفظ — الطالب بيرجع يلاقي حسابه شغال.

   الجداول:
     roster    كشف الطلاب (code -> full_name)   ← بيتملي من قاعدة بيانات المدرس
     students  حسابات الطلاب (الكود + كلمة المرور + الحالة + الفصل/المجموعة)
     requests  طلبات التسجيل الجديدة (لو المدرس فعّل "الموافقة قبل التفعيل")
     classes / groups  تقسيم الفصل
     sessions  الجلسات المفتوحة
     teachers  المدرس
     audit     سجل العمليات
   ============================================================ */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.ZDB || path.join(__dirname, '..', 'data', 'zwork.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.__path = DB_PATH;

/**
 * ترقية من المخطط القديم (seat_id = رقم جلوس) للمخطط الجديد (code).
 * الترقية دي بتحصل مرة واحدة قبل إنشاء الجداول: لو لقينا الجداول القديمة،
 * بنشيل اللي اتغيّر شكلها وبنسيب teachers/sessions/audit زي ما هما.
 * (ده مخطط ما قبل الإصدار — مفيش بيانات حقيقية بنخسرها.)
 */
function upgradeLegacySchema() {
  const colsOf = (t) => {
    try { return db.prepare('PRAGMA table_info(' + t + ')').all().map(c => c.name); }
    catch (e) { return []; }
  };
  const rosterCols = colsOf('roster');
  if (!rosterCols.length) return;                 // قاعدة جديدة — مفيش حاجة نعملها
  if (rosterCols.includes('code')) return;        // أصلاً على المخطط الجديد
  try {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    for (const t of ['requests', 'students', 'groups', 'classes', 'roster']) {
      db.exec('DROP TABLE IF EXISTS ' + t);
    }
    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys = ON');
    console.log('ℹ️  اتم عمل ترقية للمخطط الجديد (code بدل seat_id)');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw e;
  }
}
upgradeLegacySchema();

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS teachers (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT UNIQUE,
  pass_hash    TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

-- كشف الطلاب: الكود اللي الطالب بيكتبه -> اسمه
CREATE TABLE IF NOT EXISTS roster (
  code         TEXT PRIMARY KEY,             -- كود الطالب (حروف/أرقام، فريد)
  full_name    TEXT NOT NULL,
  national_id  TEXT,
  phone        TEXT,
  guardian     TEXT,
  grade        TEXT,
  note         TEXT,
  imported_at  INTEGER NOT NULL,
  imported_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_roster_name  ON roster(full_name);
CREATE INDEX IF NOT EXISTS idx_roster_grade ON roster(grade);

CREATE TABLE IF NOT EXISTS classes (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  grade      TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id         TEXT PRIMARY KEY,
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  capacity   INTEGER NOT NULL DEFAULT 5,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_groups_class ON groups(class_id);

-- حساب الطالب: الكود مربوط بالكشف، والتسجيل بيتحفظ على طول
CREATE TABLE IF NOT EXISTS students (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE REFERENCES roster(code),
  pass_hash     TEXT,
  secret_q      TEXT,
  secret_hash   TEXT,
  status        TEXT NOT NULL DEFAULT 'active',   -- active | pending | rejected | blocked
  class_id      TEXT REFERENCES classes(id),
  group_id      TEXT REFERENCES groups(id),
  created_at    INTEGER NOT NULL,
  approved_at   INTEGER,
  approved_by   TEXT,
  last_login    INTEGER,
  failed_tries  INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_students_group  ON students(group_id);
CREATE INDEX IF NOT EXISTS idx_students_class  ON students(class_id);

CREATE TABLE IF NOT EXISTS requests (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL REFERENCES roster(code),
  pass_hash   TEXT NOT NULL,
  secret_q    TEXT,
  secret_hash TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER,
  decided_by  TEXT,
  note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_code   ON requests(code);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  role       TEXT NOT NULL,      -- teacher | student
  subject_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_subject ON sessions(subject_id);

CREATE TABLE IF NOT EXISTS audit (
  id         TEXT PRIMARY KEY,
  at         INTEGER NOT NULL,
  actor      TEXT,
  action     TEXT NOT NULL,
  detail     TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at);

-- إعدادات السيرفر (خيارات المدرس)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

/* ------------- إعدادات ------------- */
function setting(key, fallback) {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!row) return fallback;
    return row.value;
  } catch (e) { return fallback; }
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}
/** هل الطالب الجديد يستنى موافقة المدرس قبل ما يقدر يدخل؟ (افتراضي: لا) */
function approvalRequired() { return setting('approval_required', '0') === '1'; }

function id(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

module.exports = { db, DB_PATH, id, setting, setSetting, approvalRequired };
