#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-druckform:local}"

echo "=== Building image: $IMAGE ==="
docker build -t "$IMAGE" .

echo ""
echo "=== Smoke test: druck --version ==="
docker run --rm "$IMAGE" --version

echo ""
echo "=== Smoke test: druck templates --json ==="
docker run --rm "$IMAGE" templates --json | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['schemaVersion']=='1'; print('OK - templates contract valid')"

echo ""
echo "=== Smoke test: druck components --template base --json ==="
docker run --rm "$IMAGE" components --template base --json | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['schemaVersion']=='1'; print('OK - components contract valid')"

echo ""
echo "=== Smoke test: druck lint (valid fixture) ==="
docker run --rm \
  -v "$(pwd)/packages/druckform/tests/fixtures:/fixtures:ro" \
  "$IMAGE" lint \
    --template base \
    --in /fixtures/documents/valid.md \
    --json | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['ok']==True; print('OK - lint passed')"

echo ""
echo "=== All smoke tests passed ==="
