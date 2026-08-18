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
# E2E_SKIP_BUILD refuses to run if the image was built from different source
# than the working tree, because the render relays into the image and would
# silently test the old code. Set E2E_ALLOW_STALE_IMAGE=1 to override.
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

# Fingerprint everything that ends up inside the image. E2E_SKIP_BUILD reuses a
# previously built image, and if that image predates the code under test the
# suite tests the old code and fails in ways that look like product bugs: a run
# during the consulting work reported `Template not found: 'consulting'` from a
# correctly-working relay, and cost a quarter of an hour to diagnose. Comparing
# this against the hash stamped into the image at build time turns that into an
# instant error. The hash lives on the image as a label rather than in a file
# under .staging, because CI builds the image in a separate step (for the shared
# buildx cache) and then runs with E2E_SKIP_BUILD=1 -- a file this script never
# wrote, in a directory a fresh checkout does not have.
SOURCE_SHA_LABEL="com.druckform.source-sha"

image_fingerprint() {
  local sha
  sha="$(docker image inspect "$1" \
    --format "{{index .Config.Labels \"$SOURCE_SHA_LABEL\"}}" 2>/dev/null || true)"
  # A Go template prints "<no value>" for a missing key on a nil label map.
  [ "$sha" = "<no value>" ] && sha=""
  printf '%s' "$sha"
}

echo "=== Preparing staging dir ==="
if [ "${E2E_SKIP_BUILD:-0}" = "1" ]; then
  # Keep image.tar so an iteration run skips the multi-minute docker save.
  rm -rf "$ARTIFACTS"
else
  rm -rf "$STAGING"
fi
mkdir -p "$STAGING" "$ARTIFACTS"

CURRENT_FINGERPRINT="$("$E2E_DIR/source-fingerprint.sh")"

if [ "${E2E_SKIP_BUILD:-0}" = "1" ]; then
  echo "=== Skipping image build (E2E_SKIP_BUILD=1), expecting $IMAGE to exist ==="
  docker image inspect "$IMAGE" >/dev/null \
    || { echo "ERROR: $IMAGE not found and build was skipped" >&2; exit 1; }

  BUILT_FINGERPRINT="$(image_fingerprint "$IMAGE")"
  if [ "$BUILT_FINGERPRINT" != "$CURRENT_FINGERPRINT" ]; then
    if [ "${E2E_ALLOW_STALE_IMAGE:-0}" = "1" ]; then
      echo "WARNING: cannot confirm $IMAGE matches the current source; continuing" >&2
      echo "         because E2E_ALLOW_STALE_IMAGE=1. Failures may be from an old image." >&2
    else
      {
        if [ -z "$BUILT_FINGERPRINT" ]; then
          echo "ERROR: $IMAGE carries no source fingerprint, so this script cannot tell"
          echo "       whether it matches the working tree."
          echo
          echo "       Images built by this script or by the e2e workflow are stamped with"
          echo "       one; a plain \`docker build\` is not. Rebuild with:"
          echo
          echo "         docker build --build-arg DRUCKFORM_SOURCE_SHA=\"\$(tests/e2e/source-fingerprint.sh)\" \\"
          echo "           -t $IMAGE ."
        else
          echo "ERROR: $IMAGE was built from different source than the working tree."
          echo "       built: $BUILT_FINGERPRINT"
          echo "       now:   $CURRENT_FINGERPRINT"
        fi
        echo
        echo "The render relays into the image, so the CLI *inside* the container"
        echo "would run the old code -- typically surfacing as a missing template"
        echo "or component rather than as a stale-image error."
        echo
        echo "Re-run without E2E_SKIP_BUILD=1, or set E2E_ALLOW_STALE_IMAGE=1 if"
        echo "you are deliberately testing the older image."
      } >&2
      exit 1
    fi
  fi
else
  echo "=== Building druckform image: $IMAGE ==="
  docker build --build-arg "DRUCKFORM_SOURCE_SHA=$CURRENT_FINGERPRINT" -t "$IMAGE" .
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

# The nested daemon loads image.tar, not the local image, so reusing the tar
# across runs is only safe while it still holds the image the guard above
# approved. Keyed on the image ID, which changes on every rebuild and exists
# even for an image built without a source fingerprint.
TAR_IMAGE_ID_FILE="$STAGING/image-tar.id"
IMAGE_ID="$(docker image inspect "$IMAGE" --format "{{.Id}}")"
if [ -f "$STAGING/image.tar" ] && [ "${E2E_SKIP_BUILD:-0}" = "1" ] \
  && [ "$(cat "$TAR_IMAGE_ID_FILE" 2>/dev/null || true)" = "$IMAGE_ID" ]; then
  echo "=== Reusing existing $STAGING/image.tar ==="
else
  echo "=== Saving $IMAGE for the nested daemon ==="
  docker save "$IMAGE" -o "$STAGING/image.tar"
  echo "$IMAGE_ID" > "$TAR_IMAGE_ID_FILE"
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
