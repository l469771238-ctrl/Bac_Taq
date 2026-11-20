'use strict';
/**
 * كلمات المرور والجلسات.
 * scrypt + salt، ومفيش أي كلمة سر بتتخزن زي ما هي.
 */
const crypto = require('node:crypto');

function hash(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(password), s, 64).toString('hex');
  return { hash: h, salt: s };
}

function verify(password, hashHex, salt) {
  if (!hashHex || !salt) return false;
  const h = crypto.scryptSync(String(password), salt, 64);
  const want = Buffer.from(hashHex, 'hex');
  if (want.length !== h.length) return false;
  return crypto.timingSafeEqual(h, want);
}

/** مقارنة ثابتة الزمن للنصوص القصيرة */
function same(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

const CODE_RE = /^[0-9]{6,12}$/;

function normalizeCode(v) {
  return String(v == null ? '' : v)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s\-_]/g, '');
}

function validCode(code) {
  return CODE_RE.test(normalizeCode(code));
}

function codeProblem(raw) {
  const c = normalizeCode(raw);
  if (!c) return 'اكتب الكود';
  if (!/^[0-9]+$/.test(c)) return 'الكود أرقام بس';
  if (c.length < 6) return 'الكود قصير';
  if (c.length > 12) return 'الكود طويل';
  return '';
}

const MIN_PASS = 6;

function passProblem(p) {
  const s = String(p == null ? '' : p);
  if (!s) return 'اكتب كلمة المرور';
  // مسافات بس = كلمة سر فاضية عمليًا — أي حد يعرف الكود يدخل مكانه
  if (!s.trim()) return 'كلمة المرور مش ممكن تكون مسافات بس';
  if (s.length < MIN_PASS) return 'كلمة المرور لازم 6 حروف على الأقل';
  if (s.length > 200) return 'كلمة المرور طويلة';
  // أرقام بس (زي 12345678) سهلة التخمين — نرفضها
  if (/^\d+$/.test(s)) return 'كلمة المرور مش كلها أرقام — زوّد حرف';
  if (/^(.)\1+$/.test(s)) return 'كلمة المرور كلها حرف واحد — غيّرها';
  return '';
}

/* ---------------- الجلسات ---------------- */

const SESSION_DAYS = 60;

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function createSession(db, role, uid) {
  const now = Date.now();
  const token = newToken();
  db.prepare(
    'INSERT INTO sessions (token, role, uid, created_at, expires_at) VALUES (?,?,?,?,?)'
  ).run(token, role, uid, now, now + SESSION_DAYS * 864e5);
  return token;
}

function readSession(db, token) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(String(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    dropSession(db, token);
    return null;
  }
  return row;
}

function dropSession(db, token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(String(token));
}

function sweepSessions(db) {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}

module.exports = {
  hash, verify, same,
  CODE_RE, normalizeCode, validCode, codeProblem,
  MIN_PASS, passProblem,
  newToken, createSession, readSession, dropSession, sweepSessions,
  SESSION_DAYS,
};
