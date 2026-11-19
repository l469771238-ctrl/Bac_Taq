/* ============================================================
   الأمان: تشفير كلمات المرور (scrypt) + جلسات + حد محاولات
   ============================================================ */
'use strict';
const crypto = require('node:crypto');
const { db } = require('./db');

const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

function hashPassword(pass) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pass), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return 'scrypt$' + SCRYPT.N + '$' + SCRYPT.r + '$' + SCRYPT.p + '$' + salt.toString('base64') + '$' + key.toString('base64');
}

function verifyPassword(pass, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = +parts[1], r = +parts[2], p = +parts[3];
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  let key;
  try {
    key = crypto.scryptSync(String(pass), salt, expected.length, { N, r, p });
  } catch (e) { return false; }
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

function newToken() { return crypto.randomBytes(32).toString('base64url'); }

function createSession(role, subjectId) {
  const token = newToken();
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token, role, subject_id, created_at, expires_at) VALUES (?,?,?,?,?)')
    .run(token, role, subjectId, now, now + SESSION_DAYS * 86400000);
  return { token, expiresAt: now + SESSION_DAYS * 86400000 };
}

function readSession(token) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return row;
}

function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/* ---- حد المحاولات (مخزن في الذاكرة، 8 محاولات / 10 دقائق لكل مفتاح) ---- */
const tries = new Map();
function tooMany(key, limit = 8, windowMs = 10 * 60000) {
  const now = Date.now();
  const rec = tries.get(key);
  if (!rec || now > rec.reset) { tries.set(key, { n: 1, reset: now + windowMs }); return false; }
  rec.n++;
  return rec.n > limit;
}
function clearTries(key) { tries.delete(key); }

/* ---- تحقق المدخلات ---- */

/**
 * كود الطالب: اللي المدرس بيديه له. مرن عن قصد لأن كل مدرسة بتحط كودها بشكل،
 * بس بنرفض المسافات والرموز الغريبة عشان ما نتعبش في الروابط والبحث.
 *   أمثلة مقبولة: 100000001 · A12 · stu_7 · 3/2-15 · S-2026-004
 */
const CODE_RE = /^[0-9A-Za-z\u0600-\u06FF][0-9A-Za-z\u0600-\u06FF._\/-]{2,39}$/;

function normalizeCode(v) {
  return String(v == null ? '' : v).trim().replace(/\s+/g, '');
}
function validCode(v) { return CODE_RE.test(normalizeCode(v)); }
function codeProblem(v) {
  const c = normalizeCode(v);
  if (!c) return 'اكتب كودك';
  if (c.length < 3) return 'الكود قصير أوي';
  if (c.length > 40) return 'الكود طويل أوي';
  if (!CODE_RE.test(c)) return 'الكود فيه رموز مش مسموحة';
  return null;
}

const NAME_RE = /^[\u0600-\u06FFa-zA-Z\s.'\-]{3,80}$/;
function validName(v) { return NAME_RE.test(String(v || '').trim()); }
function passProblem(p) {
  const s = String(p || '');
  if (s.length < 6) return 'كلمة المرور لازم 6 حروف أو أرقام على الأقل';
  if (s.length > 72) return 'كلمة المرور طويلة أوي';
  if (/^(.)\1+$/.test(s)) return 'كلمة المرور سهلة أوي';
  return null;
}

module.exports = {
  hashPassword, verifyPassword, createSession, readSession, destroySession,
  tooMany, clearTries, validCode, codeProblem, normalizeCode, validName, passProblem,
  SESSION_DAYS
};
