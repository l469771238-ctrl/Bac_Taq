/* زرع كشف تجريبي — node server/seed.js [عدد] [--reset]
   أرقام الجلوس 9 أرقام، وأسماء عربية حقيقية الشكل. */
const { db, id } = require('./db');

const FIRST = ['أحمد','محمود','مصطفى','يوسف','كريم','عمر','زياد','حسين','مروان','آدم','سيف','طارق','خالد','إبراهيم','عمرو','أنس','بلال','حازم','رامي','سامح','شريف','صابر','عادل','عصام','فادي','هشام','أيمن','باسم','تامر','جمال'];
const FEM = ['مريم','فاطمة','سارة','نورهان','هبة','أمنية','دعاء','شيماء','رنا','ياسمين','سلمى','ملك','جنى','حبيبة','روان','دنيا','آية','بسنت','إسراء','نهى'];
const SEC = ['محمد','أحمد','علي','حسن','حسين','السيد','إبراهيم','محمود','عبدالله','عبدالرحمن','مصطفى','خالد','سعيد','فؤاد','راضي','الشحات','جاد','سامي','طلعت','فياض'];
const FAM = ['علي','حسن','السيد','إبراهيم','محمود','عبدالله','مصطفى','خالد','سعيد','فؤاد','راضي','الشحات','جاد','سامي','طلعت','فياض','الفولي','البنا','الشامي','الديب'];
const GRADES = ['3/1','3/2','3/3','3/4'];

const N = parseInt(process.argv[2], 10) || 300;
const RESET = process.argv.includes('--reset');
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const rint = (n) => Math.floor(Math.random() * n);

if (RESET) db.exec("DELETE FROM students; DELETE FROM requests; DELETE FROM roster; DELETE FROM groups; DELETE FROM classes;");

const ins = db.prepare(`INSERT INTO roster (seat_id, full_name, national_id, phone, guardian, grade, note, imported_at, imported_by)
  VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(seat_id) DO UPDATE SET full_name=excluded.full_name, grade=excluded.grade`);
let done = 0;
const used = new Set();
db.exec('BEGIN');
for (let i = 0; i < N; i++) {
  let seat;
  do { seat = String(100000000 + i + 1); } while (used.has(seat));
  used.add(seat);
  const female = Math.random() < 0.45;
  const first = female ? rnd(FEM) : rnd(FIRST);
  const name = `${first} ${rnd(SEC)} ${rnd(FAM)}`;
  const nat = '3' + String(1001010000000 + rint(900000000)).slice(1);
  const phone = '010' + String(10000000 + rint(90000000)).slice(0, 8);
  const guardian = `${rnd(SEC)} ${rnd(FAM)}`;
  ins.run(seat, name, nat, phone, guardian, rnd(GRADES), null, Date.now(), 'seed');
  done++;
}
db.exec('COMMIT');
const total = db.prepare('SELECT COUNT(*) c FROM roster').get().c;
console.log(`✅ ${done} طالب — إجمالي الكشف: ${total}`);
console.log('   مثال: 100000001 =', db.prepare('SELECT full_name FROM roster WHERE seat_id=?').get('100000001').full_name);
