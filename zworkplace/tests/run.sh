#!/usr/bin/env bash
# كل اختبارات Z-Project Workplace: السيرفر ثم الواجهة ثم قارئ Excel ثم كشف تجريبي
set -u
cd "$(dirname "$0")/.."
fail=0
for t in api ui xlsx; do
  echo "=== ${t} ==="
  out=$(node tests/${t}.test.js 2>&1 | grep -vE "ExperimentalWarning|trace-warnings")
  echo "$out" | grep -E "FAIL|PASSED|FAILED" || { echo "$out" | tail -5; fail=1; }
  echo "$out" | grep -q "ALL PASSED" || fail=1
done
echo "=== seed ==="
ZDB=/tmp/zseed-$$.db node server/seed.js 300 --reset 2>&1 | grep -vE "ExperimentalWarning|trace-warnings"
exit $fail
