'use strict';
/**
 * طبقة التخزين — الملفات مش بتعيش على قرص السيرفر.
 *
 * السبب: أغلب الاستضافات المجانية بتدي قرص مؤقت بيتمسح مع كل إعادة تشغيل.
 * فبنحط ملفات الطلاب في مكان ثابت (Google Drive أو أي تخزين S3)،
 * والسيرفر نفسه مبيحتفظش غير بكيلوبايتات القاعدة.
 *
 * المشغّل بيتغيّر بمتغير بيئة واحد: ZSTORAGE=local|s3|drive
 * الافتراضي local (للتطوير والاختبار)، وفي النشر بنحطه على s3 أو drive.
 *
 * كل مشغّل لازم يوفّر:
 *   put({ key, body, mime, size })  → Promise<void>
 *   get(key)                         → Promise<ReadableStream|Buffer>
 *   getSize(key)                     → Promise<number>
 *   del(key)                         → Promise<void>
 *   health()                         → Promise<{ ok, used, note }>
 */

const STORE = (process.env.ZSTORAGE || 'local').toLowerCase();

let impl;
let label = STORE;

if (STORE === 's3' || STORE === 'r2' || STORE === 'b2') {
  impl = require('./storage-s3');
  label = 's3';
} else if (STORE === 'drive' || STORE === 'gdrive') {
  impl = require('./storage-drive');
  label = 'drive';
} else {
  impl = require('./storage-local');
  label = 'local';
}

module.exports = { store: impl, kind: label };
