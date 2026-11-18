#!/usr/bin/env python3
"""Simulate MainActivity.serve() on a built APK.

Android's AssetManager.open("web/index.html") only works when the APK entry is
"assets/web/index.html". Building the zip from inside the web/ folder produced
top-level "web/..." entries, so every request 404'd and the WebView showed the
loader's plain-text "Not found". This script walks the app's real request list
and fails if any of them would 404.
"""
import sys, zipfile, urllib.parse

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


def main(apk):
    names = set(zipfile.ZipFile(apk).namelist())
    bad = []
    for url in REQUESTS:
        asset = resolve(url)
        ok = asset is not None and ('assets/' + asset) in names
        print(('OK   ' if ok else '404  ') + url + ('  -> assets/' + asset if asset else ''))
        if not ok:
            bad.append(url)
    top_level = [n for n in names if n.startswith('web/')]
    if top_level:
        print('\nERROR: %d entries are at top level instead of assets/web/ '
              '(AssetManager cannot see them)' % len(top_level))
        bad.append('__layout__')
    if 'classes.dex' not in names or 'AndroidManifest.xml' not in names:
        print('ERROR: not a valid APK (missing dex/manifest)')
        bad.append('__apk__')
    print('\n%s' % ('FAILED: %d request(s) would show "Not found"' % len(bad) if bad else
                    'PASS: every request resolves to a bundled asset'))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else 'dist/Bac-Taq-1.2.apk'))
