const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = require('path').join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
const results = [];
const check = (n, c, d) => results.push([c ? 'PASS' : 'FAIL', n, d == null ? '' : String(d)]);
const errs = [];
w.addEventListener('error', e => errs.push(e.message));

w.eval(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'));
const $ = s => w.document.querySelector(s);
const $$ = s => Array.from(w.document.querySelectorAll(s));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(150);

  // boot
  check('boot: no script errors', errs.length === 0, errs.join(' | '));
  check('boot: home is the active screen', $('#screen-home').classList.contains('active'));
  check('boot: seed students loaded', $$('#students-list .stu').length === 0); // not rendered yet
  const st = JSON.parse(w.localStorage.getItem('zwork.v1'));
  check('seed: 11 students', st.students.length === 11, st.students.length);
  check('seed: 2 homework', st.homework.length === 2, st.homework.length);

  // home numbers
  check('home: student count', $('#st-students').textContent === '11', $('#st-students').textContent);
  check('home: open homework count', $('#st-hw').textContent === '2', $('#st-hw').textContent);
  check('home: attendance shows dash before marking', $('#st-rate').textContent === '—', $('#st-rate').textContent);
  check('home: greeting has teacher name', $('#greet').textContent.includes('جاسر'), $('#greet').textContent);
  check('home: date line rendered', $('#today').textContent.length > 6, $('#today').textContent);
  check('home: recent homework cards', $$('#recent-hw .hw').length === 2, $$('#recent-hw .hw').length);

  // navigation
  const nav = async sel => { $(sel).dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await sleep(60); };
  await nav('[data-go="students"]');
  check('nav: students screen', $('#screen-students').classList.contains('active'));
  check('nav: 11 student rows', $$('#students-list .stu').length === 11, $$('#students-list .stu').length);
  check('nav: tab highlighted', $('.nav .tab[data-go="students"]').classList.contains('on'));

  // search
  $('#stu-search').value = 'أحمد';
  $('#stu-search').dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(60);
  check('search filters students', $$('#students-list .stu').length === 1, $$('#students-list .stu').length);
  $('#stu-search').value = 'zzi';
  $('#stu-search').dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(60);
  check('search: no-match empty state', !!$('#students-list .empty'));

  // add student
  $('#stu-search').value = '';
  $('#stu-search').dispatchEvent(new w.Event('input', { bubbles: true }));
  await nav('#add-student');
  check('sheet opens', $('#sheet').classList.contains('open'));
  $('#f1').value = 'طارق عبد الله';
  $('#f2').value = '01000000000';
  await nav('#sheet-save');
  check('sheet closes after save', !$('#sheet').classList.contains('open'));
  check('student added', JSON.parse(w.localStorage.getItem('zwork.v1')).students.length === 12);
  check('added student visible', $$('#students-list .stu').length === 12, $$('#students-list .stu').length);

  // validation
  await nav('#add-student');
  $('#f1').value = '';
  await nav('#sheet-save');
  check('empty name rejected (sheet stays open)', $('#sheet').classList.contains('open'));
  await nav('#sheet-cancel');
  check('cancel closes sheet', !$('#sheet').classList.contains('open'));

  // attendance
  await nav('[data-go="attendance"]');
  check('attendance: one row per student', $$('#attendance-list .att-row').length === 12, $$('#attendance-list .att-row').length);
  const firstSeg = $$('#attendance-list .att-row')[0].querySelectorAll('.seg button');
  firstSeg[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(60);
  check('attendance: mark present', $('#att-p').textContent === '1', $('#att-p').textContent);
  firstSeg[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(60);
  check('attendance: switch to late', $('#att-p').textContent === '0' && $('#att-l').textContent === '1');
  firstSeg[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(60);
  check('attendance: tap again clears', $('#att-l').textContent === '0', $('#att-l').textContent);

  await nav('#att-all');
  check('attendance: mark all present', $('#att-p').textContent === '12', $('#att-p').textContent);
  const att = JSON.parse(w.localStorage.getItem('zwork.v1')).attendance;
  const day = Object.keys(att)[0];
  check('attendance persisted', Object.keys(att[day]).length === 12, Object.keys(att[day]).length);

  // home reflects attendance
  await nav('[data-go="home"]');
  check('home: attendance percentage', $('#st-rate').textContent === '100%', $('#st-rate').textContent);

  // homework
  await nav('[data-go="homework"]');
  check('homework: 2 cards', $$('#hw-list .hw').length === 2, $$('#hw-list .hw').length);
  await nav('#new-hw');
  $('#f1').value = 'واجب المتتابعات';
  $('#f2').value = 'صفحة 92';
  await nav('#sheet-save');
  check('homework added', $$('#hw-list .hw').length === 3, $$('#hw-list .hw').length);
  check('homework persisted', JSON.parse(w.localStorage.getItem('zwork.v1')).homework.length === 3);

  // quick announcement
  await nav('[data-go="home"]');
  $('#note-text').value = 'امتحان الأحد';
  await nav('#note-send');
  await sleep(80);
  check('announcement saved', JSON.parse(w.localStorage.getItem('zwork.v1')).board[0].text === 'امتحان الأحد');
  check('announcement clears input', $('#note-text').value === '');

  // back button behaviour
  await nav('[data-go="students"]');
  check('back: returns to home', w.ZBack() === true && $('#screen-home').classList.contains('active'));
  check('back: leaves app at home', w.ZBack() === false);

  // persistence across reload
  const dom2 = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  dom2.window.localStorage.setItem('zwork.v1', w.localStorage.getItem('zwork.v1'));
  dom2.window.eval(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'));
  await sleep(150);
  check('reload: data survives', dom2.window.document.querySelector('#st-students').textContent === '12',
        dom2.window.document.querySelector('#st-students').textContent);

  for (const r of results) console.log(r[0], '-', r[1], r[2] ? '[' + r[2] + ']' : '');
  const f = results.filter(r => r[0] === 'FAIL');
  console.log(f.length ? `\n${f.length} FAILED of ${results.length}` : `\nALL PASSED (${results.length})`);
})();
