'use strict';
/**
 * قاعدة البيانات — Z-Project Workplace
 *
 * الفكرة: التطبيق إدارة فصل. المس أسماء هي المركز.
 *
 *   teacher    — حساب المس (واحد بس)
 *   roster     — كشف الأسماء (الكود + الاسم الثلاثي) اللي المس بتوزعه على الطلبة
 *   students   — الطالب بعد ما يطلب انضمام (بيستنى موافقة)
 *   classes    — الفصل
 *   groups     — المجموعة جوه الفصل، متصنفة ولاد / بنات
 *   messages   — إعلانات + دردشة خاصة
 *   files      — ملفات المجموعات والأعضاء
 *   sessions   — الجلسات
 */
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.ZDB || path.join(__dirname, '..', 'data', 'zwork.db');

function open(dbPath = DB_PATH) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teacher (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      name        TEXT NOT NULL DEFAULT 'مس أسماء',
      pass_hash   TEXT NOT NULL,
      pass_salt   TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roster (
      code        TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      sort_no     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS classes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS groups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      gender      TEXT NOT NULL DEFAULT 'boys' CHECK (gender IN ('boys','girls')),
      created_at  INTEGER NOT NULL,
      UNIQUE (class_id, name)
    );

    CREATE TABLE IF NOT EXISTS students (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT NOT NULL UNIQUE,
      full_name   TEXT NOT NULL,
      gender      TEXT NOT NULL DEFAULT 'boy' CHECK (gender IN ('boy','girl')),
      pass_hash   TEXT NOT NULL,
      pass_salt   TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','active','rejected','blocked')),
      is_leader   INTEGER NOT NULL DEFAULT 0,
      group_id    INTEGER REFERENCES groups(id) ON DELETE SET NULL,
      note        TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL,
      decided_at  INTEGER
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      kind        TEXT NOT NULL CHECK (kind IN ('announce','chat')),
      scope       TEXT NOT NULL CHECK (scope IN ('all','leaders','student')),
      student_id  INTEGER REFERENCES students(id) ON DELETE CASCADE,
      body        TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id    INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      student_id  INTEGER REFERENCES students(id) ON DELETE CASCADE,
      stored_name TEXT NOT NULL UNIQUE,
      orig_name   TEXT NOT NULL,
      mime        TEXT NOT NULL DEFAULT '',
      size        INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    );

    /* إعدادات المس — حد المجموعة وغيره */
    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT PRIMARY KEY,
      role        TEXT NOT NULL CHECK (role IN ('teacher','student')),
      uid         INTEGER NOT NULL,
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL
    );


    /* ---- المرحلة ٢: المهمات والتسليم والدردشة ---- */

    /* مطلوب: إما لكل مجموعة أو لعضو معين — الاتنين مربوطين بالفصل */
    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      group_id    INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      student_id  INTEGER REFERENCES students(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      body        TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      file_id     INTEGER REFERENCES files(id) ON DELETE SET NULL,
      link        TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL,
      UNIQUE (task_id, student_id)
    );

    /* دردشة: مجموعة أو فصل بس — مفيش فرد لفرد */
    CREATE TABLE IF NOT EXISTS chat_msgs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      scope       TEXT NOT NULL CHECK (scope IN ('group','class')),
      target_id   INTEGER NOT NULL,
      student_id  INTEGER REFERENCES students(id) ON DELETE SET NULL,
      from_teacher INTEGER NOT NULL DEFAULT 0,
      body        TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ix_tasks_class   ON tasks(class_id, group_id);
    CREATE INDEX IF NOT EXISTS ix_tasks_student ON tasks(student_id);
    CREATE INDEX IF NOT EXISTS ix_sub_task      ON submissions(task_id);
    CREATE INDEX IF NOT EXISTS ix_chat_target   ON chat_msgs(scope, target_id, id);

    CREATE INDEX IF NOT EXISTS ix_students_group  ON students(group_id);
    CREATE INDEX IF NOT EXISTS ix_students_status ON students(status);
    CREATE INDEX IF NOT EXISTS ix_groups_class    ON groups(class_id);
    CREATE INDEX IF NOT EXISTS ix_msg_kind        ON messages(kind, created_at);
    CREATE INDEX IF NOT EXISTS ix_files_group     ON files(group_id);
    CREATE INDEX IF NOT EXISTS ix_sessions_exp    ON sessions(expires_at);
  `);
}

module.exports = { open, migrate, DB_PATH };
