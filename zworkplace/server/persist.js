'use strict';
/**
 * حفظ القاعدة خارج السيرفر — أهم حاجة في التطبيق.
 *
 * المشكلة: كل استضافة مجانية بتدي قرص مؤقت. لو السيرفر نام أو أعاد التشغيل
 * أو اتمسح بالكامل، القاعدة بتضيع — يعني الحسابات والفصول والدردشة.
 *
 * الحل: القاعدة على القرص المحلي للسرعة، وكل تعديل بيتحفظ في التخزين الخارجي.
 * أول ما السيرفر يقوم، بينزّل آخر نسخة من التخزين قبل ما يفتح الباب لأي حد.
 *
 * النتيجة: الطالب بيدخل بيلاقي حسابه وملفاته زي ما سابهم — مهما حصل للسيرفر.
 *
 * الحفظ مش فوري — بيتجمّع ويتحفظ كل ZSYNC_SEC ثانية (افتراضي ٥)
 * عشان ما نضربش التخزين بطلبات كتير. أي تعديل بيعلّم القاعدة "متسخة"،
 * وأول فرصة بيتحفظ.
 */
const fs = require('node:fs');
const path = require('node:path');

const KEY = process.env.ZDB_KEY || 'db/zwork.db';
const INTERVAL = Number(process.env.ZSYNC_SEC || 5) * 1000;

let store = null;
let dbPath = null;
let dirty = false;
let saving = false;
let activeSave = null;
let revision = 0;
let lastSave = 0;
let lastError = '';
let saveCount = 0;
let timer = null;

/** بيتنادى مرة واحدة من db.js بعد فتح القاعدة */
function attach(db, p) {
  dbPath = p;
  try {
    store = require('./storage').store;
  } catch (e) {
    store = null;
  }
  if (!store || !available()) return { ok: false, note: 'الحفظ الخارجي غير مفعّل' };
  if (timer) clearInterval(timer);

  // علامة "متسخة" على أي تعديل — أرخص من مقارنة الملفات
  const origExec = db.exec.bind(db);
  db.exec = function (sql, ...args) {
    const r = origExec(sql, ...args);
    const up = String(sql).trim().toUpperCase();
    if (!up.startsWith('SELECT') && !up.startsWith('PRAGMA') && !up.startsWith('VACUUM')) { dirty = true; revision++; }
    return r;
  };

  const origPrepare = db.prepare.bind(db);
  db.prepare = function (sql) {
    const st = origPrepare(sql);
    const up = String(sql).trim().toUpperCase();
    if (up.startsWith('SELECT') || up.startsWith('PRAGMA')) return st;
    for (const m of ['run']) {
      const orig = st[m].bind(st);
      st[m] = function (...a) {
        const result = orig(...a);
        dirty = true; revision++;
        return result;
      };
    }
    return st;
  };

  timer = setInterval(flush, INTERVAL);
  if (timer.unref) timer.unref();
  return { ok: true, note: 'الحفظ الخارجي شغال' };
}

/** بينزّل آخر نسخة من التخزين قبل فتح السيرفر */
async function restore() {
  if (!store) return { restored: false, note: 'مفيش تخزين خارجي' };
  try {
    const stream = await store.get(KEY);
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    const buf = Buffer.concat(chunks);
    if (!buf.length) return { restored: false, note: 'مفيش نسخة محفوظة' };

    // نكتب في ملف مؤقت ونتأكد إنه سليم قبل ما نستبدل
    const tmp = dbPath + '.restore';
    fs.writeFileSync(tmp, buf);

    // فحص بسيط: أول ١٦ بايت لازم تكون "SQLite format 3"
    const head = fs.readFileSync(tmp, { start: 0, end: 15 }).toString();
    if (head !== 'SQLite format 3\u0000') {
      fs.unlinkSync(tmp);
      return { restored: false, note: 'النسخة المحفوظة تالفة — تجاهلتها' };
    }
    try { fs.unlinkSync(dbPath + '-wal'); } catch (e) {}
    try { fs.unlinkSync(dbPath + '-shm'); } catch (e) {}
    fs.renameSync(tmp, dbPath);
    return { restored: true, bytes: buf.length };
  } catch (e) {
    if (e.status === 404 || /not exist|مش موجود/i.test(e.message)) {
      return { restored: false, note: 'أول تشغيل — مفيش نسخة' };
    }
    return { restored: false, note: e.message };
  }
}

/** بيحفظ القاعدة في التخزين لو فيه تعديلات */
async function flush(force) {
  if (!store || !dbPath || !available()) return { ok: false, note: 'الحفظ الخارجي غير مفعّل' };
  if (activeSave) {
    if (!force) return { ok: false, note: 'بيحفظ بالفعل' };
    await activeSave;
  }
  if (!dirty && !force) return { ok: true, skipped: true };

  saving = true;
  activeSave = (async () => {
    const tmp = path.join(path.dirname(dbPath), '.snapshot.db');
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      global.__sharedDb.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
      const body = fs.readFileSync(tmp);
      fs.unlinkSync(tmp);
      const captured = revision;
      const put = store.putSnapshot || store.put;
      await put({ key: KEY, body, mime: 'application/x-sqlite3' });
      dirty = revision !== captured;
      lastSave = Date.now();
      saveCount++;
      lastError = '';
      return { ok: true, bytes: body.length };
    } catch (e) {
      lastError = e.message;
      return { ok: false, note: e.message };
    } finally {
      saving = false;
    }
  })();
  try { return await activeSave; } finally { activeSave = null; }
}

/**
 * هل الحفظ الخارجي مفعّل؟
 *
 * الوضع المحلي (local) مقفول عن قصد: القرص المحلي هو نفسه المكان اللي
 * بنحفظ فيه، فالاستعادة منه بتلخبط التطوير. الحفظ الخارجي بيشتغل
 * مع s3 أو drive بس — وهما اللي بيستخدموا في النشر.
 */
function available() {
  try {
    const st = require('./storage');
    return !!st.store && st.kind !== 'local';
  } catch (e) {
    return false;
  }
}

function status() {
  return {
    enabled: available(),
    dirty,
    saving,
    lastSave,
    lastError,
    saveCount,
    key: KEY,
    interval: INTERVAL,
  };
}

module.exports = { attach, restore, flush, status, available, KEY };
