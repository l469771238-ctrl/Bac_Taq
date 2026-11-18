
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..', 'app', 'web');
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
  for (const k in (extra || {})) w.localStorage.setItem(k, extra[k]);
  return w;
}

const results = [];
const check = (name, cond, extra) => results.push([cond ? 'PASS' : 'FAIL', name, extra == null ? '' : String(extra)]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const w = makeDom();
  w.eval(fs.readFileSync(path.join(ROOT, 'js/security.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await sleep(200);
  const $ = s => w.document.querySelector(s);
  const click = s => $(s).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  check('lock screen visible', $('#screen-lock').classList.contains('active'));
  check('device code generated', /^"[a-z0-9]{10}"$/.test(w.localStorage.getItem('bactaq.device')));
  $('#pw').value = 'wrong-code';
  click('#btn-unlock');
  await sleep(250);
  check('wrong code rejected', w.localStorage.getItem('bactaq.activated') === null);
  check('error message', $('#pin-error').textContent.includes('غلط'), $('#pin-error').textContent);

  $('#pw').value = ' 3mk_gasser_2026 ';
  click('#btn-unlock');
  await sleep(400);
  check('master password accepted (underscore form)', !$('#welcome-card').classList.contains('hidden'));
  check('activation persisted', w.localStorage.getItem('bactaq.activated') === 'true');
  click('#btn-start');
  await sleep(80);
  check('home after start', $('#screen-home').classList.contains('active'));
  check('4 subject cards', w.document.querySelectorAll('#subjects .subject').length === 4);
  check('hero pages from meta', $('#hero-pages').textContent.trim() === '415', $('#hero-pages').textContent);

  w.document.querySelectorAll('#subjects .subject')[3].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(80);
  check('library opens for programming', $('#lib-title').textContent.includes('برمجة'), $('#lib-title').textContent);
  check('pages chip', $('#chip-pages').textContent.includes('72'), $('#chip-pages').textContent);
  click('#files .file');
  await sleep(120);
  check('reader opened', $('#screen-reader').classList.contains('active'));
  check('graceful message without engine', $('#reader-loading span').textContent.length > 0, $('#reader-loading span').textContent);
  check('back reader -> home', w.BacTaqBack() === true);
  await sleep(60);
  check('home after back', $('#screen-home').classList.contains('active'));

  click('[data-nav="about"]');
  await sleep(60);
  check('about screen', $('#screen-about').classList.contains('active'));
  check('device id shown', $('#device-id').textContent.length > 6, $('#device-id').textContent);

  const { execSync } = require('child_process');
  const token = execSync('python3 tools/make_keys.py 42', { cwd: path.join(__dirname, '..') }).toString().trim();
  const w2 = makeDom();
  w2.eval(fs.readFileSync(path.join(ROOT, 'js/security.js'), 'utf8'));
  w2.eval(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'));
  w2.document.dispatchEvent(new w2.Event('DOMContentLoaded'));
  await sleep(200);
  w2.document.querySelector('#invite').value = token;
  w2.document.querySelector('#btn-invite').dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
  for (let i = 0; i < 30; i++) { await sleep(100); if (/true/.test(String(w2.localStorage.getItem('bactaq.activated')))) break; }
  check('device key accepted', /true/.test(String(w2.localStorage.getItem('bactaq.activated'))));
  check('slot stored', w2.localStorage.getItem('bactaq.slot') === '42', w2.localStorage.getItem('bactaq.slot'));

  const w3 = makeDom();
  w3.eval(fs.readFileSync(path.join(ROOT, 'js/security.js'), 'utf8'));
  w3.eval(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'));
  w3.document.dispatchEvent(new w3.Event('DOMContentLoaded'));
  await sleep(200);
  w3.document.querySelector('#invite').value = 'abcd-efg-hij';
  w3.document.querySelector('#btn-invite').dispatchEvent(new w3.MouseEvent('click', { bubbles: true }));
  await sleep(250);
  check('fake device key rejected', w3.localStorage.getItem('bactaq.activated') === null);
  check('fake key message', w3.document.querySelector('#invite-msg').textContent.includes('مش صحيح'));

  const w4 = makeDom({ 'bactaq.activated': '"true"', 'bactaq.device': '"abcdefghjk"',
                       'bactaq.progress': JSON.stringify({ history: { page: 12, total: 131, at: 5 } }) });
  w4.eval(fs.readFileSync(path.join(ROOT, 'js/security.js'), 'utf8'));
  w4.eval(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'));
  w4.document.dispatchEvent(new w4.Event('DOMContentLoaded'));
  await sleep(200);
  check('activated boots to home', w4.document.querySelector('#screen-home').classList.contains('active'));
  check('continue card visible', w4.document.querySelector('#continue-card').hidden === false);
  check('continue shows page', w4.document.querySelector('#continue-row').textContent.includes('12'));

  for (const r of results) console.log(r[0], '-', r[1], r[2] ? '[' + r[2] + ']' : '');
  const fails = results.filter(r => r[0] === 'FAIL');
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED (' + results.length + ')');
  process.exit(fails.length ? 1 : 0);
})();
