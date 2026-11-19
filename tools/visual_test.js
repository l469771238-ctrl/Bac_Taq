/* Runs the bundled web app in real headless Chrome and captures every screen.
   Also proves that the packaged PDFs render inside the reader (PDF.js). */
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..', 'bactaq', 'web');
const OUT = path.join(__dirname, '..', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.webmanifest': 'application/json',
  '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.ttf': 'font/ttf' };

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('nope'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

async function shot(page, name) {
  await new Promise(r => setTimeout(r, 350));
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('shot', name);
}

(async () => {
  const server = await serve();
  const port = server.address().port;
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 393, height: 851, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('console', m => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text()); });
  page.on('pageerror', e => console.log('PAGE EXCEPTION:', e.message));

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await shot(page, '01-lock');

  // wrong code
  await page.click('#pw');
  await page.type('#pw', 'wrong');
  await page.click('#btn-unlock');
  await new Promise(r => setTimeout(r, 500));
  await shot(page, '02-lock-error');

  // correct code
  await page.evaluate(() => { document.querySelector('#pw').value = ''; });
  await page.click('#pw');
  await page.type('#pw', '3mk.gasser.2026');
  await page.click('#btn-unlock');
  await new Promise(r => setTimeout(r, 800));
  await shot(page, '03-welcome');
  await page.click('#btn-start');
  await shot(page, '04-home');

  // each library
  for (const [i, name] of [[0, 'arabic'], [1, 'english'], [2, 'history'], [3, 'programming']]) {
    await page.evaluate(k => document.querySelectorAll('#subjects .subject')[Number(k)].click(), String(i));
    await new Promise(r => setTimeout(r, 400));
    await shot(page, `05-library-${name}`);
    await page.evaluate(() => document.querySelector('[data-nav="home"]').click());
    await new Promise(r => setTimeout(r, 250));
  }

  // reader: open the Arabic scan and wait for the PDF canvas
  await page.evaluate(() => document.querySelectorAll('#subjects .subject')[0].click());
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => document.querySelector('#files .file').click());
  await page.waitForFunction(() => {
    const c = document.querySelector('#pdf-canvas');
    return c && c.width > 100 && document.querySelector('#reader-loading').classList.contains('hidden');
  }, { timeout: 60000 });
  await new Promise(r => setTimeout(r, 700));
  await shot(page, '06-reader-arabic');

  const stats = await page.evaluate(() => {
    const c = document.querySelector('#pdf-canvas');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4 * 37) if (d[i] < 200) dark++;
    return { w: c.width, h: c.height, darkSamples: dark };
  });
  console.log('reader canvas', JSON.stringify(stats));

  // next page + toc sheet
  await page.evaluate(() => document.querySelector('#btn-next').click());
  await new Promise(r => setTimeout(r, 1200));
  await shot(page, '07-reader-arabic-p2');
  await page.evaluate(() => document.querySelector('#btn-contents').click());
  await new Promise(r => setTimeout(r, 1200));
  await shot(page, '08-reader-toc');
  await page.evaluate(() => document.querySelector('#toc-sheet').classList.remove('open'));

  // other books quickly
  for (const [name, idx] of [['history', 2], ['programming', 3], ['english', 1]]) {
    await page.evaluate(() => document.querySelector('[data-nav="home"]').click());
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(k => document.querySelectorAll('#subjects .subject')[Number(k)].click(), String(idx));
    await new Promise(r => setTimeout(r, 250));
    await page.evaluate(() => document.querySelector('#files .file').click());
    await page.waitForFunction(() => {
      const c = document.querySelector('#pdf-canvas');
      return c && c.width > 100 && document.querySelector('#reader-loading').classList.contains('hidden');
    }, { timeout: 60000 });
    await new Promise(r => setTimeout(r, 700));
    await shot(page, `09-reader-${name}`);
  }

  // ---- bookmarks ----
  await page.evaluate(() => document.querySelector('[data-nav="home"]').click());
  await new Promise(r => setTimeout(r, 250));
  await page.evaluate(() => document.querySelectorAll('#subjects .subject')[2].click());
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => document.querySelector('#files .file').click());
  await page.waitForFunction(() => {
    const c = document.querySelector('#pdf-canvas');
    return c && c.width > 100 && document.querySelector('#reader-loading').classList.contains('hidden');
  }, { timeout: 60000 });
  await new Promise(r => setTimeout(r, 600));

  // add a named bookmark on the current page
  await page.evaluate(() => document.querySelector('#btn-bookmark').click());
  await new Promise(r => setTimeout(r, 400));
  await shot(page, '11-bookmark-modal');
  await page.evaluate(() => { document.querySelector('#mark-name').value = 'تواريخ مهمة — الفصل 3'; });
  await page.click('#mark-save');
  await new Promise(r => setTimeout(r, 400));
  await shot(page, '12-bookmark-saved');

  // a few more on other pages (no limit)
  for (const [i, name] of [['1', 'مراجعة سريعة'], ['2', 'أسئلة امتحان 2024'], ['3', 'خريطة ذهنية']]) {
    await page.evaluate(() => document.querySelector('#btn-next').click());
    await new Promise(r => setTimeout(r, 900));
    await page.evaluate(() => document.querySelector('#btn-bookmark').click());
    await new Promise(r => setTimeout(r, 350));
    await page.evaluate(n => { document.querySelector('#mark-name').value = n; }, name);
    await page.click('#mark-save');
    await new Promise(r => setTimeout(r, 250));
  }

  // the marks tab
  await page.evaluate(() => document.querySelector('#btn-contents').click());
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => document.querySelector('#tab-marks').click());
  await new Promise(r => setTimeout(r, 400));
  await shot(page, '13-bookmarks-list');

  // jump from a bookmark
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#marks-view .mark-row'));
    (rows[0] || { querySelector: () => null }).querySelector('.mark-body').click();
  });
  await new Promise(r => setTimeout(r, 1200));
  await shot(page, '14-bookmark-jumped');

  // about
  await page.evaluate(() => document.querySelector('[data-nav="home"]').click());
  await new Promise(r => setTimeout(r, 250));
  await page.evaluate(() => document.querySelector('[data-nav="about"]').click());
  await new Promise(r => setTimeout(r, 350));
  await shot(page, '10-about');

  await browser.close();
  server.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
