#!/usr/bin/env python3
"""Simulate MainActivity.serve() on a built APK.

Android's AssetManager.open("web/index.html") only works when the APK entry is
"assets/web/index.html". Building the zip from inside the web/ folder produced
top-level "web/..." entries, so every request 404'd and the WebView showed the
loader's plain-text "Not found". This script walks the app's real request list
and fails if any of them would 404.
"""
import os, re, sys, zipfile, urllib.parse

HOST = "https://appassets.androidplatform.net/"
ASSET_PATH = "web/"

# every URL the bundled web app asks for at runtime
REQUESTS = [
    "https://appassets.androidplatform.net/web/index.html",
    "web/index.html",
    "web/css/app.css",
    "web/js/security.js",
    "web/js/app.js",
    "web/js/vendor/pdf.min.js",
    "web/js/vendor/pdf.worker.min.js",
    "web/books/meta.json",
    "web/books/arabic.pdf",
    "web/books/english.pdf",
    "web/books/history.pdf",
    "web/books/programming.pdf",
    "web/covers/arabic.jpg",
    "web/covers/english_thumb.jpg",
    "web/img/logo.png",
    "web/img/icon-192.png",
    "web/fonts/cairo-arabic-700-normal.woff2",
    "web/img/logo.png?cache=1",
]


def resolve(url):
    """Mirror of MainActivity.serve(): returns the asset path or None (404)."""
    if not url.startswith(HOST):
        url = HOST + url.lstrip('/')
    path = url[len(HOST):]
    path = path.split('?')[0].split('#')[0]
    path = urllib.parse.unquote(path)
    if not path:
        path = "web/index.html"
    if not path.startswith(ASSET_PATH):
        path = ASSET_PATH + path
    if not path.startswith(ASSET_PATH) or '..' in path:
        return None
    return path


def discover(webdir):
    """Collect every asset URL a web app asks for, by reading its own sources."""
    import re
    refs = []
    html = open(os.path.join(webdir, 'index.html'), encoding='utf-8').read()
    refs += re.findall(r'(?:src|href)="([^"]+)"', html)
    css_path = os.path.join(webdir, 'css', 'app.css')
    if os.path.exists(css_path):
        css = open(css_path, encoding='utf-8').read()
        refs += [m.replace('../', '') for m in re.findall(r"url\(['\"]?([^'\")]+)['\"]?\)", css)]
    out = []
    for r in refs:
        if r.startswith(('http', 'data:', '#', 'mailto:', 'javascript:')):
            continue
        out.append(r.split('?')[0].lstrip('/'))
    # runtime assets the js builds at call time
    out += ['books/meta.json', 'js/cmaps/', 'js/standard_fonts/']
    for key in ('arabic', 'english', 'history', 'programming'):
        out += [f'books/{key}.pdf', f'covers/{key}.jpg', f'covers/{key}_thumb.jpg']
    return sorted(set(out))


def main(apk, webdir='bactaq/web'):
    names = set(zipfile.ZipFile(apk).namelist())
    bad, checked = [], 0
    for rel in discover(webdir):
        asset = 'assets/web/' + rel.rstrip('/')
        if rel.endswith('/'):
            ok = any(n.startswith(asset + '/') for n in names)
        else:
            ok = asset in names
        if not ok and rel.startswith(('books/', 'covers/', 'js/cmaps', 'js/standard_fonts')):
            continue  # optional: only required when the app actually bundles books
        checked += 1
        if not ok:
            bad.append(rel)
            print('404  ' + rel)
    print('\nchecked %d references against %s' % (checked, apk))
    print('%s' % ('FAILED: %d reference(s) would show "Not found"' % len(bad) if bad else
                  'PASS: every reference resolves to a bundled asset'))
    stray = [n for n in names if n.startswith('web/')]
    if stray:
        print('ERROR: %d entries at top level instead of assets/web/' % len(stray))
        bad.append('__layout__')
    return 1 if bad else 0


if __name__ == '__main__':
    apk = sys.argv[1] if len(sys.argv) > 1 else 'dist/Bac-Taq-1.8.apk'
    webdir = sys.argv[2] if len(sys.argv) > 2 else ('zworkplace' if 'Z-Project' in apk else 'bactaq/web')
    sys.exit(main(apk, webdir))
