# -*- coding: utf-8 -*-
"""يبني dist-standalone.html — ملف واحد فيه كل حاجة."""
import re, os, base64, glob

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'zworkplace')
root = os.path.abspath(root)

html = open(f'{root}/index.html', encoding='utf-8').read()
css  = open(f'{root}/css/app.css', encoding='utf-8').read()
icons = open(f'{root}/js/icons.js', encoding='utf-8').read()
app   = open(f'{root}/js/app.js', encoding='utf-8').read()

# الخطوط: نحوّل كل url('../fonts/x.woff2') لـdata-URI جوّه الـCSS
# كده unicode-range بيفضل زي ما هو، ومبنضمّنش خط مش مستخدم
used = set()
def embed(m):
    rel = m.group(1)
    path = os.path.join(root, 'css', rel)
    path = os.path.normpath(path)
    used.add(os.path.basename(path))
    if not os.path.exists(path):
        return m.group(0)
    b64 = base64.b64encode(open(path, 'rb').read()).decode()
    return f"url(data:font/woff2;base64,{b64}) format('woff2')"

css = re.sub(r"url\('([^']+\.woff2)'\)\s*format\('woff2'\)", embed, css)

html = re.sub(r'<link[^>]*app\.css[^>]*>', lambda _: f'<style>\n{css}\n</style>', html, count=1)
html = re.sub(r'<script src="js/icons\.js"></script>', lambda _: f'<script>\n{icons}\n</script>', html, count=1)
html = re.sub(r'<script src="js/app\.js"></script>',   lambda _: f'<script>\n{app}\n</script>', html, count=1)

out = f'{root}/dist-standalone.html'
open(out, 'w', encoding='utf-8').write(html)
print(f'✅ {os.path.getsize(out)//1024} KB')
print(f'   خطوط مضمّنة: {len(used)} → {", ".join(sorted(used))}')
for tag in ['css/app.css', 'js/app.js', 'js/icons.js', '../fonts/']:
    print(('❌ باقي: ' if tag in html else '✅ اتضمّن: '), tag)


# ═══ zip للتحديث على السيرفر ═══
import shutil, zipfile, sys
tmp = '/tmp/zipbuild'
shutil.rmtree(tmp, ignore_errors=True)
os.makedirs(tmp)
for item in ['index.html', 'css', 'js', 'fonts', 'server', 'tests', 'dist-standalone.html']:
    src = os.path.join(root, item)
    if os.path.isdir(src):
        shutil.copytree(src, os.path.join(tmp, item),
                        ignore=shutil.ignore_patterns('*.db*', '__pycache__', '*.log'))
    elif os.path.exists(src):
        shutil.copy2(src, os.path.join(tmp, item))
os.makedirs(os.path.join(tmp, 'data'), exist_ok=True)
shutil.copy2(os.path.join(root, 'data', 'students.csv'), os.path.join(tmp, 'data'))

zp = os.path.join(os.path.dirname(root), 'dist', 'zworkplace-update.zip')
os.makedirs(os.path.dirname(zp), exist_ok=True)
with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for dirpath, _, files in os.walk(tmp):
        for f in files:
            full = os.path.join(dirpath, f)
            z.write(full, os.path.relpath(full, tmp))
print(f'📦 {os.path.getsize(zp)//1024} KB → dist/zworkplace-update.zip')
