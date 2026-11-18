#!/usr/bin/env python3
"""Build Bac-Taq.apk locally, then attach it to a GitHub release so it has a
permanent public download link.

The app is protected by ONE shared password, asked on the first launch only —
there are no per-device keys and nothing to mint.

Usage:
    python3 tools/release.py            # build + publish
    python3 tools/release.py --no-build # publish the current dist/ apk
"""
import json, os, re, subprocess, sys, hashlib, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION = '1.5'
TAG = f'v{VERSION}'
APK = os.path.join(ROOT, 'dist', f'Bac-Taq-{VERSION}.apk')


def sh(cmd, **kw):
    print('+', ' '.join(cmd) if isinstance(cmd, list) else cmd, flush=True)
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def build():
    sh(['bash', os.path.join(ROOT, 'tools', 'build_apk.sh'), VERSION, '1'])


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
3. اكتب كلمة السر أول مرة بس، وهيفتح على طول في كل مرة بعد كده.

### معلومات تقنية
- الحجم: {round(os.path.getsize(APK)/1048576, 1)} م.ب · أندرويد 6.0+ (API 23–34)
- شغّال أوفلاين بالكامل: الكتب جوّا التطبيق، **مفيش صلاحية إنترنت** مطلوبة أصلاً.
- SHA-256: `{hashlib.sha256(open(APK,'rb').read()).hexdigest()}`
"""
    open(os.path.join(ROOT, 'dist', 'release-notes.md'), 'w', encoding='utf-8').write(body)
    existing = subprocess.run(['gh', 'release', 'view', TAG], capture_output=True, text=True)
    assets = [APK]
    if existing.returncode == 0:
        print('release exists, uploading assets')
        sh(['gh', 'release', 'upload', TAG] + assets + ['--clobber'])
    else:
        sh(['gh', 'release', 'create', TAG] + assets +
           ['--title', f'Bac-Taq {VERSION} — التطبيق',
            '--notes-file', os.path.join(ROOT, 'dist', 'release-notes.md'),
            '--latest'])
    print(sh(['gh', 'release', 'view', TAG, '--json', 'url,assets']).stdout)


if __name__ == '__main__':
    if '--no-build' not in sys.argv:
        build()
    publish()
