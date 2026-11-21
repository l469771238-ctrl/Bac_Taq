'use strict';
/**
 * تخزين Google Drive.
 *
 * بيدي ١٥ جيجا مجانًا على الحساب العادي، أو ٢ تيرا لو حساب Workspace مدرسي.
 * ده أنسب حل لو المس عندها حساب جوجل مدرسي.
 *
 * الإعداد (مرة واحدة):
 *   1. console.cloud.google.com → مشروع جديد
 *   2. Enable APIs → Google Drive API
 *   3. IAM → Service Accounts → إنشاء حساب خدمة
 *   4. المفاتيح → إنشاء مفتاح JSON → نزّله
 *   5. من Drive: اعمل فولدر → مشاركة → حط إيميل حساب الخدمة (بصلاحية Editor)
 *   6. حط في متغيرات البيئة:
 *        ZDRIVE_EMAIL     الإيميل اللي في ملف JSON
 *        ZDRIVE_KEY       محتوى private_key من JSON (السطر الطويل)
 *        ZDRIVE_FOLDER    آي دي الفولدر اللي شاركته
 *
 * بنستخدم OAuth JWT من غير مكتبات — عشان مفيش اعتماديات خارجية.
 */
const crypto = require('node:crypto');
const https = require('node:https');
const fs = require('node:fs');

const EMAIL = process.env.ZDRIVE_EMAIL || '';
const KEY = (process.env.ZDRIVE_KEY || '').replace(/\\n/g, '\n');
const FOLDER = process.env.ZDRIVE_FOLDER || '';
const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive';

let cachedToken = null;
let tokenExp = 0;

function ready() {
  const miss = [];
  if (!EMAIL) miss.push('ZDRIVE_EMAIL');
  if (!KEY) miss.push('ZDRIVE_KEY');
  if (!FOLDER) miss.push('ZDRIVE_FOLDER');
  return miss;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function api(pathOrUrl, method = 'GET', body, headers = {}) {
  const u = pathOrUrl.startsWith('http') ? new URL(pathOrUrl) : new URL('https://www.googleapis.com' + pathOrUrl);
  return new Promise((resolve, reject) => {
    const opt = {
      method,
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      headers,
    };
    const req = https.request(opt, (res) => resolve(res));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function json(res) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      const t = Buffer.concat(chunks).toString('utf8');
      try { resolve(JSON.parse(t)); } catch (e) {
        console.error('⚠️ رد غير مفهوم من جوجل: ' + t.slice(0, 160));
        reject(new Error('الملفات مش متاحة دلوقتي — كلّم المس أسماء'));
      }
    });
    res.on('error', reject);
  });
}

