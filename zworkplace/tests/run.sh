#!/usr/bin/env bash
# كل اختبارات Z-Project Workplace: السيرفر ثم الواجهة
set -u
cd "$(dirname "$0")/.."
fail=0
echo "=== API ==="
node tests/api.test.js 2>&1 | grep -vE "ExperimentalWarning|trace-warnings" | grep -E "FAIL|PASSED|FAILED" || fail=1
echo "=== UI ==="
node tests/ui.test.js 2>&1 | grep -vE "ExperimentalWarning|trace-warnings" | grep -E "FAIL|PASSED|FAILED" || fail=1
echo "=== seed ==="
node server/seed.js 300 --reset 2>&1 | grep -vE "ExperimentalWarning|trace-warnings"
exit $fail
