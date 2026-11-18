/* Look for overlapping / clipped UI text on small phones (320-360 px wide). */
const fs = require('fs'), http = require('http'), path = require('path');
const puppeteer = require('puppeteer');
const ROOT = path.join(__dirname, '..', 'app', 'web');
const OUT = path.join(__dirname, '..', 'shots', 'small');
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

/* collects pairs of visible text elements whose boxes overlap */
const OVERLAP_JS = () => {
  const pick = sel => Array.from(document.querySelectorAll(sel)).filter(e => {
    const r = e.getBoundingClientRect();
    const st = getComputedStyle(e);
    return r.width > 2 && r.height > 2 && st.visibility !== 'hidden' && st.display !== 'none' && e.textContent.trim();
  });
  const els = pick('.screen.active h1, .screen.active h2, .screen.active h3, .screen.active h4, .screen.active b, ' +
    '.screen.active p, .screen.active span, .screen.active button, .screen.active .tiny, .screen.active .chip, ' +
    '.screen.active .tab span, .screen.active label');
  const bad = [];
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ix > 3 && iy > 3) {
        const area = Math.min(ra.width * ra.height, rb.width * rb.height);
        if (ix * iy / area > 0.28) bad.push([a.className || a.tagName, (a.textContent||'').trim().slice(0, 22),
                                            b.className || b.tagName, (b.textContent||'').trim().slice(0, 22),
                                            Math.round(ix * iy / area * 100) + '%']);
      }
    }
  }
  const clipped = Array.from(document.querySelectorAll('.screen.active *')).filter(e => {
    const r = e.getBoundingClientRect();
    return r.right > window.innerWidth + 2 || r.left < -2;
  }).slice(0, 4).map(e => (e.className || e.tagName) + ':' + (e.textContent || '').trim().slice(0, 20));
  return { bad: bad.slice(0, 8), clipped };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const report = [];
  for (const vp of [{ w: 320, h: 568, n: '320' }, { w: 360, h: 640, n: '360' }, { w: 412, h: 915, n: '412' }]) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(base, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.setItem('bactaq.activated', 'true'));
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(900);
    const stages = [['home', async () => { }],
      ['library', async () => { await page.evaluate(() => document.querySelectorAll('#subjects .subject')[0].click()); await sleep(500); }],
      ['reader', async () => { await page.evaluate(() => document.querySelector('#files .file').click());
        await page.waitForFunction(() => document.querySelector('#pdf-canvas') && document.querySelector('#pdf-canvas').width > 100 &&
          document.querySelector('#reader-loading').classList.contains('hidden'), { timeout: 90000 }); }],
      ['sheet', async () => { await page.evaluate(() => document.querySelector('#btn-contents').click()); await sleep(600); }],
      ['marks', async () => { await page.evaluate(() => document.querySelector('#tab-marks').click()); await sleep(500); }]];
    for (const [name, fn] of stages) {
      await fn();
      await sleep(300);
      const res = await page.evaluate(OVERLAP_JS);
      const tag = vp.n + '-' + name;
      await page.screenshot({ path: path.join(OUT, tag + '.png') });
      report.push({ screen: tag, ...res });
      console.log(tag, '| overlaps:', res.bad.length ? JSON.stringify(res.bad) : 'none', '| clipped:', res.clipped.length ? JSON.stringify(res.clipped) : 'none');
    }
    await page.close();
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const dirty = report.filter(r => r.bad.length || r.clipped.length);
  console.log('\n' + (dirty.length ? dirty.length + ' screen(s) with layout issues' : 'no overlapping text on any tested screen'));
})().catch(e => { console.error(e); process.exit(1); });
