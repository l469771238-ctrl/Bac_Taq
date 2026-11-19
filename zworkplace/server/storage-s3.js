'use strict';
/**
 * تخزين S3 متوافق — Cloudflare R2 · Backblaze B2 · iDrive e2 · Amazon S3
 *
 * ليه ده أفضل خيار مجاني للتطبيق ده:
 *   - Backblaze B2: ١٠ جيجا مجانًا، بيكبر معاك
 *   - Cloudflare R2: ١٠ جيجا مجانًا + مفيش رسوم نقل بيانات
 *   - iDrive e2: ١٠ جيجا مجانًا، أرخص رفع/تنزيل
 * المجموع كفاية يعدّي ٥٠ جيجا لو دمجت أكتر من حساب، والأرخص في الفئة دي.
 *
 * التسجيل مجاني ومحتاجش كارت في B2 و iDrive.
 *
 * الإعداد: ٥ متغيرات بيئة بس
 *   ZS3_ENDPOINT   https://s3.us-west-004.backblazeb2.com
 *   ZS3_BUCKET     z-project-files
 *   ZS3_KEY        مفتاح الوصول
 *   ZS3_SECRET     المفتاح السري
 *   ZS3_REGION     us-west-004
 *
 * التوقيع AWS SigV4 مكتوب هنا من غير مكتبات — عشان ما نضيفش أي اعتمادية
 * على حزمة npm خارجية، والتطبيق يفضل خفيف.
 */
const crypto = require('node:crypto');
const https = require('node:https');
const http = require('node:http');
const { URL } = require('node:url');

const ENDPOINT = (process.env.ZS3_ENDPOINT || '').replace(/\/+$/, '');
const BUCKET = process.env.ZS3_BUCKET || '';
const KEY = process.env.ZS3_KEY || '';
const SECRET = process.env.ZS3_SECRET || '';
const REGION = process.env.ZS3_REGION || 'us-east-1';

function ready() {
  const miss = [];
  if (!ENDPOINT) miss.push('ZS3_ENDPOINT');
  if (!BUCKET) miss.push('ZS3_BUCKET');
  if (!KEY) miss.push('ZS3_KEY');
  if (!SECRET) miss.push('ZS3_SECRET');
  return miss;
}

function sha256hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

/**
 * التوقيع — AWS SigV4
 * مهم: أسماء الترويسات لازم تبقى lowercase في التوقيع،
 * والقيم متطابقة بالظبط مع اللي بيتبعت. أي فرق حرف واحد = توقيع غلط.
 */
function sign(method, objPath, payloadHash, rawHeaders) {
  const u = new URL(ENDPOINT);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  // نحوّل كل المفاتيح لـlowercase مرة واحدة
  const h = {};
  for (const [k, v] of Object.entries(rawHeaders)) h[k.toLowerCase()] = String(v).trim();
  h.host = u.host;
  h['x-amz-content-sha256'] = payloadHash;
  h['x-amz-date'] = amzDate;

  const names = Object.keys(h).sort();
  const canonicalHeaders = names.map((n) => `${n}:${h[n]}\n`).join('');
  const signedHeaders = names.join(';');

  const canonicalRequest = [method, objPath, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${dateStamp}/${REGION}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');

  let k = hmac('AWS4' + SECRET, dateStamp);
  k = hmac(k, REGION);
  k = hmac(k, 's3');
  k = hmac(k, 'aws4_request');
  const signature = crypto.createHmac('sha256', k).update(stringToSign).digest('hex');

  return {
    ...h,
    Authorization: `AWS4-HMAC-SHA256 Credential=${KEY}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function request(method, objPath, { headers = {}, body, stream } = {}) {
  const miss = ready();
  if (miss.length) {
    return Promise.reject(
      Object.assign(new Error('التخزين الخارجي مش مضبوط: ' + miss.join(', ')), { status: 503 })
    );
  }
  const u = new URL(ENDPOINT + objPath);

  return new Promise((resolve, reject) => {
    const payloadHash = 'UNSIGNED-PAYLOAD';
    const h = sign(method, u.pathname, payloadHash, { ...headers });
    const opt = {
      method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: h,
    };
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(opt, (res) => resolve(res));
    req.on('error', reject);
    if (stream) {
      stream.on('error', reject);
      stream.pipe(req);
    } else {
      if (body) req.write(body);
      req.end();
    }
  });
}

async function toBuffer(res) {
  const chunks = [];
  for await (const c of res) chunks.push(c);
  return Buffer.concat(chunks);
}

async function put({ key, body, mime }) {
  const objPath = `/${BUCKET}/${encodeURIComponent(key)}`;
  const headers = {
    'content-type': mime || 'application/octet-stream',
  };
  if (Buffer.isBuffer(body)) headers['content-length'] = String(body.length);
  const res = await request('PUT', objPath, { headers, body, stream: Buffer.isBuffer(body) ? null : body });
  if (res.statusCode >= 300) {
    const err = await toBuffer(res);
    throw Object.assign(new Error('فشل الرفع للتخزين: ' + res.statusCode + ' ' + err.toString().slice(0, 200)), { status: 502 });
  }
  return key;
}

async function get(key) {
  const objPath = `/${BUCKET}/${encodeURIComponent(key)}`;
  const res = await request('GET', objPath);
  if (res.statusCode === 404) throw Object.assign(new Error('الملف مش موجود'), { status: 404 });
  if (res.statusCode >= 300) throw Object.assign(new Error('فشل تنزيل الملف: ' + res.statusCode), { status: 502 });
  return res;
}

async function getSize(key) {
  const objPath = `/${BUCKET}/${encodeURIComponent(key)}`;
  const res = await request('HEAD', objPath);
  res.resume();
  return Number(res.headers['content-length'] || 0);
}

async function del(key) {
  const objPath = `/${BUCKET}/${encodeURIComponent(key)}`;
  const res = await request('DELETE', objPath);
  res.resume();
}

async function health() {
  const miss = ready();
  if (miss.length) return { ok: false, used: 0, note: 'ناقص إعداد: ' + miss.join(', ') };
  try {
    const res = await request('GET', `/${BUCKET}?list-type=2&max-keys=1`);
    const body = await toBuffer(res);
    res.resume();
    return {
      ok: res.statusCode < 300,
      used: 0,
      note: res.statusCode < 300 ? 'التخزين الخارجي متصل' : 'رد غير متوقع: ' + res.statusCode + ' ' + body.toString().slice(0, 120),
    };
  } catch (e) {
    return { ok: false, used: 0, note: e.message };
  }
}

module.exports = { put, get, getSize, del, health, ready, KIND: 's3' };
