#!/usr/bin/env bash
# Hash everything that ends up inside the druckform image.
#
# Both sides of the stale-image guard call this: run-e2e.sh stamps the hash into
# the image as a label at build time, and the E2E_SKIP_BUILD path compares that
# label against the working tree. CI builds the image itself (docker/build-push-
# action, for the shared gha cache) and passes the hash as a build arg, so the
# hash has to be computable without run-e2e.sh -- hence a separate script rather
# than a function inside it.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# A command, not a shell function: xargs execs a binary and would silently skip
# a function, leaving every fingerprint identical and the guard inert.
if command -v shasum >/dev/null 2>&1; then
  SHA_CMD="shasum -a 256"
elif command -v sha256sum >/dev/null 2>&1; then
  SHA_CMD="sha256sum"
else
  echo "ERROR: neither shasum nor sha256sum found; cannot fingerprint the image" >&2
  exit 1
fi

find packages/druckform/src packages/druckform/templates docker Dockerfile -type f 2>/dev/null \
  | LC_ALL=C sort \
  | xargs $SHA_CMD \
  | $SHA_CMD \
  | cut -d" " -f1