async function token() {
  if (cachedToken && Date.now() < tokenExp - 60000) return cachedToken;
  const miss = ready();
  if (miss.length) {
    console.error('⚠️ جوجل درايف مش مضبوط — ناقص: ' + miss.join(', '));
    throw Object.assign(new Error('الملفات مش متاحة دلوقتي — كلّم المس أسماء'), { status: 503 });
  }
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: EMAIL,
      scope: SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      exp: iat + 3600,
      iat,
    })
  );
  const signingInput = `${header}.${claim}`;
  const sig = crypto.createSign('RSA-SHA256').update(signingInput).sign(KEY);
  const jwt = `${signingInput}.${b64url(sig)}`;

  const form = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(jwt)}`;
  const res = await api('https://oauth2.googleapis.com/token', 'POST', form, {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(form),
  });
  const j = await json(res);
  if (!j.access_token) {
    console.error('⚠️ جوجل رفض المفتاح: ' + (j.error_description || j.error || 'مجهول'));
    throw Object.assign(new Error('الملفات مش متاحة دلوقتي — كلّم المس أسماء'), { status: 502 });
  }
  cachedToken = j.access_token;
  tokenExp = Date.now() + (j.expires_in || 3600) * 1000;
  return cachedToken;
}

/** تدفق لرفع متعدد الأجزاء — عشان الملفات الكبيرة توصل من غير ما تتخزن في الرام */
async function put({ key, body, mime }) {
  const t = await token();
  const isBuf = Buffer.isBuffer(body);
  const name = key;

  if (isBuf) {
    // رفع بسيط: البيانات + الميتاداتا في طلب واحد
    const boundary = 'zbound' + crypto.randomBytes(8).toString('hex');
    const meta = JSON.stringify({ name, parents: [FOLDER] });
    const head =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: ${mime || 'application/octet-stream'}\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;
    const payload = Buffer.concat([Buffer.from(head), body, Buffer.from(tail)]);

    const res = await api(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      'POST',
      payload,
      {
        Authorization: 'Bearer ' + t,
        'Content-Type': 'multipart/related; boundary=' + boundary,
        'Content-Length': String(payload.length),
      }
    );
    const j = await json(res);
    if (!j.id) {
      console.error('⚠️ جوجل رفض الملف');
      throw Object.assign(new Error('الملف ما اترفعش — جرّب تاني'), { status: 502 });
    }
    return j.id;
  }

  // ملف كبير: resident upload — بنستنى الجسم كامل (الحد ١٢٠ ميجا فمقبول)
  const chunks = [];
  for await (const c of body) chunks.push(c);
  return put({ key, body: Buffer.concat(chunks), mime });
}

/* قاعدة البيانات تحتاج مفتاحاً ثابتاً، بخلاف ملفات الطلاب التي تُحفظ بمعرّف Drive. */
async function snapshotId(key) {
  const t = await token();
  const quote = (value) => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = "name = '" + quote(key) + "' and '" + quote(FOLDER) + "' in parents and trashed = false";
  const res = await api('/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)&pageSize=100', 'GET', null, { Authorization: 'Bearer ' + t });
  const j = await json(res);
  if (res.statusCode >= 300 || !Array.isArray(j.files)) throw new Error('تعذر البحث عن نسخة قاعدة البيانات في Drive');
  if (j.files.length > 1) throw new Error('توجد نسخ قاعدة متعددة بنفس الاسم في Drive؛ يلزم مراجعتها قبل التشغيل');
  return j.files.length ? j.files[0].id : null;
}

async function getSnapshot(key) {
  const id = await snapshotId(key);
  if (!id) throw Object.assign(new Error('النسخة مش موجودة'), { status: 404 });
  return get(id);
}

async function putSnapshot({ key, body, mime }) {
  const id = await snapshotId(key);
  if (!id) return put({ key, body, mime });
  const t = await token();
  const res = await api('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(id) + '?uploadType=media&fields=id', 'PATCH', body, {
    Authorization: 'Bearer ' + t,
    'Content-Type': mime || 'application/octet-stream',
    'Content-Length': String(body.length),
  });
  const j = await json(res);
  if (res.statusCode >= 300 || !j.id) throw new Error('تعذر تحديث نسخة قاعدة البيانات في Drive');
  return j.id;
}

async function get(key) {
  const t = await token();
  const res = await api('/drive/v3/files/' + encodeURIComponent(key) + '?alt=media', 'GET', null, {
    Authorization: 'Bearer ' + t,
  });
  if (res.statusCode === 404) throw Object.assign(new Error('الملف مش موجود'), { status: 404 });
  if (res.statusCode >= 300) {
    console.error('⚠️ فشل التنزيل من درايف: ' + res.statusCode);
    throw Object.assign(new Error('الملف ما نزلش — جرّب تاني'), { status: 502 });
  }
  return res;
}

async function getSize(key) {
  const t = await token();
  const res = await api('/drive/v3/files/' + encodeURIComponent(key) + '?fields=size', 'GET', null, {
    Authorization: 'Bearer ' + t,
  });
  const j = await json(res);
  return Number(j.size || 0);
}

async function del(key) {
  const t = await token();
  const res = await api('/drive/v3/files/' + encodeURIComponent(key), 'DELETE', null, {
    Authorization: 'Bearer ' + t,
  });
  res.resume();
}

async function health() {
  const miss = ready();
  if (miss.length) return { ok: false, used: 0, note: 'ناقص إعداد: ' + miss.join(', ') };
  try {
    const t = await token();
    const res = await api('/drive/v3/about?fields=storageQuota', 'GET', null, {
      Authorization: 'Bearer ' + t,
    });
    const j = await json(res);
    const q = j.storageQuota || {};
    return {
      ok: true,
      used: Number(q.usage || 0),
      limit: Number(q.limit || 0),
      note: 'Google Drive متصل',
    };
  } catch (e) {
    return { ok: false, used: 0, note: e.message };
  }
}

module.exports = { put, get, getSize, del, health, ready, putSnapshot, getSnapshot, KIND: 'drive' };
