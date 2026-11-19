/* ============================================================
   قاعدة البيانات — SQLite (node:sqlite، بدون أي تبعيات)
   تصميم يتحمل آلاف الطلاب: فهارس على الـ ID والاسم والفصل.
   ============================================================ */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

// read the path lazily so a test can point at a throw-away database
const DB_PATH = process.env.ZDB || path.join(__dirname, '..', 'data', 'zwork.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.__path = DB_PATH;
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

-- كشف الطلاب اللي المدرس بيحمّله (رقم الجلوس 9 أرقام -> الاسم)
CREATE TABLE IF NOT EXISTS roster (
  seat_id      TEXT PRIMARY KEY,              -- 9 أرقام
  full_name    TEXT NOT NULL,
  national_id  TEXT,
  phone        TEXT,
  guardian     TEXT,
  grade        TEXT,
  note         TEXT,
  imported_at  INTEGER NOT NULL,
  imported_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_roster_name ON roster(full_name);

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

-- حساب الطالب: بيتعمل بعد قبول المدرس، ومربوط برقم جلوس موجود في الكشف
CREATE TABLE IF NOT EXISTS students (
  id            TEXT PRIMARY KEY,
  seat_id       TEXT NOT NULL UNIQUE REFERENCES roster(seat_id),
  pass_hash     TEXT,
  secret_q      TEXT,
  secret_hash   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | active | rejected
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
CREATE INDEX IF NOT EXISTS idx_students_group ON students(group_id);

-- طلبات إنشاء الحساب (بتتحول لـ students عند القبول)
CREATE TABLE IF NOT EXISTS requests (
  id          TEXT PRIMARY KEY,
  seat_id     TEXT NOT NULL REFERENCES roster(seat_id),
  pass_hash   TEXT NOT NULL,
  secret_q    TEXT,
  secret_hash TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',     -- pending | approved | rejected
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER,
  decided_by  TEXT,
  note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  role       TEXT NOT NULL,      -- teacher | student
  subject_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id         TEXT PRIMARY KEY,
  at         INTEGER NOT NULL,
  actor      TEXT,
  action     TEXT NOT NULL,
  detail     TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at);
`);

function id(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

module.exports = { db, DB_PATH, id };
