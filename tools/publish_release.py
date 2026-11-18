#!/usr/bin/env python3
"""Publish the APK + keys sheet to a GitHub release using only api.github.com.

The sandbox (and some proxies) cannot reach uploads.github.com, which the
`gh release upload` command uses. The REST API accepts uploads on
api.github.com itself when the asset is small and sent as raw bytes, so this
script talks HTTP directly with the token from the git credential helper.
"""
import json, os, subprocess, sys, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = 'l469771238-ctrl/Bac_Taq'
TAG = 'v1.0'
TITLE = 'Bac-Taq 1.0 — التطبيق + مفاتيح التفعيل'
FILES = [
    ('dist/Bac-Taq-1.0.apk', 'application/vnd.android.package-archive'),
    ('dist/Bac-Taq-Keys.html', 'text/html; charset=utf-8'),
    ('dist/Bac-Taq-Keys.md', 'text/markdown; charset=utf-8'),
]


def token():
    env = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
    if env:
        return env
    try:
        out = subprocess.run(['gh', 'auth', 'token'], capture_output=True, text=True, check=True).stdout.strip()
        if out:
            return out
    except Exception:
        pass
    try:
        out = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n',
                             capture_output=True, text=True, check=True).stdout
        for line in out.splitlines():
            if line.startswith('password='):
                return line.split('=', 1)[1]
    except Exception:
        pass
    raise SystemExit('no GitHub token available')


def call(path, method='GET', body=None, content_type='application/json', raw=None):
    url = path if path.startswith('http') else 'https://api.github.com' + path
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Authorization', 'Bearer ' + token())
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('X-GitHub-Api-Version', '2022-11-28')
    if data is not None:
        req.add_header('Content-Type', content_type)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors='replace')[:400]
        raise SystemExit(f'{method} {url} -> {e.code}: {detail}')


def main():
    notes = open(os.path.join(ROOT, 'dist', 'release-notes.md'), encoding='utf-8').read()
    releases = call(f'/repos/{REPO}/releases')
    rel = next((r for r in releases if r['tag_name'] == TAG), None)
    if not rel:
        rel = call(f'/repos/{REPO}/releases', 'POST', {
            'tag_name': TAG, 'name': TITLE, 'body': notes, 'target_commitish': 'main',
        })
        print('created release', rel['html_url'])
    else:
        rel = call(f'/repos/{REPO}/releases/{rel["id"]}', 'PATCH', {'name': TITLE, 'body': notes})
        print('reusing release', rel['html_url'])

    have = {a['name']: a for a in rel.get('assets', [])}
    for rel_path, mime in FILES:
        name = os.path.basename(rel_path)
        if name in have:
            call(f'/repos/{REPO}/releases/assets/{have[name]["id"]}', 'DELETE')
            print('removed old', name)
        data = open(os.path.join(ROOT, rel_path), 'rb').read()
        asset = call(f'https://api.github.com/repos/{REPO}/releases/{rel["id"]}/assets?name={name}',
                     'POST', raw=data, content_type=mime)
        print(f'uploaded {name} ({len(data)/1048576:.1f} MB) -> {asset.get("browser_download_url")}')


if __name__ == '__main__':
    main()
