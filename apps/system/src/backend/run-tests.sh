#!/usr/bin/env sh
# Compile the backend client and its node:test suite to a temp dir and run them.
# Usage (from anywhere): sh apps/system/src/backend/run-tests.sh
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$(mktemp -d "${TMPDIR:-/tmp}/heavyrain-backend-client.XXXXXX")
trap 'rm -rf "$OUT"' EXIT
sed "s#\${TMPDIR_OUT}#$OUT#" "$HERE/tsconfig.test.json" > "$HERE/.tsconfig.test.resolved.json"
trap 'rm -rf "$OUT" "$HERE/.tsconfig.test.resolved.json"' EXIT
(cd "$HERE/../.." && npx tsc -p "$HERE/.tsconfig.test.resolved.json")
printf '{"type":"module"}\n' > "$OUT/package.json"
node --test "$OUT/apps/system/src/backend/client.test.js"
if [ "${1:-}" = "--live" ]; then
  node "$OUT/apps/system/src/backend/live-smoke.js"
fi
