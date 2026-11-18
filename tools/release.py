#!/usr/bin/env python3
"""Build Bac-Taq.apk locally, then attach it (plus the device-keys sheet) to a
GitHub release so there is a permanent public download link.

Usage:
    python3 tools/release.py            # build + publish
    python3 tools/release.py --no-build # publish the current dist/ apk
"""
import json, os, re, subprocess, sys, hashlib, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION = '1.0'
TAG = f'v{VERSION}'
APK = os.path.join(ROOT, 'dist', f'Bac-Taq-{VERSION}.apk')
KEYS_MD = os.path.join(ROOT, 'dist', 'Bac-Taq-Keys.md')
KEYS_HTML = os.path.join(ROOT, 'dist', 'Bac-Taq-Keys.html')


def sh(cmd, **kw):
    print('+', ' '.join(cmd) if isinstance(cmd, list) else cmd, flush=True)
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def build():
    sh(['bash', os.path.join(ROOT, 'tools', 'build_apk.sh'), VERSION, '1'])


def keys_sheet(out_md, out_html):
    sys.path.insert(0, os.path.join(ROOT, 'tools'))
    from make_keys import token, pretty
    rows = [dict(slot=i, key=pretty(i), raw=token(i)) for i in range(1, 33)]
    md = ['# Bac-Taq — مفاتيح الأجهزة (Device keys)', '',
          'كل كود بيشتغل على جهاز واحد. اكتبه في شاشة التفعيل، أو من «عن التطبيق ← دخول بكود جهاز».', '',
          '| # | الكود | ملاحظات |', '|---|---|---|']
    for r in rows:
        md.append(f"| {r['slot']} | `{r['key']}` | |")
    md += ['', f'_تم الإنشاء: {datetime.date.today().isoformat()} · استخدم `python3 tools/make_keys.py <slot>` لإنتاج كود جديد._']
    open(out_md, 'w', encoding='utf-8').write('\n'.join(md))

    trs = ''.join(
        f"<tr><td>{r['slot']}</td><td><code dir='ltr'>{r['key']}</code></td><td></td></tr>"
        for r in rows)
    html = f"""<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bac-Taq — مفاتيح الأجهزة</title>
<style>
body{{font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;background:#f4f6fb;color:#0d1b33;margin:0;padding:22px}}
.wrap{{max-width:720px;margin:0 auto}}
h1{{font-size:22px;margin:0 0 6px;color:#0a2452}}
p.lead{{color:#4a5a75;font-size:14px;margin:0 0 18px;line-height:1.8}}
.card{{background:#fff;border-radius:18px;box-shadow:0 10px 26px rgba(13,27,51,.08);overflow:hidden}}
table{{width:100%;border-collapse:collapse;font-size:15px}}
th{{background:#0e2f6b;color:#fff;padding:12px;font-size:13px;text-align:start}}
td{{padding:11px 12px;border-bottom:1px solid #eef1f8}}
tr:nth-child(even) td{{background:#fafbfe}}
code{{font-family:ui-monospace,Menlo,monospace;font-size:16px;font-weight:700;letter-spacing:1px;color:#0e2f6b;background:#eef3ff;padding:4px 8px;border-radius:8px}}
.note{{margin-top:16px;font-size:12.5px;color:#8794ab;line-height:1.8}}
.badge{{display:inline-block;background:#fff4dd;color:#a76900;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;margin-inline-start:8px}}
@media print{{body{{background:#fff}} .card{{box-shadow:none;border:1px solid #e6ebf5}} th{{background:#0e2f6b !important;-webkit-print-color-adjust:exact}}}}
</style></head><body><div class="wrap">
<h1>Bac-Taq — مفاتيح الأجهزة <span class="badge">32 كود</span></h1>
<p class="lead">كل كود بيتفعّل على جهاز واحد بس. لو حبيت تعمل نسخة تانية لصاحبك، ابعتله الكود اللي بعده.</p>
<div class="card"><table><thead><tr><th>#</th><th>الكود</th><th>مستخدم عند</th></tr></thead><tbody>{trs}</tbody></table></div>
<p class="note">الكود بيتم توليده محليًا من <b>tools/make_keys.py</b> — نفس الملف اللي بيستخدمه التطبيق للتحقق، بدون إنترنت.<br>
الماستر باسورد (ليك انت فقط) موجود في <b>tools/OWNER.md</b>.</p>
</div></body></html>"""
    open(out_html, 'w', encoding='utf-8').write(html)
    print('wrote', out_md, 'and', out_html)


def publish():
    body = f"""## Bac-Taq {VERSION}

تطبيق مجاني بيجمع كتب الثانوية العامة الأربعة (عربي، إنجليزي، تاريخ، برمجة) في مكان واحد،
وبيفتح الكتب **بدون إنترنت** بشكل مجاني.

### التنزيل
- **`Bac-Taq-{VERSION}.apk`** → ده التطبيق. نزّله على الموبايل وثبّته.
- **`Bac-Taq-Keys.pdf`** / **`Bac-Taq-Keys.md`** → أكواد تفعيل الأجهزة (كل كود لجهاز واحد).

### طريقة التثبيت
1. نزّل الـ APK.
2. افتح الملف من «التنزيلات» واسمح بـ «تثبيت من مصادر غير معروفة» لو طلب منك.
3. اكتب كود التفعيل اللي معاك، وهيفتح على طول في كل مرة بعد كده.

### معلومات تقنية
- الحجم: {round(os.path.getsize(APK)/1048576, 1)} م.ب · أندرويد 6.0+ (API 23–34)
- شغّال أوفلاين بالكامل: الكتب جوّا التطبيق، **مفيش صلاحية إنترنت** مطلوبة أصلاً.
- SHA-256: `{hashlib.sha256(open(APK,'rb').read()).hexdigest()}`
"""
    open(os.path.join(ROOT, 'dist', 'release-notes.md'), 'w', encoding='utf-8').write(body)
    existing = subprocess.run(['gh', 'release', 'view', TAG], capture_output=True, text=True)
    assets = [APK,
              KEYS_HTML,
              KEYS_MD]
    if existing.returncode == 0:
        print('release exists, uploading assets')
        sh(['gh', 'release', 'upload', TAG] + assets + ['--clobber'])
    else:
        sh(['gh', 'release', 'create', TAG] + assets +
           ['--title', f'Bac-Taq {VERSION} — التطبيق + مفاتيح التفعيل',
            '--notes-file', os.path.join(ROOT, 'dist', 'release-notes.md'),
            '--latest'])
    print(sh(['gh', 'release', 'view', TAG, '--json', 'url,assets']).stdout)


if __name__ == '__main__':
    if '--no-build' not in sys.argv:
        build()
    keys_sheet(KEYS_MD, KEYS_HTML)
    publish()
