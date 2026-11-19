/* اختبار قارئ Excel: بياخد ملف xlsx حقيقي (مضمّن base64) ويقراه */
const fs = require('fs'), path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const results = [];
const check = (n, c, d) => results.push([c ? 'PASS' : 'FAIL', n, d == null ? '' : String(d).slice(0, 100)]);

// بيئة مصغّرة: DecompressionStream/Blob/Response متزامنة
global.DecompressionStream = function (f) { this.f = f; };
global.Blob = class {
  constructor(parts) { this.parts = parts; }
  stream() {
    const parts = this.parts;
    return {
      pipeThrough() {
        const out = zlib.inflateRawSync(Buffer.concat(parts.map(p => Buffer.from(p))));
        return { arr: out };
      }
    };
  }
};
global.Response = class {
  constructor(s) { this.s = s; }
  arrayBuffer() {
    const a = this.s.arr;
    return Promise.resolve(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength));
  }
};

const start = src.indexOf('    async function xlsxRows(bytes) {');
const end = src.indexOf('    function showPreview(count) {');
const block = src.slice(start, end);
const xlsxRows = new Function('bytes', block + '\nreturn xlsxRows(bytes);');

(async () => {
  const b64 = fs.readFileSync(path.join(__dirname, 'fixtures-xlsx.b64'), 'utf8').trim();
  const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  const rows = await xlsxRows(bytes);
  check('xlsx: file opens as a zip', bytes.length > 1000, bytes.length);
  check('xlsx: all rows read', rows.length === 4, rows.length);
  check('xlsx: header row kept for the server to detect', JSON.stringify(rows[0]) === '["code","name","grade"]', JSON.stringify(rows[0]));
  check('xlsx: Arabic names decoded', rows[1][1] === 'يوسف إبراهيم الشامي', rows[1][1]);
  check('xlsx: second row intact', rows[2][0] === 'A12' && rows[2][1] === 'سارة حسن إبراهيم', rows[2][0]);
  check('xlsx: third row intact', rows[3][0] === 'S-2026-004' && rows[3][2] === '3/3', rows[3][0]);

  for (const r of results) console.log(r[0], '-', r[1], r[2] ? '[' + r[2] + ']' : '');
  const f = results.filter(r => r[0] === 'FAIL');
  console.log(f.length ? `\n${f.length} FAILED of ${results.length}` : `\nALL PASSED (${results.length})`);
  process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
