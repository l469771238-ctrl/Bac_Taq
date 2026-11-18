/* Deep end-to-end check in real Chrome (CI runner).
   Walks every screen and control, records every console error / failed request
   and takes a screenshot of each state. */
const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..', 'app', 'web');
const OUT = path.join(__dirname, '..', 'shots', 'deep');
const PASSWORD = '3mk_gasser_2026';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/json',
  '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rq) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rq.writeHead(404); rq.end('Not found'); return;
      }
      rq.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rq);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, cond, detail) => { results.push({ name, ok: !!cond, detail }); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  const consoleErrors = [], pageErrors = [], failed = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 200)));
  page.on('requestfailed', r => failed.push(r.url().replace(base, '') + ' :: ' + (r.failure() || {}).errorText));
  page.on('response', r => { if (r.status() >= 400) failed.push(r.url().replace(base, '') + ' :: HTTP ' + r.status()); });

  const shot = async n => { await sleep(350); await page.screenshot({ path: path.join(OUT, n + '.png') }); };
  const active = () => page.evaluate(() => (document.querySelector('.screen.active') || {}).id);

  await page.goto(base, { waitUntil: 'networkidle2' });
  await shot('01-lock');
  check('lock screen is the first screen', await active() === 'screen-lock');
  check('title set', (await page.title()).includes('Bac-Taq'));

  // wrong password
  await page.type('#pw', 'wrong-password');
  await page.click('#btn-unlock');
  await sleep(700);
  check('wrong password rejected', await page.evaluate(() => localStorage.getItem('bactaq.activated') === null));
  check('error message visible', await page.evaluate(() => document.querySelector('#pin-error').textContent.trim().length > 0));
  await shot('02-lock-error');

  // correct password
  await page.evaluate(() => { document.querySelector('#pw').value = ''; });
  await page.type('#pw', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#welcome-card').classList.contains('hidden'), { timeout: 8000 });
  check('activation succeeded', await page.evaluate(() => localStorage.getItem('bactaq.activated') === 'true'));
  await shot('03-welcome');
  await page.click('#btn-start');
  await sleep(500);
  check('home shown after welcome', await active() === 'screen-home');
  await shot('04-home');

  // home contents
  check('4 subject cards', await page.evaluate(() => document.querySelectorAll('#subjects .subject').length) === 4);
  check('covers loaded', await page.evaluate(() => Array.from(document.querySelectorAll('#subjects img')).every(i => i.complete && i.naturalWidth > 0)));
  check('page total from metadata', (await page.evaluate(() => document.querySelector('#hero-pages').textContent.trim())) === '415');

  // each subject library
  for (let i = 0; i < 4; i++) {
    await page.evaluate(n => document.querySelectorAll('#subjects .subject')[n].click(), i);
    await sleep(500);
    const ok = await page.evaluate(() => {
      const t = document.querySelector('#lib-title').textContent;
      const f = document.querySelectorAll('#files .file').length;
      const img = document.querySelector('.file-thumb img');
      return { t, f, imgOk: img && img.complete && img.naturalWidth > 0 };
    });
    check('library ' + i + ' has 1 file', ok.f === 1, ok.t);
    check('library ' + i + ' thumb loads', ok.imgOk, ok.t);
    await page.evaluate(() => document.querySelector('#lib-back, [data-nav="home"]').click());
    await sleep(400);
  }

  // reader: open arabic, walk 5 pages, zoom, seek, TOC, bookmark
  await page.evaluate(() => document.querySelectorAll('#subjects .subject')[0].click());
  await sleep(500);
  await page.evaluate(() => document.querySelector('#files .file').click());
  await page.waitForFunction(() => {
    const c = document.querySelector('#pdf-canvas');
    return c && c.width > 100 && document.querySelector('#reader-loading').classList.contains('hidden');
  }, { timeout: 90000 });
  check('arabic book renders page 1', true);
  await shot('05-reader-arabic');

  const pageNo = () => page.evaluate(() => document.querySelector('#page-input').value);
  check('page counter starts at 1', await pageNo() === '1');

  for (const id of ['#btn-next', '#btn-next', '#btn-next']) {
    await page.click(id);
    await sleep(900);
  }
  check('next button advances to page 4', await pageNo() === '4', await pageNo());
  await page.click('#btn-prev'); await sleep(800);
  check('previous button goes back', await pageNo() === '3', await pageNo());

  // jump by typing a page number
  await page.evaluate(() => {
    const i = document.querySelector('#page-input');
    i.value = '120';
    i.dispatchEvent(new Event('change', { bubbles: true }));
    i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await sleep(1600);
  check('typed page jump works', await pageNo() === '120', await pageNo());
  await shot('06-reader-page120');

  // zoom controls
  const before = await page.evaluate(() => document.querySelector('#pdf-canvas').getBoundingClientRect().width);
  await page.click('#btn-zoom-in'); await sleep(1200);
  const after = await page.evaluate(() => document.querySelector('#pdf-canvas').getBoundingClientRect().width);
  check('zoom in enlarges the page', after > before, before.toFixed(0) + ' -> ' + after.toFixed(0));
  await page.click('#btn-zoom-out'); await sleep(900);

  // TOC
  await page.click('#btn-contents'); await sleep(700);
  const tocRows = await page.evaluate(() => document.querySelectorAll('#toc-list .toc-row, #toc-list .toc-item, #toc-list button, #toc-list li').length);
  check('table of contents has entries', tocRows > 0, 'rows=' + tocRows);
  await shot('07-toc');
  await page.evaluate(() => document.querySelector('#tab-marks').click()); await sleep(500);
  check('marks tab reachable', await page.evaluate(() => !document.querySelector('#marks-view').classList.contains('hidden')));
  check('empty state shown for marks', await page.evaluate(() => !!document.querySelector('#marks-view .mark-empty')));
  await shot('08-marks-empty');
  await page.evaluate(() => document.querySelector('#tab-index').click()); await sleep(300);
  await page.evaluate(() => { document.querySelector('#toc-sheet').classList.remove('open'); });
  await sleep(300);

  // bookmarks: add three, rename, delete, persist
  for (let i = 0; i < 3; i++) {
    await page.click('#btn-bookmark'); await sleep(400);
    await page.evaluate(n => { document.querySelector('#mark-name').value = 'إشارة رقم ' + n; }, i + 1);
    await page.click('#mark-save'); await sleep(400);
    if (i < 2) { await page.click('#btn-next'); await sleep(900); }
  }
  check('three bookmarks stored', await page.evaluate(() => (JSON.parse(localStorage.getItem('bactaq.bookmarks') || '{}').arabic || []).length) === 3);
  check('header shows saved state', await page.evaluate(() => document.querySelector('#btn-bookmark').classList.contains('on')));
  await page.click('#btn-contents'); await sleep(500);
  await page.evaluate(() => document.querySelector('#tab-marks').click()); await sleep(600);
  check('three rows listed', await page.evaluate(() => document.querySelectorAll('#marks-view .mark-row').length) === 3);
  await shot('09-marks-list');
  await page.evaluate(() => document.querySelector('#marks-view .mark-row [data-act="rename"]').click());
  await sleep(500);
  await page.evaluate(() => { document.querySelector('#mark-name').value = 'اسم معدّل'; document.querySelector('#mark-save').click(); });
  await sleep(500);
  check('rename persisted', await page.evaluate(() => (JSON.parse(localStorage.getItem('bactaq.bookmarks')).arabic || []).some(m => m.name === 'اسم معدّل')));
  await page.evaluate(() => document.querySelector('#marks-view .mark-row [data-act="del"]').click());
  await sleep(500);
  check('delete removes one', await page.evaluate(() => (JSON.parse(localStorage.getItem('bactaq.bookmarks')).arabic || []).length) === 2);

  // jump from a bookmark
  await page.evaluate(() => document.querySelector('#marks-view .mark-row .mark-body').click());
  await sleep(1600);
  check('jumping from a mark closes the sheet', await page.evaluate(() => !document.querySelector('#toc-sheet').classList.contains('open')));

  // back navigation
  await page.evaluate(() => window.BacTaqBack());
  await sleep(500);
  check('back from reader returns home', await active() === 'screen-home');
  check('continue card remembers the book', await page.evaluate(() => !document.querySelector('#continue-card').hidden));
  await shot('10-home-continue');

  // reading progress survives a reload
  const prog = await page.evaluate(() => JSON.parse(localStorage.getItem('bactaq.progress') || '{}'));
  check('progress stored', !!(prog.arabic && prog.arabic.page > 1), JSON.stringify(prog.arabic || {}));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1200);
  check('reload skips the password (asked once)', await active() === 'screen-home');
  check('bookmarks survive reload', await page.evaluate(() => (JSON.parse(localStorage.getItem('bactaq.bookmarks') || '{}').arabic || []).length) === 2);
  await shot('11-after-reload');

  // every other book opens
  for (const [idx, key] of [[1, 'english'], [2, 'history'], [3, 'programming']]) {
    await page.evaluate(n => document.querySelectorAll('#subjects .subject')[n].click(), idx);
    await sleep(400);
    await page.evaluate(() => document.querySelector('#files .file').click());
    await page.waitForFunction(() => {
      const c = document.querySelector('#pdf-canvas');
      return c && c.width > 100 && document.querySelector('#reader-loading').classList.contains('hidden');
    }, { timeout: 90000 });
    check(key + ' book renders', true);
    await shot('12-reader-' + key);
    await page.evaluate(() => window.BacTaqBack());
    await sleep(400);
  }

  // about + reset
  await page.evaluate(() => document.querySelector('[data-nav="about"]').click());
  await sleep(600);
  check('about screen opens', await active() === 'screen-about');
  check('about has no dead device-key UI', await page.evaluate(() => !document.querySelector('#invite') && !document.querySelector('#device-id')));
  await shot('13-about');
  page.on('dialog', d => d.accept());
  await page.evaluate(() => document.querySelector('#btn-reset').click());
  await sleep(1500);
  check('reset re-locks the app', await page.evaluate(() => localStorage.getItem('bactaq.activated') === 'false'));
  check('reset keeps bookmarks and progress', await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('bactaq.bookmarks') || '{}').arabic || []).length === 2 &&
    !!(JSON.parse(localStorage.getItem('bactaq.progress') || '{}').arabic)));
  check('lock screen after reset', await active() === 'screen-lock');
  await shot('14-after-reset');

  // password accepts every spelling
  for (const spelling of ['3mk.gasser.2026', '3mk-gasser-2026', '3MK_GASSER_2026']) {
    await page.evaluate(() => { localStorage.removeItem('bactaq.activated'); });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(900);
    await page.type('#pw', spelling);
    await page.click('#btn-unlock');
    await sleep(1200);
    check('password spelling accepted: ' + spelling, await page.evaluate(() => localStorage.getItem('bactaq.activated') === 'true'));
  }

  // long-press selection should not be possible on chrome text
  await sleep(300);
  await browser.close();
  srv.close();

  const hardFails = results.filter(r => !r.ok);
  const report = {
    when: new Date().toISOString(),
    passed: results.filter(r => r.ok).length,
    failed: hardFails.length,
    consoleErrors, pageErrors, failedRequests: failed,
    results
  };
  fs.writeFileSync(path.join(__dirname, '..', 'shots', 'deep', 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(__dirname, '..', 'shots', 'deep', 'report.txt'),
    results.map(r => (r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.detail ? '  [' + r.detail + ']' : '')).join('\n') +
    '\n\nconsole errors: ' + (consoleErrors.join(' | ') || 'none') +
    '\npage errors: ' + (pageErrors.join(' | ') || 'none') +
    '\nfailed requests: ' + (failed.join(' | ') || 'none') + '\n');
  console.log('\n=== RESULTS ===');
  results.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.detail ? '   [' + r.detail + ']' : '')));
  console.log('\nconsole errors:', consoleErrors.length ? consoleErrors.slice(0, 6) : 'none');
  console.log('page errors   :', pageErrors.length ? pageErrors.slice(0, 6) : 'none');
  console.log('failed requests:', failed.length ? failed.slice(0, 6) : 'none');
  console.log('\n' + (hardFails.length ? hardFails.length + ' FAILED of ' + results.length : 'ALL ' + results.length + ' CHECKS PASSED'));
  process.exit(hardFails.length || pageErrors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
