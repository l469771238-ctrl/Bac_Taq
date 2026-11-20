'use strict';
/**
 * نقطة الدخول الموحّدة.
 *
 * المشكلة اللي بتحصل: استضافات زي Pterodactyl / Waifly بتشغّل `index.js`
 * اللي في جذر السيرفر، وبتدوّر عليه في مكان معيّن. لو الملفات في مجلد فرعي،
 * السيرفر بيقع بـ"Cannot find module".
 *
 * الملف ده بيلاقي السيرفر الحقيقي مهما كان مكانه، ويشغّله.
 * يعني مهما اترفعت الملفات في أي مجلد، التشغيل هيشتغل.
 */
const path = require('node:path');
const fs = require('node:fs');

const CANDIDATES = [
  './server/index.js',
  './zworkplace/server/index.js',
  '../zworkplace/server/index.js',
  '../../../zworkplace/server/index.js',
];

function find() {
  for (const c of CANDIDATES) {
    const p = path.resolve(__dirname, c);
    if (fs.existsSync(p)) return p;
  }
  // بحث احتياطي: دور في أي مكان تحت الجذر
  const roots = [__dirname, path.dirname(__dirname), '/home/container'];
  for (const r of roots) {
    const hit = scan(r, 0);
    if (hit) return hit;
  }
  return null;
}

function scan(dir, depth) {
  if (depth > 4) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return null;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const candidate = path.join(dir, e.name, 'server', 'index.js');
    if (fs.existsSync(candidate)) return candidate;
    const deeper = scan(path.join(dir, e.name), depth + 1);
    if (deeper) return deeper;
  }
  return null;
}

const target = find();

if (!target) {
  console.error('');
  console.error('❌ مش لاقي ملفات السيرفر.');
  console.error('   ارفع مجلد zworkplace كامل جوه /home/container');
  console.error('   الحالي:', __dirname);
  console.error('');
  try {
    console.error('المجلدات الموجودة:');
    for (const e of fs.readdirSync(__dirname, { withFileTypes: true })) {
      console.error('  ', e.isDirectory() ? '[مجلد]' : '[ملف]', e.name);
    }
  } catch (err) {}
  process.exit(1);
}

console.log('▶️  التشغيل من:', target);
require(target);
