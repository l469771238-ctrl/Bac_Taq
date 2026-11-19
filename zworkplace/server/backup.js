'use strict';
/**
 * نسخة احتياطية من القاعدة.
 *
 * ليه: قرص الاستضافة المجانية مؤقت. الملفات في التخزين الخارجي آمنة،
 * لكن الحسابات والفصول والدردشة عايشة في القاعدة — لازم نسخة.
 *
 * الاستخدام:
 *   node server/backup.js            → بيعمل نسخة في backups/
 *   node server/backup.js --upload   → + بيرفعها على التخزين الخارجي
 *   node server/backup.js --restore <file>  → بيرجّع نسخة
 */
const fs = require('node:fs');
const path = require('node:path');
const { open, DB_PATH } = require('./db');

const DIR = path.join(__dirname, '..', 'backups');

async function main() {
  const arg = process.argv[2];

  if (arg === '--restore') {
    const src = process.argv[3];
    if (!src || !fs.existsSync(src)) {
      console.error('قول مسار النسخة: node server/backup.js --restore backups/zwork-xxx.db');
      process.exit(1);
    }
    fs.copyFileSync(src, DB_PATH);
    console.log('✅ اترجعت من ' + src + ' إلى ' + DB_PATH);
    return;
  }

  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

  const db = open();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(DIR, `zwork-${stamp}.db`);

  // VACUUM INTO بيدي نسخة نظيفة في خطوة واحدة
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);

  const st = fs.statSync(file);
  const counts = {
    students: db.prepare('SELECT COUNT(*) n FROM students').get().n,
    roster: db.prepare('SELECT COUNT(*) n FROM roster').get().n,
    classes: db.prepare('SELECT COUNT(*) n FROM classes').get().n,
    messages: db.prepare('SELECT COUNT(*) n FROM messages').get().n,
  };

  console.log(`✅ نسخة: ${file}`);
  console.log(`   الحجم: ${(st.size / 1024).toFixed(1)} ك.ب`);
  console.log(`   ${JSON.stringify(counts)}`);

  if (process.argv.includes('--upload')) {
    const { store } = require('./storage');
    const body = fs.readFileSync(file);
    try {
      await store.put({
        key: 'backups/' + path.basename(file),
        body,
        mime: 'application/x-sqlite3',
      });
      console.log('✅ اترفعت على التخزين الخارجي');
    } catch (e) {
      console.error('⚠️ الرفع فشل: ' + e.message);
      console.error('   النسخة موجودة محليًا في: ' + file);
    }
  }

  // امسح النسخ الأقدم من ٣٠ نسخة
  const all = fs
    .readdirSync(DIR)
    .filter((f) => f.startsWith('zwork-') && f.endsWith('.db'))
    .sort();
  while (all.length > 30) {
    const old = all.shift();
    fs.unlinkSync(path.join(DIR, old));
  }
}

main().catch((e) => {
  console.error('فشل: ' + e.message);
  process.exit(1);
});
