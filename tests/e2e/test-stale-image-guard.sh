#!/usr/bin/env bash
# Covers the E2E_SKIP_BUILD stale-image guard in run-e2e.sh without running the
# multi-minute suite behind it: each case builds a tiny stand-in image and only
# checks how the guard rules on it.
#
# The guard shipped comparing against a file under .staging, which meant CI --
# where the image is built in a separate step and .staging never exists -- could
# never satisfy it. Case "no fingerprint" pins the diagnosis it must give, and
# "current fingerprint" pins that a properly stamped image gets through.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

LABEL="com.druckform.source-sha"
CURRENT="$(tests/e2e/source-fingerprint.sh)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; docker rmi -f druckform-guard-test:local >/dev/null 2>&1 || true' EXIT

fake_image() { # $1 = label value, empty for none
  { echo "FROM alpine:3.20"
    [ -n "$1" ] && echo "LABEL $LABEL=\"$1\""
  } > "$TMP/Dockerfile"
  docker build -q -t druckform-guard-test:local "$TMP" >/dev/null
}

fails=0
check() { # $1 = case, $2 = expected exit, $3 = expected substring
  local out status
  set +e
  out="$(E2E_SKIP_BUILD=1 ./tests/e2e/run-e2e.sh druckform-guard-test:local 2>&1)"
  status=$?
  set -e
  if [ "$status" -ne "$2" ] || ! grep -qF "$3" <<<"$out"; then
    echo "FAIL: $1 (exit $status, wanted $2 with \"$3\")"
    echo "$out" | sed 's/^/    /'
    fails=1
  else
    echo "ok: $1"
  fi
}

fake_image ""
check "no fingerprint is reported as unknown, not as a mismatch" 1 "carries no source fingerprint"

fake_image "0000000000000000000000000000000000000000000000000000000000000000"
check "a fingerprint from other source is a mismatch" 1 "built from different source"

# The two cases below pass the guard, which sends the script on into the real
# multi-minute suite. Reaching the step after the guard is the whole assertion,
# so run it detached and kill it -- and its children -- once that line appears.
run_until_past_guard() { # $@ = env assignments
  local log="$TMP/run.log" pid waited=0
  : > "$log"
  env "$@" ./tests/e2e/run-e2e.sh druckform-guard-test:local >"$log" 2>&1 &
  pid=$!
  while [ "$waited" -lt 60 ]; do
    grep -qF "Packing the npm tarballs" "$log" && break
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
    waited=$((waited + 1))
  done
  pkill -P "$pid" 2>/dev/null || true
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  cat "$log"
}

out="$(run_until_past_guard E2E_ALLOW_STALE_IMAGE=1 E2E_SKIP_BUILD=1)"
if grep -qF "E2E_ALLOW_STALE_IMAGE=1" <<<"$out" && grep -qF "Packing the npm tarballs" <<<"$out"; then
  echo "ok: E2E_ALLOW_STALE_IMAGE warns and continues"
else
  echo "FAIL: E2E_ALLOW_STALE_IMAGE should warn and continue"
  echo "$out" | sed 's/^/    /'
  fails=1
fi

fake_image "$CURRENT"
out="$(run_until_past_guard E2E_SKIP_BUILD=1)"
if grep -qF "Packing the npm tarballs" <<<"$out" && ! grep -qF "ERROR" <<<"$out"; then
  echo "ok: an image stamped with the current fingerprint passes"
else
  echo "FAIL: current fingerprint should pass the guard"
  echo "$out" | sed 's/^/    /'
  fails=1
fi

[ "$fails" -eq 0 ] && echo "all guard cases passed"
exit "$fails"
