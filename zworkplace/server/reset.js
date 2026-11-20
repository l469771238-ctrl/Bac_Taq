'use strict';
/**
 * تصفير قاعدة البيانات — بيسيب كشف الأكواد بس.
 *
 *   node server/reset.js            → تصفير كل حاجة ما عدا roster
 *   node server/reset.js --dry      → يقول هيمسح ايه بس من غير ما يمسح
 *   node server/reset.js --keep-teacher
 *                                   → بيسيب حساب المس (كلمة المرور زي ما هي)
 *
 * اللي بيتفضل زي ما هو:
 *   roster  — ٢٧٣ كود مربوط بالاسم. ده أساس التطبيق كله.
 *
 * اللي بيتمسح:
 *   students · classes · groups · messages · files · sessions
 *   tasks · submissions · chat_msgs · settings
 *   teacher  (إلا لو --keep-teacher)
 *
 * ⚠️  ملفات التخزين (uploads/) مش بتمسحهم السكريبت — امسحيهم يدويًا
 *     لو عايز تمسحي الملفات المرفوعة كمان.
 */
const path = require('node:path');
const fs = require('node:fs');

const DRY = process.argv.includes('--dry');
const KEEP_TEACHER = process.argv.includes('--keep-teacher');

/* جدول مسموح نمسح منه — أي اسم تاني بيترفض */
const ALLOWED = new Set([
  'students', 'classes', 'groups', 'messages', 'files',
  'sessions', 'tasks', 'submissions', 'chat_msgs', 'settings',
  'teacher',
]);

function main() {
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = process.env.ZDB || path.join(__dirname, '..', 'data', 'zwork.db');

  if (!fs.existsSync(dbPath)) {
    console.error('❌ مفيش قاعدة بيانات هنا:', dbPath);
    process.exit(1);
  }

  const db = new DatabaseSync(dbPath);

  const tables = KEEP_TEACHER
    ? [...ALLOWED].filter((t) => t !== 'teacher')
    : [...ALLOWED];

  // نعرف الجداول اللي موجودة فعلًا
  const present = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name);

  const targets = tables.filter((t) => present.includes(t));

  // كشف الأكواد — أرقام قبل
  const rosterBefore = db.prepare('SELECT COUNT(*) n FROM roster').get().n;
  console.log('');
  console.log('  قاعدة البيانات:', dbPath);
  console.log('  كشف الأكواد    :', rosterBefore, 'كود  ← هيتفضل زي ما هو');
  console.log('');
  console.log('  هيتمسح:');
  for (const t of targets) {
    let n = 0;
    try { n = db.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n; } catch (e) {}
    if (n > 0) console.log(`    • ${t.padEnd(14)} ${n}`);
  }
  console.log('');

  if (DRY) {
    db.close();
    console.log('  (تجربة فقط — مفيش حاجة اتمسحت)');
    console.log('  شغّل من غير --dry عشان ينفّذ.');
    console.log('');
    return;
  }

  // الحذف في transaction واحدة — إما كله أو ولا حاجة
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    for (const t of targets) {
      db.exec(`DELETE FROM "${t}"`);
    }
    // نصفّر عدادات AUTOINCREMENT عشان الـIDs تبدأ من ١ من جديد
    try {
      db.exec("DELETE FROM sqlite_sequence WHERE name IN ('classes','groups','students','messages','files','tasks','submissions','chat_msgs')");
    } catch (e) { /* sqlite_sequence مش موجودة لو مفيش AUTOINCREMENT */ }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    db.close();
    console.error('❌ حصل خطأ — كل حاجة رجعت زي ما كانت:', e.message);
    process.exit(1);
  }

  // تأكيد
  const rosterAfter = db.prepare('SELECT COUNT(*) n FROM roster').get().n;
  let left = 0;
  for (const t of targets) {
    try { left += db.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n; } catch (e) {}
  }
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('VACUUM');
  db.close();

  console.log('  ✅ اتمسح', targets.length, 'جدول');
  console.log('  ✅ كشف الأكواد   :', rosterAfter, 'كود  (كان', rosterBefore + ')');
  console.log('  ✅ صفوف متبقية   :', left);
  console.log('');

  if (rosterAfter !== rosterBefore) {
    console.error('⚠️  تحذير: عدد الأكواد اتغيّر! راجع فورًا.');
    process.exit(2);
  }
  if (left !== 0) {
    console.error('⚠️  تحذير: فيه', left, 'صف لسه موجود.');
    process.exit(3);
  }
  console.log('  تمام — إعادة تشغيل السيرفر دلوقتي.');
  console.log('');
}

main();
