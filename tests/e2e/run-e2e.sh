#!/usr/bin/env bash
# End-to-end test of druckform's primary path: install the CLI from npm, run
# `druck render`, let it relay into the Docker image, get a real PDF back.
#
# The existing tests/docker-smoke.sh drives the image's ENTRYPOINT directly,
# which skips the whole relay layer (src/engine/*) and never renders a PDF. This
# script covers what that one cannot:
#   - the packed tarball actually installs and puts `druck` on PATH
#   - the `files` allowlist ships the bundled templates
#   - engine=auto picks docker on a machine with no LaTeX toolchain
#   - a real render produces a real PDF, diagrams included
#   - an external DRUCKFORM_TEMPLATES_DIR survives the identity bind-mount
#
#   ./tests/e2e/run-e2e.sh                  # full run
#   ./tests/e2e/run-e2e.sh my-image:tag     # use an existing image tag
#   E2E_SKIP_BUILD=1 ./tests/e2e/run-e2e.sh # reuse an already-built image
#
# Requires Docker with --privileged available (the harness runs a nested daemon).
set -euo pipefail

IMAGE="${1:-druckform:e2e}"
HARNESS_IMAGE="${E2E_HARNESS_IMAGE:-druckform-e2e-harness:local}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
E2E_DIR="$REPO_ROOT/tests/e2e"
STAGING="$E2E_DIR/.staging"
ARTIFACTS="$STAGING/artifacts"

cd "$REPO_ROOT"

echo "=== Preparing staging dir ==="
if [ "${E2E_SKIP_BUILD:-0}" = "1" ]; then
  # Keep image.tar so an iteration run skips the multi-minute docker save.
  rm -rf "$ARTIFACTS"
else
  rm -rf "$STAGING"
fi
mkdir -p "$STAGING" "$ARTIFACTS"

if [ "${E2E_SKIP_BUILD:-0}" = "1" ]; then
  echo "=== Skipping image build (E2E_SKIP_BUILD=1), expecting $IMAGE to exist ==="
  docker image inspect "$IMAGE" >/dev/null \
    || { echo "ERROR: $IMAGE not found and build was skipped" >&2; exit 1; }
else
  echo "=== Building druckform image: $IMAGE ==="
  docker build -t "$IMAGE" .
fi

echo "=== Packing the npm tarballs ==="
pnpm -w build
# `pnpm pack` (not `npm pack`) because it honours the `files` allowlist AND
# rewrites the `workspace:*` peer range to a concrete version — npm would leave
# the literal "workspace:*" in the tarball, which `npm install -g` cannot parse.
(cd "$REPO_ROOT/packages/druckform" && pnpm pack --pack-destination "$STAGING")
(cd "$REPO_ROOT/packages/druckform-mcp" && pnpm pack --pack-destination "$STAGING")
node -p "require('./packages/druckform/package.json').version" > "$STAGING/packed-version.txt"
ls -la "$STAGING"

if [ -f "$STAGING/image.tar" ] && [ "${E2E_SKIP_BUILD:-0}" = "1" ]; then
  echo "=== Reusing existing $STAGING/image.tar ==="
else
  echo "=== Saving $IMAGE for the nested daemon ==="
  docker save "$IMAGE" -o "$STAGING/image.tar"
fi

echo "=== Building the e2e harness image ==="
docker build -t "$HARNESS_IMAGE" -f "$E2E_DIR/Dockerfile.harness" "$E2E_DIR"

echo "=== Running the e2e suite in the harness ==="
set +e
docker run --rm --privileged \
  -e "DRUCK_E2E_IMAGE=$IMAGE" \
  -v "$STAGING:/in:ro" \
  -v "$E2E_DIR/fixtures:/fixtures:ro" \
  -v "$E2E_DIR/in-container.sh:/in-container.sh:ro" \
  -v "$ARTIFACTS:/out" \
  "$HARNESS_IMAGE" \
  bash /in-container.sh
E2E_EXIT=$?
set -e

echo ""
echo "=== Artifacts in $ARTIFACTS ==="
ls -la "$ARTIFACTS" || true

if [ "$E2E_EXIT" -ne 0 ]; then
  echo ""
  echo "=== E2E FAILED (exit $E2E_EXIT) — see the artifacts above for logs/PDFs ===" >&2
  exit "$E2E_EXIT"
fi

echo ""
echo "=== E2E passed ==="
