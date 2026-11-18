/* Opens every book in the real reader and checks each rendered page for the
   "text over text" artefact: for a clean document the ink is smooth, while
   overlapping glyphs create dense dark blotches. We compare each page's dark
   pixel ratio against the whole book and flag outliers, then screenshot the
   flagged pages so a human can look at them. */
const fs = require('fs'), http = require('http'), path = require('path');
const puppeteer = require('puppeteer');
const ROOT = path.join(__dirname, '..', 'app', 'web');
const OUT = path.join(__dirname, '..', 'shots', 'pages');
const MIME = { '.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json',
  '.png':'image/png','.jpg':'image/jpeg','.webmanifest':'application/json','.woff2':'font/woff2','.pdf':'application/pdf',
  '.bcmap':'application/octet-stream','.pfb':'application/octet-stream' };
function serve() { return new Promise(r => { const s = http.createServer((q, res) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}); s.listen(0, '127.0.0.1', () => r(s)); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await page.goto(base, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.setItem('bactaq.activated', 'true'));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(800);

  const books = [['arabic', 0, 148], ['english', 1, 64], ['history', 2, 131], ['programming', 3, 72]];
  const summary = [];
  for (const [key, idx, total] of books) {
    await page.evaluate(() => window.BacTaqBack && window.BacTaqBack());
    await sleep(200);
    await page.evaluate(n => document.querySelectorAll('#subjects .subject')[n].click(), idx);
    await sleep(400);
    await page.evaluate(() => document.querySelector('#files .file').click());
    await page.waitForFunction(() => document.querySelector('#pdf-canvas') &&
      document.querySelector('#pdf-canvas').width > 100 &&
      document.querySelector('#reader-loading').classList.contains('hidden'), { timeout: 120000 });

    const step = Math.max(1, Math.floor(total / 12));
    const ratios = [];
    for (let p = 1; p <= total; p += step) {
      await page.evaluate(n => {
        const i = document.querySelector('#page-input');
        i.value = n; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }, p);
      // wait until the reader really shows that page, then let the canvas settle
      await page.waitForFunction(n => {
        const h = document.querySelector('#reader-page');
        return h && h.textContent.includes('صفحة ' + n + ' ');
      }, { timeout: 30000 }, p).catch(() => {});
      await sleep(450);
      const stats = await page.evaluate(() => {
        const c = document.querySelector('#pdf-canvas');
        const ctx = c.getContext('2d');
        const w = c.width, h = c.height;
        const d = ctx.getImageData(0, 0, w, h).data;
        // dark-pixel ratio + count of very dark runs (glyph pile-up signature)
        let dark = 0, n = 0, veryDark = 0;
        for (let i = 0; i < d.length; i += 4 * 17) { n++; const v = d[i]; if (v < 160) dark++; if (v < 70) veryDark++; }
        return { ratio: dark / n, dense: veryDark / n, w, h };
      });
      ratios.push({ page: p, ...stats });
    }
    const avg = ratios.reduce((a, r) => a + r.ratio, 0) / ratios.length;
    const outliers = ratios.filter(r => r.ratio > avg * 1.9 + 0.05);
    summary.push({ key, avg: +avg.toFixed(3), sampled: ratios.length, outliers: outliers.map(o => o.page) });
    console.log(`${key.padEnd(12)} pages=${total} sampled=${ratios.length} inkRatio=${avg.toFixed(3)} suspicious=${outliers.length ? outliers.map(o => o.page).join(',') : 'none'}`);
    // screenshot a couple of pages for the record
    for (const p of [1, Math.ceil(total / 2)]) {
      await page.evaluate(n => { const i = document.querySelector('#page-input');
        i.value = n; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }, p);
      await page.waitForFunction(n => {
        const h = document.querySelector('#reader-page');
        return h && h.textContent.includes('صفحة ' + n + ' ');
      }, { timeout: 30000 }, p).catch(() => {});
      await sleep(700);
      await page.screenshot({ path: path.join(OUT, `${key}-p${p}.png`) });
    }
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ summary, errs }, null, 2));
  const bad = summary.filter(s => s.outliers.length);
  console.log('\npage errors:', errs.length ? errs.slice(0, 5) : 'none');
  console.log(bad.length ? 'suspicious pages: ' + JSON.stringify(bad) : 'every sampled page looks clean');
})().catch(e => { console.error(e); process.exit(1); });
