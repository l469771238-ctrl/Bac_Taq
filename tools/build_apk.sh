#!/usr/bin/env bash
# Build Bac-Taq.apk entirely offline with the SDK tools checked into buildtools/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BT="$ROOT/buildtools"
JAVA="${JAVA:-/tmp/probe/jdk17/jdk4py/java-runtime/bin/java}"
JAVAC_JAR="${JAVAC_JAR:-/tmp/probe/tools/package/tools.jar}"
APP="$ROOT/app/android"
WEB="$ROOT/app/web"
OUT="$ROOT/dist"
WORK="${WORK:-/tmp/build}"

version="${1:-1.0}"
version_code="${2:-1}"

echo "==> clean"
rm -rf "$WORK"
mkdir -p "$WORK/compiled" "$WORK/gen" "$WORK/dex" "$WORK/assets" "$OUT"

echo "==> stage web assets"
cp -r "$WEB" "$WORK/assets/web"
rm -f "$WORK/assets/web/img/icon-1024.png" "$WORK/assets/web/img/logo@2x.png"

echo "==> compile resources"
"$BT/aapt2" compile --dir "$APP/res" -o "$WORK/compiled/res.zip"

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
cd "$WORK/assets"
zip -q -r "$WORK/base.apk" web

echo "==> compile java"
mkdir -p "$WORK/classes"
find "$APP/src" "$WORK/gen" -name '*.java' > "$WORK/sources.txt"
"$JAVA" -cp "$JAVAC_JAR" com.sun.tools.javac.Main \
  -source 8 -target 8 -nowarn -g -encoding UTF-8 \
  -bootclasspath "$BT/android.jar" \
  -classpath "$BT/android.jar" \
  -d "$WORK/classes" @"$WORK/sources.txt" 2>&1 | tail -20
ls "$WORK/classes/com/bactaq/app" 2>/dev/null || { echo "javac failed"; exit 1; }

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
KS="$ROOT/keystore/bactaq.jks"
"$JAVA" -jar "$BT/lib/apksigner.jar" sign \
  --ks "$KS" --ks-pass pass:bactaq2026 --key-pass pass:bactaq2026 \
  --ks-key-alias bactaq --min-sdk-version 23 \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$OUT/Bac-Taq-$version.apk" "$WORK/aligned.apk"

"$JAVA" -jar "$BT/lib/apksigner.jar" verify --min-sdk-version 23 "$OUT/Bac-Taq-$version.apk"
ls -la "$OUT"
