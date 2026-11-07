#!/usr/bin/env bash
# The gate. Every change must pass this before it is called done.
# Usage: bash tools/check.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "1/5 Tests"
if [ -d node_modules ]; then
  npm test --silent
else
  echo "   (node_modules missing: run npm install for the full suite; running trust tests only)"
  node --test trust.test.mjs
fi

echo "2/5 Sign, verify and tamper round trip"
vector="$(node tools/make_test_vector.mjs)"
key="$(node -e 'console.log(JSON.parse(process.argv[1]).publicKeySPKI)' "$vector")"
token="$(node -e 'console.log(JSON.parse(process.argv[1]).token)' "$vector")"
tampered="$(node -e 'console.log(JSON.parse(process.argv[1]).tampered)' "$vector")"
node tools/verify_token.mjs "$key" "$token" > /dev/null
if node tools/verify_token.mjs "$key" "$tampered" > /dev/null; then
  echo "FAIL: a tampered token verified"; exit 1
fi

echo "3/5 JavaScript syntax"
for file in app.js *.mjs; do node --check "$file"; done

echo "4/5 .env is not tracked"
if git ls-files --error-unmatch .env > /dev/null 2>&1; then
  echo "FAIL: .env is committed. Remove it with: git rm --cached .env"; exit 1
fi

echo "5/5 No secrets in tracked files"
if git ls-files 2>/dev/null | grep -v '^tools/check.sh$' | xargs -r grep -nE '(AIza[0-9A-Za-z_-]{30,}|sk_live_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{20,}|BEGIN (EC|RSA|OPENSSH) PRIVATE KEY)' ; then
  echo "FAIL: possible secret in a tracked file"; exit 1
fi

echo "All checks passed. (iOS tests run separately in Xcode: Product > Test, or Cmd-U.)"
