'use strict';
/**
 * تخزين محلي — للتطوير والاختبار بس.
 * في النشر على استضافة مجانية ده خطر: القرص بيتمسح.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DIR = process.env.ZUPLOADS || path.join(__dirname, '..', 'uploads');

function ensure() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

function newKey() {
  return crypto.randomBytes(18).toString('hex');
}

function file(key) {
  return path.join(DIR, path.basename(key));
}

async function put({ key, body }) {
  ensure();
  const p = file(key || newKey());
  await new Promise((resolve, reject) => {
    if (Buffer.isBuffer(body)) {
      fs.writeFile(p, body, (e) => (e ? reject(e) : resolve()));
      return;
    }
    const out = fs.createWriteStream(p);
    body.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    body.pipe(out);
  });
  return path.basename(p);
}

async function get(key) {
  const p = file(key);
  if (!fs.existsSync(p)) throw Object.assign(new Error('الملف مش موجود'), { status: 404 });
  return fs.createReadStream(p);
}

async function getSize(key) {
  const p = file(key);
  return fs.existsSync(p) ? fs.statSync(p).size : 0;
}

async function del(key) {
  const p = file(key);
  await new Promise((r) => fs.unlink(p, () => r()));
}

async function health() {
  ensure();
  let used = 0;
  for (const f of fs.readdirSync(DIR)) {
    try { used += fs.statSync(path.join(DIR, f)).size; } catch (e) {}
  }
  return { ok: true, used, note: 'قرص محلي — للتطوير بس، بيتمسح مع إعادة التشغيل لو على استضافة مجانية' };
}

module.exports = { put, get, getSize, del, health, newKey, DIR };
