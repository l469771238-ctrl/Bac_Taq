const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'bactaq', 'web');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function makeDom() {
  const dom = new JSDOM(html, { url: 'https://appassets.androidplatform.net/web/index.html', runScripts: 'outside-only' });
  const w = dom.window;
  w.TextEncoder = TextEncoder;
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return 393; }, configurable: true });
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.fetch = (url) => { try { const buf = fs.readFileSync(path.join(ROOT, url.replace(/^.*\/web\//, '')));
    return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(buf.toString('utf8'))) }); } catch (e) { return Promise.reject(e); } };
  if (!w.crypto.subtle) Object.defineProperty(w.crypto, 'subtle', { value: require('crypto').webcrypto.subtle });
  w.localStorage.setItem('bactaq.activated', 'true');
  return w;
}
const results = [];
const check = (n, c, d) => results.push([c ? 'PASS' : 'FAIL', n, d == null ? '' : String(d)]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const w = makeDom();
  // fake engine: 50 pages
  w.eval(`window.pdfjsLib={GlobalWorkerOptions:{},getDocument:function(){return{promise:Promise.resolve({
    numPages:50,getPage:function(n){return Promise.resolve({getViewport:function(o){return{width:600*(o.scale||1),height:800*(o.scale||1)}},
      render:function(){return{promise:Promise.resolve()}},getTextContent:function(){return Promise.resolve({items:[]})}})},
    getOutline:function(){return Promise.resolve([])},getDestination:function(){return Promise.resolve(null)},
    getPageIndex:function(){return Promise.resolve(0)},destroy:function(){}})}}};`);
  w.eval(fs.readFileSync(path.join(ROOT, 'js/security.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await sleep(300);
  const $ = s => w.document.querySelector(s);
  w.document.querySelectorAll('#subjects .subject')[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(80);
  w.document.querySelector('#files .file').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(400);
  check('reader open at page 1', $('#page-input').value === '1', $('#page-input').value);

  // typing a number + Enter must jump
  const inp = $('#page-input');
  inp.value = '37';
  inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(400);
  check('Enter jumps to the typed page', inp.value === '37' && $('#reader-page').textContent.includes('37'),
        'input=' + inp.value + ' header=' + $('#reader-page').textContent);

  // change (blur) must still work
  inp.value = '12';
  inp.dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(400);
  check('change event still jumps', inp.value === '12', inp.value);

  // out-of-range values are clamped
  inp.value = '999';
  inp.dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(400);
  check('over-range clamped to last page', inp.value === '50', inp.value);
  inp.value = '0';
  inp.dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(400);
  check('under-range clamped to 1', inp.value === '1', inp.value);

  for (const r of results) console.log(r[0], '-', r[1], r[2] ? '[' + r[2] + ']' : '');
  const f = results.filter(r => r[0] === 'FAIL');
  console.log(f.length ? `\n${f.length} FAILED` : `\nALL PASSED (${results.length})`);
  process.exit(f.length ? 1 : 0);
})();
