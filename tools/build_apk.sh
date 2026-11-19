#!/usr/bin/env bash
# Build an Android APK entirely offline with the SDK tools checked into tools/ci.
#
#   bash tools/build_apk.sh <version> <versionCode> [app]
#   app: bactaq (default) | zworkplace
#
# Output: dist/<apk-name>-<version>.apk
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BT="$ROOT/tools/ci"
JAVA="${JAVA:-/tmp/probe/jdk17/jdk4py/java-runtime/bin/java}"
JAVAC_JAR="${JAVAC_JAR:-/tmp/probe/tools/package/tools.jar}"

version="${1:-1.0}"
version_code="${2:-1}"
app="${3:-bactaq}"

case "$app" in
  bactaq)
    APP="$ROOT/bactaq/android"; WEB="$ROOT/bactaq/web"; APK_NAME="Bac-Taq"; KS_ALIAS="bactaq"
    NEED_PDF=1 ;;
  zworkplace)
    APP="$ROOT/zworkplace/android"; WEB="$ROOT/zworkplace"; APK_NAME="Z-Project"; KS_ALIAS="zwork"
    NEED_PDF=0 ;;
  *) echo "unknown app: $app (use bactaq|zworkplace)"; exit 2 ;;
esac

OUT="$ROOT/dist"
WORK="${WORK:-/tmp/build-$app}"

echo "==> building $APK_NAME $version ($version_code) from $app"
rm -rf "$WORK"
mkdir -p "$WORK/compiled" "$WORK/gen" "$WORK/dex" "$WORK/assets" "$OUT"

# optional: point the app at a different class server (defaults to strings.xml)
if [ -n "${ZAPI_BASE:-}" ] && [ "$app" = "zworkplace" ]; then
  echo "==> API base: $ZAPI_BASE"
  STAMP_DIR="$WORK/res"
  cp -r "$APP/res" "$STAMP_DIR"
  python3 - "$STAMP_DIR/values/strings.xml" "$ZAPI_BASE" <<'PYAPI'
import sys, re
p, base = sys.argv[1], sys.argv[2].rstrip('/')
s = open(p, encoding='utf-8').read()
s = re.sub(r'(<string name="zapi_base"[^>]*>)[^<]*(</string>)', lambda m: m.group(1) + base + m.group(2), s)
open(p, 'w', encoding='utf-8').write(s)
print('zapi_base ->', base)
PYAPI
  APP_RES="$STAMP_DIR"
else
  APP_RES="$APP/res"
fi

echo "==> stage web assets"
mkdir -p "$WORK/assets/web"
cp -r "$WEB"/. "$WORK/assets/web"/
# never ship dev-only files inside the apk
rm -rf "$WORK/assets/web/tests" "$WORK/assets/web/node_modules" "$WORK/assets/web/package.json" \
       "$WORK/assets/web/README.md" "$WORK/assets/web/.gitignore" "$WORK/assets/web/img/icon-1024.png" \
       "$WORK/assets/web/img/logo@2x.png" \
       "$WORK/assets/web/server" "$WORK/assets/web/data" "$WORK/assets/web/samples" "$WORK/assets/web/data-import" \
       "$WORK/assets/web/.env"

echo "==> compile resources"
"$BT/aapt2" compile --dir "${APP_RES:-$APP/res}" -o "$WORK/compiled/res.zip"

echo "==> link resources + manifest"
"$BT/aapt2" link \
  -o "$WORK/base.apk" \
  -I "$BT/android.jar" \
  --manifest "$APP/AndroidManifest.xml" \
  --java "$WORK/gen" \
  --min-sdk-version 23 --target-sdk-version 34 \
  --version-code "$version_code" --version-name "$version" \
  --auto-add-overlay \
  "$WORK/compiled/res.zip"

echo "==> add assets to apk"
# AssetManager resolves "web/index.html" only when the entry is "assets/web/index.html",
# so the zip MUST be built from a folder that already contains assets/.
cd "$WORK"
zip -q -r "$WORK/base.apk" assets

echo "==> compile java"
mkdir -p "$WORK/classes"
find "$APP/src" "$WORK/gen" -name '*.java' > "$WORK/sources.txt"
"$JAVA" -cp "$JAVAC_JAR" com.sun.tools.javac.Main \
  -source 8 -target 8 -nowarn -g -encoding UTF-8 \
  -bootclasspath "$BT/android.jar" \
  -classpath "$BT/android.jar" \
  -d "$WORK/classes" @"$WORK/sources.txt" 2>&1 | tail -20
find "$WORK/classes" -name '*.class' | grep -q . || { echo "javac failed"; exit 1; }

echo "==> dex"
rm -rf "$WORK/dex"; mkdir -p "$WORK/dex"
"$JAVA" -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 \
  --min-api 23 --release --lib "$BT/android.jar" \
  --output "$WORK/dex" $(find "$WORK/classes" -name '*.class')

echo "==> add dex"
cd "$WORK/dex"
zip -q "$WORK/base.apk" classes.dex

echo "==> zipalign"
python3 "$ROOT/tools/zipalign.py" "$WORK/base.apk" "$WORK/aligned.apk"

echo "==> sign"
if [ "$app" = "zworkplace" ]; then KS="$ROOT/keystore/zwork.jks"; else KS="$ROOT/keystore/bactaq.jks"; fi
"$JAVA" -jar "$BT/lib/apksigner.jar" sign \
  --ks "$KS" --ks-pass pass:bactaq2026 --key-pass pass:bactaq2026 \
  --ks-key-alias "$KS_ALIAS" --min-sdk-version 23 \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$OUT/$APK_NAME-$version.apk" "$WORK/aligned.apk"

"$JAVA" -jar "$BT/lib/apksigner.jar" verify --min-sdk-version 23 "$OUT/$APK_NAME-$version.apk"

echo "==> verify packaging"
APP="$app" NEED_PDF="$NEED_PDF" python3 - "$OUT/$APK_NAME-$version.apk" <<'PYCHK'
import os, sys, zipfile
apk = sys.argv[1]
names = zipfile.ZipFile(apk).namelist()
need = ['assets/web/index.html', 'assets/web/js/app.js',
        'classes.dex', 'resources.arsc', 'AndroidManifest.xml']
if os.environ.get('NEED_PDF') == '1':
    need += ['assets/web/css/app.css', 'assets/web/js/security.js',
             'assets/web/books/meta.json', 'assets/web/books/arabic.pdf',
             'assets/web/books/english.pdf', 'assets/web/books/history.pdf',
             'assets/web/books/programming.pdf']
missing = [n for n in need if n not in names]
stray = [n for n in names if n.startswith('web/')]
junk = [n for n in names if n.startswith(('assets/web/tests', 'assets/web/node_modules',
                                            'assets/web/server', 'assets/web/data',
                                            'assets/web/samples'))]
if missing or stray or junk:
    print('PACKAGING ERROR')
    for n in missing: print('  missing:', n)
    for n in stray[:5]: print('  misplaced:', n)
    for n in junk[:5]: print('  dev junk shipped:', n)
    sys.exit(1)
print('packaging OK —', len(names), 'entries, web app under assets/web/')
PYCHK
ls -la "$OUT/$APK_NAME-$version.apk"
