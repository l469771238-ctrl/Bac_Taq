'use strict';
/**
 * الملفات — استقبال، تخزين، تحميل، وضغط في ZIP منظم.
 *
 * الرحلة: المعالج (مس أسماء) بتبعت البيانات خام في نص الطلب،
 * والاسم الأصلي في الهيدر X-Filename، والحجم في Content-Length.
 * بنخزن باسم عشوائي على القرص عشان نمنع أي محاولة تنفيذ أو تعارض،
 * والاسم الأصلي بيتحفظ في القاعدة زي ما هو.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_SIZE = 120 * 1024 * 1024; // ١٢٠ ميجا للملف الواحد

function ensureDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function safeName(name) {
  return String(name || 'ملف')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 160) || 'ملف';
}

/** بيقرا جسم الطلب كملف ويخزنه. بيرجّع {storedName, size} */
function receive(req, onLimit) {
  ensureDir();
  const stored = crypto.randomBytes(18).toString('hex');
  const full = path.join(UPLOAD_DIR, stored);
  const out = fs.createWriteStream(full);
  let size = 0;
  let aborted = false;

  return new Promise((resolve, reject) => {
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_SIZE && !aborted) {
        aborted = true;
        out.destroy();
        fs.unlink(full, () => {});
        if (onLimit) onLimit();
        reject(Object.assign(new Error('الملف أكبر من ١٢٠ ميجا'), { status: 413, big: true }));
        return;
      }
      if (!aborted) out.write(c);
    });
    req.on('end', () => {
      if (aborted) return;
      out.end(() => resolve({ storedName: stored, size }));
    });
    req.on('error', (e) => {
      out.destroy();
      fs.unlink(full, () => {});
      reject(e);
    });
  });
}

function remove(storedName) {
  if (!storedName) return;
  const p = path.join(UPLOAD_DIR, path.basename(storedName));
  fs.unlink(p, () => {});
}

function read(storedName) {
  return fs.readFileSync(path.join(UPLOAD_DIR, path.basename(storedName)));
}

/* ---------------- ZIP ---------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

function dosTime(d = new Date()) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

/**
 * بيبني ZIP من قائمة {name, data|storedName}.
 * بيستخدم deflate لو الملف كبير، وstore لو صغير (أسرع وأصغر في الهيدر).
 */
function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, date } = dosTime();

  for (const e of entries) {
    const data = e.data || read(e.storedName);
    const nameBuf = Buffer.from(e.name, 'utf8');
    const crc = crc32(data);

    // deflate خام (بدون zlib wrapper) مطلوب في الـZIP
    let packed = data;
    let method = 0;
    if (data.length > 512) {
      const def = zlib.deflateRawSync(data, { level: 6 });
      if (def.length < data.length) {
        packed = def;
        method = 8;
      }
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0x0800, 6);      // flags: UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, packed);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);   // UTF-8 flag — لازم هنا كمان
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(time, 12);
    cen.writeUInt16LE(date, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(packed.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, nameBuf]));

    offset += local.length + nameBuf.length + packed.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, end]);
}

module.exports = {
  UPLOAD_DIR, MAX_SIZE, ensureDir, safeName, receive, remove, read, buildZip, crc32,
};
