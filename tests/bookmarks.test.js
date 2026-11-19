const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = '/home/user/Bac_Taq/bactaq/web';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function makeDom(extra) {
  const dom = new JSDOM(html, { url: 'https://appassets.androidplatform.net/web/index.html', runScripts: 'outside-only' });
  const w = dom.window;
  w.TextEncoder = TextEncoder;
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return 393; }, configurable: true });
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLCanvasElement.prototype.getContext = () => ({ fillRect(){}, save(){}, restore(){}, beginPath(){}, moveTo(){}, lineTo(){}, closePath(){}, fill(){}, stroke(){}, arc(){} });
  w.fetch = (url) => { try { const buf = fs.readFileSync(path.join(ROOT, url.replace(/^.*\/web\//, ''))); return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(buf.toString('utf8'))) }); } catch (e) { return Promise.reject(e); } };
  if (!w.crypto.subtle) Object.defineProperty(w.crypto, 'subtle', { value: require('crypto').webcrypto.subtle });
  const st = Object.assign({ 'bactaq.activated': '"true"', 'bactaq.device': '"abcdefghjk"' }, extra || {});
  for (const k in st) w.localStorage.setItem(k, st[k]);
  return w;
}

const results = [];
const check = (name, cond, extra) => results.push([cond ? 'PASS' : 'FAIL', name, extra == null ? '' : String(extra)]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// a fake PDF engine so the reader opens without a real PDF in jsdom
function fakePdf(w) {
  const pages = 5;
  w.eval(`
    window.__fakePage = 1;
    window.pdfjsLib = {
      GlobalWorkerOptions: {},
      getDocument: function () {
        return { promise: Promise.resolve({
          numPages: ${pages},
          getPage: function (n) {
            return Promise.resolve({
              getViewport: function (o) { return { width: 600 * (o.scale || 1), height: 800 * (o.scale || 1) }; },
              render: function () { return { promise: Promise.resolve() }; },
              getTextContent: function () { return Promise.resolve({ items: [{ str: 'نص تجريبي صفحة ' + n }] }); }
            });
          },
          getOutline: function () { return Promise.resolve([]); },
          getDestination: function () { return Promise.resolve(null); },
          getPageIndex: function () { return Promise.resolve(0); },
          destroy: function () {}
        }) };
      }
    };
  `);
}

(async () => {
  const w = makeDom();
  fakePdf(w);
  w.eval(fs.readFileSync(path.join(ROOT, 'js/security.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await sleep(250);
  const $ = s => w.document.querySelector(s);
  const $$ = s => Array.from(w.document.querySelectorAll(s));
  const click = s => $(s).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const marks = () => JSON.parse(w.localStorage.getItem('bactaq.bookmarks') || '{}');

  // open first book
  w.document.querySelectorAll('#subjects .subject')[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(80);
  w.document.querySelector('#files .file').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(300);
  check('reader opened', $('#screen-reader').classList.contains('active'));
  check('bookmark button exists', !!$('#btn-bookmark'));
  check('no marks initially', $('#marks-count').textContent === '0', $('#marks-count').textContent);

  // add a bookmark on page 1 with a name
  click('#btn-bookmark');
  await sleep(60);
  check('modal opened', $('#mark-modal').classList.contains('open'));
  check('modal shows page', $('#mark-page-label').textContent.includes('1'), $('#mark-page-label').textContent);
  check('suggestions rendered', $$('#mark-suggest button').length >= 2, $$('#mark-suggest button').length);
  $('#mark-name').value = 'امتحان 2024 — السؤال 3';
  click('#mark-save');
  await sleep(80);
  check('modal closed after save', !$('#mark-modal').classList.contains('open'));
  check('mark stored', (marks().arabic || []).length === 1, JSON.stringify(marks().arabic));
  check('mark name stored', (marks().arabic || [])[0].name === 'امتحان 2024 — السؤال 3', (marks().arabic || [])[0].name);
  check('counter = 1', $('#marks-count').textContent === '1', $('#marks-count').textContent);
  check('header button marked on', $('#btn-bookmark').classList.contains('on'));
  check('dot visible', $('#bookmark-dot').classList.contains('on'));

  // go to page 4 and add another mark using a suggestion
  click('#btn-next'); await sleep(150);
  click('#btn-next'); await sleep(150);
  click('#btn-next'); await sleep(150);
  check('on page 4', $('#page-input').value === '4', $('#page-input').value);
  check('header button off on new page', !$('#btn-bookmark').classList.contains('on'));
  click('#btn-bookmark');
  await sleep(60);
  $$('#mark-suggest button')[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('suggestion fills input', $('#mark-name').value.length > 0, $('#mark-name').value);
  click('#mark-save');
  await sleep(80);
  check('two marks stored', (marks().arabic || []).length === 2, (marks().arabic || []).length);
  check('counter = 2', $('#marks-count').textContent === '2', $('#marks-count').textContent);

  // "unlimited": add 5 more from different pages
  for (let i = 0; i < 5; i++) {
    click('#btn-prev'); await sleep(60);
    click('#btn-bookmark'); await sleep(40);
    click('#mark-save'); await sleep(60);
  }
  check('7 marks stored (no limit)', (marks().arabic || []).length === 7, (marks().arabic || []).length);
  check('counter = 7', $('#marks-count').textContent === '7', $('#marks-count').textContent);

  // open the sheet on the marks tab
  click('#btn-contents');
  await sleep(60);
  check('sheet open', $('#toc-sheet').classList.contains('open'));
  check('index tab active by default', $('#tab-index').classList.contains('on'));
  $$('#tab-marks')[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(80);
  check('marks tab active', $('#tab-marks').classList.contains('on'));
  check('marks view visible', !$('#marks-view').classList.contains('hidden'));
  check('7 rows rendered', $$('#marks-view .mark-row').length === 7, $$('#marks-view .mark-row').length);
  check('rows sorted by page', $$('#marks-view .mark-row').map(r => +r.querySelector('.mark-body span').textContent.match(/صفحة (\d+)/)[1])
        .every((v, i, a) => i === 0 || a[i - 1] <= v));
  check('names visible', $('#marks-view .mark-row .mark-body b').textContent.length > 0, $('#marks-view .mark-row .mark-body b').textContent);
  check('empty hint absent', !$('#marks-view .mark-empty'));

  // jump to a page by clicking a mark
  const row = $$('#marks-view .mark-row').find(r => /صفحة 4/.test(r.textContent));
  row.querySelector('.mark-body').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(200);
  check('sheet closed after jump', !$('#toc-sheet').classList.contains('open'));
  check('jumped to page 4', $('#page-input').value === '4', $('#page-input').value);

  // rename via the edit button
  click('#btn-contents'); await sleep(50);
  click('#tab-marks'); await sleep(60);
  const first = $$('#marks-view .mark-row')[0];
  first.querySelector('[data-act="rename"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(60);
  check('rename modal opened', $('#mark-modal').classList.contains('open'));
  check('rename prefills name', $('#mark-name').value.length > 0, $('#mark-name').value);
  $('#mark-name').value = 'اسم جديد';
  click('#mark-save');
  await sleep(80);
  check('name changed in storage', (marks().arabic || []).some(m => m.name === 'اسم جديد'), JSON.stringify((marks().arabic || []).map(m => m.name)));
  check('renamed row in list', $$('#marks-view .mark-row').some(r => r.textContent.includes('اسم جديد')));

  // delete one
  const before = (marks().arabic || []).length;
  $$('#marks-view .mark-row')[0].querySelector('[data-act="del"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(80);
  check('one mark deleted', (marks().arabic || []).length === before - 1, (marks().arabic || []).length);
  check('counter updated', $('#marks-count').textContent === String(before - 1), $('#marks-count').textContent);
  check('row removed', $$('#marks-view .mark-row').length === before - 1, $$('#marks-view .mark-row').length);

  // XSS safety: a name with html must be escaped
  click('#btn-bookmark'); await sleep(40);
  $('#mark-name').value = '<img src=x onerror=alert(1)>';
  click('#mark-save'); await sleep(60);
  click('#tab-marks'); await sleep(60);
  check('name is escaped', !$('#marks-view').innerHTML.includes('<img src=x'), 'escaped');

  // clear all
  $('#clear-marks').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(80);
  check('all cleared', (marks().arabic || []).length === 0, (marks().arabic || []).length);
  check('empty state shows', !!$('#marks-view .mark-empty'));
  check('counter = 0', $('#marks-count').textContent === '0', $('#marks-count').textContent);

  // persistence across relaunch, and per-book isolation
  const w2 = makeDom({ 'bactaq.bookmarks': JSON.stringify({ english: [{ id: 'a', page: 3, name: 'قواعد', at: Date.now() }] }) });
  fakePdf(w2);
  w2.eval(fs.readFileSync(path.join(ROOT, 'js/security.js'), 'utf8'));
  w2.eval(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'));
  w2.document.dispatchEvent(new w2.Event('DOMContentLoaded'));
  await sleep(250);
  w2.document.querySelectorAll('#subjects .subject')[1].dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  await sleep(80);
  w2.document.querySelector('#files .file').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  await sleep(300);
  check('saved marks reappear after relaunch', w2.document.querySelector('#marks-count').textContent === '1',
        w2.document.querySelector('#marks-count').textContent);
  w2.document.querySelector('#btn-contents').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  await sleep(50);
  w2.document.querySelector('#tab-marks').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  await sleep(60);
  check('saved mark name shown', w2.document.querySelector('#marks-view .mark-body b').textContent === 'قواعد',
        w2.document.querySelector('#marks-view .mark-body b').textContent);

  for (const r of results) console.log(r[0], '-', r[1], r[2] ? '[' + r[2] + ']' : '');
  const fails = results.filter(r => r[0] === 'FAIL');
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED (' + results.length + ')');
  process.exit(fails.length ? 1 : 0);
})();
