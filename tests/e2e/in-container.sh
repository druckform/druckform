#!/usr/bin/env bash
# Runs INSIDE the e2e harness (see Dockerfile.harness). Installs the packed CLI
# from npm, then drives it exactly the way a user does — no --engine flag, no
# local toolchain — and asserts on the PDFs that come back out of the container.
#
# Inputs (mounted read-only by run-e2e.sh):
#   /in/*.tgz        packed @druckform/core + @druckform/mcp tarballs
#   /in/image.tar    `docker save` of the druckform image under test
#   /fixtures        tests/e2e/fixtures
# Output:
#   /out             PDFs + captured logs, copied back to the host
set -euo pipefail

IMAGE="${DRUCK_E2E_IMAGE:-druckform:e2e}"
WORK=/work/e2e
OUT=/out
# Deliberately OUTSIDE $WORK. collectMountDirs mounts the cwd plus the parents of
# --in/--out/--style plus the assets and templates dirs; anything already under
# the cwd is covered by the cwd mount alone, so keeping these inside $WORK would
# make the templates-dir and --out mounts untestable — dropping them from
# collectMountDirs would not fail a single assertion.
TEMPLATES_OUTSIDE=/opt/druckform-templates
OUT_OUTSIDE=/opt/druckform-out

banner() { printf '\n=== %s ===\n' "$*"; }
fail() { printf '\nFAIL: %s\n' "$*" >&2; exit 1; }

# --- assertion helpers -------------------------------------------------------

# assert_contains <label> <file> <needle...>
assert_contains() {
  local label="$1" file="$2"; shift 2
  local needle
  for needle in "$@"; do
    grep -qF -- "$needle" "$file" || fail "$label: expected to find '$needle' in $file"
  done
  echo "  ok  $label contains: $*"
}

# assert_absent <label> <file> <needle...>
assert_absent() {
  local label="$1" file="$2"; shift 2
  local needle
  for needle in "$@"; do
    ! grep -qF -- "$needle" "$file" || fail "$label: '$needle' must NOT appear in $file"
  done
  echo "  ok  $label free of: $*"
}

# assert_json <label> <file> <node expression returning truthy>
assert_json() {
  local label="$1" file="$2" expr="$3"
  node -e "
    const fs = require('node:fs');
    const d = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    if (!($expr)) {
      console.error('contract was: ' + JSON.stringify(d, null, 2));
      process.exit(1);
    }
  " "$file" || fail "$label: JSON assertion failed ($expr)"
  echo "  ok  $label: $expr"
}

# assert_pdf <pdf> <min-pages> -- <required text...> -- <forbidden text...>
assert_pdf() {
  local pdf="$1" minPages="$2"; shift 2
  [ -f "$pdf" ] || fail "$(basename "$pdf"): no PDF produced"
  [ "$(head -c 5 "$pdf")" = "%PDF-" ] || fail "$(basename "$pdf"): missing %PDF- magic"

  local pages
  pages="$(pdfinfo "$pdf" | awk '/^Pages:/ {print $2}')"
  [ -n "$pages" ] || fail "$(basename "$pdf"): pdfinfo reported no page count"
  [ "$pages" -ge "$minPages" ] || fail "$(basename "$pdf"): $pages page(s), expected >= $minPages"
  echo "  ok  $(basename "$pdf"): valid PDF, $pages page(s)"

  # Paper size is a silent failure mode: the bundled templates emitted US Letter
  # for a long time because nothing set geometry and article defaults to
  # letterpaper. Nobody notices until it reaches a printer.
  local papersize
  papersize="$(pdfinfo "$pdf" | awk -F'[()]' '/^Page size:/ {print $2}')"
  [ "$papersize" = "A4" ] || fail "$(basename "$pdf"): page size is '$papersize', expected A4"
  echo "  ok  $(basename "$pdf"): A4"

  local txt="$OUT/$(basename "${pdf%.pdf}").txt"
  pdftotext "$pdf" "$txt"

  local mode=required
  local arg
  for arg in "$@"; do
    if [ "$arg" = "--" ]; then mode=forbidden; continue; fi
    if [ "$mode" = required ]; then
      assert_contains "$(basename "$pdf") text" "$txt" "$arg"
    else
      assert_absent "$(basename "$pdf") text" "$txt" "$arg"
    fi
  done
}

# Assertions every rendered PDF must satisfy, whatever the template.
# DRUCKFORMDIAGRAM is the diagram-fence placeholder from latex/composer.ts — if
# it reaches the PDF, the placeholder substitution regressed (this has shipped
# broken once already). ':::' or '\begin{' in the text layer means a directive
# or component silently failed to render.
UNIVERSAL_FORBIDDEN=(DRUCKFORMDIAGRAM ":::" "\\begin{" "??")

mkdir -p "$OUT"

# --- 1. install phase --------------------------------------------------------

banner "Harness: Node and Docker are present, render toolchain is NOT"
node -e 'const [maj] = process.versions.node.split(".").map(Number);
  if (maj < 22) { console.error("node " + process.versions.node + " < 22"); process.exit(1); }
  console.log("  ok  node " + process.versions.node);'
docker version --format '  ok  docker {{.Server.Version}} (nested daemon)'
for tool in tectonic mmdc java rsvg-convert; do
  if command -v "$tool" >/dev/null 2>&1; then
    fail "$tool is installed in the harness — that defeats the auto-detection test"
  fi
  echo "  ok  $tool absent (as intended)"
done

banner "Load the druckform image under test"
# Printed because "no space left on device" here is the most likely infrastructure
# failure: the nested daemon needs room for the whole image, and a vfs fallback
# needs several times that.
df -h /var/lib/docker | tail -1
docker load -i /in/image.tar
docker image inspect "$IMAGE" >/dev/null || fail "$IMAGE not present after docker load"
echo "  ok  $IMAGE loaded"

# The image is the only supported render backend, so it must carry every tool the
# renderer shells out to. Asserted directly rather than inferred from a failed
# render: `mmdc` was missing from the image for a while and it surfaced as an
# exit-127 "docker not found" from inside the container, which named nothing.
banner "The image carries the whole render toolchain"
for tool in tectonic rsvg-convert mmdc java dot; do
  docker run --rm --entrypoint sh "$IMAGE" -c "command -v $tool >/dev/null" \
    || fail "$IMAGE is missing '$tool' — renders that need it cannot work anywhere"
  echo "  ok  image has $tool"
done

banner "Install the CLI from the packed npm tarballs"
npm install -g --no-fund --no-audit /in/druckform-core-*.tgz /in/druckform-mcp-*.tgz
command -v druck >/dev/null || fail "druck is not on PATH after npm install -g"
command -v druckform >/dev/null || fail "druckform is not on PATH after npm install -g"
command -v druckform-mcp >/dev/null || fail "druckform-mcp is not on PATH after npm install -g"
echo "  ok  druck -> $(command -v druck)"

PACKED_VERSION="$(node -e "
  const fs=require('node:fs'), p='/in/packed-version.txt';
  process.stdout.write(fs.readFileSync(p,'utf8').trim());
")"
CLI_VERSION="$(druck --version)"
[ "$CLI_VERSION" = "$PACKED_VERSION" ] \
  || fail "druck --version is '$CLI_VERSION', expected '$PACKED_VERSION'"
echo "  ok  druck --version = $CLI_VERSION"

# The bundled templates only reach a user through the `files` allowlist in
# packages/druckform/package.json. If `templates` ever falls out of that list,
# this is where it surfaces — not in someone's terminal.
banner "Bundled templates survived the npm pack -> install round-trip"
druck templates --json > "$OUT/templates.json"
assert_json "templates contract" "$OUT/templates.json" "d.schemaVersion === '1'"
assert_json "bundled templates" "$OUT/templates.json" \
  "['base','report','examples'].every(n => d.templates.some(t => t.name === n && t.origin === 'bundled'))"
druck components --template report --json > "$OUT/components-report.json"
assert_json "report components" "$OUT/components-report.json" \
  "d.components.some(c => c.name === 'infobox') && d.components.some(c => c.name === 'callout')"

# --- 2. set up the render workspace -----------------------------------------

# Copied (not bind-mounted) so the render workdir is a plain directory in the
# harness filesystem — the same situation a user's project directory is in.
banner "Stage the fixture corpus into $WORK"
mkdir -p "$WORK/out" "$TEMPLATES_OUTSIDE" "$OUT_OUTSIDE"
cp -r /fixtures/. "$WORK/"
# Relocate the custom templates outside the project dir — the realistic layout
# (templates in ~/.druckform/templates, work in a project dir) and the only one
# that actually exercises the templates-dir mount.
cp -r /fixtures/templates/. "$TEMPLATES_OUTSIDE/"
rm -rf "$WORK/templates"
cd "$WORK"
echo "  ok  staged $(find "$WORK" "$TEMPLATES_OUTSIDE" -type f | wc -l) files"
echo "  ok  templates relocated to $TEMPLATES_OUTSIDE (outside the cwd)"

# defaultImage() resolves to ghcr.io/druckform/druckform:<installed version>,
# which does not exist for an unreleased version — point the relay at the image
# we just loaded instead.
export DRUCK_DOCKER_IMAGE="$IMAGE"

# --- 3. engine resolution ----------------------------------------------------

banner "engine=auto resolves to docker (no toolchain installed)"
druck render --template report --in document.md --style style.yaml \
  --assets assets --out "$WORK/out/auto.pdf" --json \
  > "$OUT/render-auto.json" 2> "$OUT/render-auto.stderr" \
  || { cat "$OUT/render-auto.stderr" >&2; cat "$OUT/render-auto.json" >&2; fail "auto-engine render failed"; }
assert_contains "auto probe report" "$OUT/render-auto.stderr" \
  "engine=auto → docker" "tectonic" "mmdc" "java" "rsvg-convert"
assert_json "auto render contract" "$OUT/render-auto.json" \
  "d.schemaVersion === '1' && d.status === 'ok' && d.pdf === '$WORK/out/auto.pdf'"

banner "engine=local fails with actionable guidance"
set +e
druck render --engine local --template report --in document.md --style style.yaml \
  --assets assets --out "$WORK/out/never.pdf" --json \
  > "$OUT/render-local.json" 2> "$OUT/render-local.stderr"
LOCAL_EXIT=$?
set -e
[ "$LOCAL_EXIT" -ne 0 ] || fail "--engine local unexpectedly succeeded without a toolchain"
cat "$OUT/render-local.json" "$OUT/render-local.stderr" > "$OUT/render-local.all"
assert_contains "local engine error" "$OUT/render-local.all" "not found" "DRUCK_ENGINE=docker"
echo "  ok  --engine local exited $LOCAL_EXIT"

banner "docker missing from PATH exits 127 with actionable guidance"
# PATH must contain ONLY the stub dir: docker lives in /usr/bin alongside node,
# so keeping /usr/bin on PATH would leave docker findable and defeat the test.
STUB_BIN="$(mktemp -d)"
for bin in node npm druck which; do
  ln -s "$(command -v "$bin")" "$STUB_BIN/$bin"
done
command -v docker >/dev/null && [ ! -e "$STUB_BIN/docker" ] \
  || fail "stub PATH setup is wrong — docker must be absent from $STUB_BIN"
set +e
env -i PATH="$STUB_BIN" HOME="$HOME" \
    DRUCK_ENGINE=docker DRUCK_DOCKER_IMAGE="$IMAGE" \
    "$STUB_BIN/druck" render --template report --in document.md --style style.yaml \
      --assets assets --out "$WORK/out/never.pdf" \
  > "$OUT/render-nodocker.log" 2>&1
NODOCKER_EXIT=$?
set -e
[ "$NODOCKER_EXIT" -eq 127 ] \
  || { cat "$OUT/render-nodocker.log" >&2; fail "expected exit 127 without docker, got $NODOCKER_EXIT"; }
assert_contains "missing docker message" "$OUT/render-nodocker.log" \
  "'docker' not found" "DRUCK_ENGINE=local"

# --- 4. render: bundled template --------------------------------------------

banner "Render a bundled template (--engine docker) end to end"
druck render --engine docker --template report --in document.md --style style.yaml \
  --assets assets --out "$WORK/out/report.pdf" --json \
  > "$OUT/render-report.json" 2> "$OUT/render-report.stderr" \
  || { cat "$OUT/render-report.stderr" >&2; cat "$OUT/render-report.json" >&2; fail "report render failed"; }
assert_json "report render contract" "$OUT/render-report.json" \
  "d.schemaVersion === '1' && d.status === 'ok'"
cp "$WORK/out/report.pdf" "$OUT/report.pdf"
assert_pdf "$OUT/report.pdf" 1 \
  "E2E Bundled Template Report" \
  "Key Finding" "Inner Box" "Heads Up" \
  "plain & code block" \
  "RawLatexMarker" \
  "10:30" "localhost:8080" \
  "A note" "A warning" "A danger" "A tip" \
  "Acme GmbH" "Analytical Engine" "DRAFT" "A framed box" \
  -- "${UNIVERSAL_FORBIDDEN[@]}"

# Diagram labels are real glyphs in the output, not raster: mermaid.ts forces
# htmlLabels:false so Mermaid emits SVG <text>, and both renderers go
# SVG -> rsvg-convert -f pdf. If the labels are missing, the diagram rendered as
# an empty box — which is what the htmlLabels regression looked like.
banner "Both diagram engines produced text-bearing graphics"
assert_contains "mermaid labels" "$OUT/report.txt" "Start" "Decision" "Accept" "Reject"
assert_contains "plantuml labels" "$OUT/report.txt" "Alice" "Bob" "Hello"

banner "The image renders with no network access"
# The prewarm doc must cache every package a bundled render pulls, or documents
# fail outright in an offline or sandboxed environment.
# --engine local (rather than the default auto): we're already running the
# image's own toolchain directly, and --network none rules out a docker relay
# anyway. This also keeps engine-probe chatter off stdout, since --json's
# output must stay pure JSON for assert_json to parse.
docker run --rm --network none \
  -v "$WORK:$WORK" -w "$WORK" "$IMAGE" \
  render --engine local --template report --in document.md --style style.yaml \
  --assets assets --out "$WORK/out/offline.pdf" --json \
  > "$OUT/render-offline.json" 2>&1 \
  || { cat "$OUT/render-offline.json" >&2; fail "offline render failed — prewarm cache incomplete"; }
assert_json "offline render contract" "$OUT/render-offline.json" \
  "d.status === 'ok'"

# --- 5. render: custom template through DRUCKFORM_TEMPLATES_DIR --------------

# The template only reaches the container because collectMountDirs adds the
# templates dir to the identity mounts and buildDockerArgs re-emits
# DRUCKFORM_TEMPLATES_DIR pointing at the same absolute path.
banner "Custom template is discovered through DRUCKFORM_TEMPLATES_DIR"
export DRUCKFORM_TEMPLATES_DIR="$TEMPLATES_OUTSIDE"
druck templates --json > "$OUT/templates-user.json"
assert_json "user template discovered" "$OUT/templates-user.json" \
  "d.templates.some(t => t.name === 'acme' && t.origin === 'user' && t.extends === 'report')"
druck components --template acme --json > "$OUT/components-acme.json"
assert_json "auto-discovered components" "$OUT/components-acme.json" \
  "['acme-panel','acme-stamp','acme-badge','acme-logo'].every(n => d.components.some(c => c.name === n))"
assert_json "tombstoned component is gone" "$OUT/components-acme.json" \
  "!d.components.some(c => c.name === 'callout')"

banner "druck doctor validates the custom template"
druck doctor --template acme --json > "$OUT/doctor-acme.json"
assert_json "doctor clean" "$OUT/doctor-acme.json" "d.ok === true && d.findings.length === 0"

banner "Render the custom template through the relay"
# --out points outside the cwd too, so this render depends on both the
# templates-dir mount and the --out parent mount.
druck render --template acme --in custom-document.md --style style.yaml \
  --assets assets --out "$OUT_OUTSIDE/acme.pdf" --json \
  > "$OUT/render-acme.json" 2> "$OUT/render-acme.stderr" \
  || { cat "$OUT/render-acme.stderr" >&2; cat "$OUT/render-acme.json" >&2; fail "acme render failed"; }
assert_json "acme render contract" "$OUT/render-acme.json" \
  "d.schemaVersion === '1' && d.status === 'ok'"
cp "$OUT_OUTSIDE/acme.pdf" "$OUT/acme.pdf"
assert_pdf "$OUT/acme.pdf" 1 \
  "Acme Custom Template Report" \
  "Acme Internal" \
  "ACMEBADGE" "ACMESTAMP" "ACMEPANEL" "ACMELOGO" "ACMETABLE" "ACMEHR" \
  "Inherited Infobox" \
  "RawLatexMarker" \
  "10:30" "localhost:8080" \
  -- "${UNIVERSAL_FORBIDDEN[@]}"

banner "Consulting family renders, and generates its findings index"
druck render --template consulting --in consulting-document.md --style style.yaml \
  --assets assets --out "$WORK/out/consulting.pdf" --json \
  > "$OUT/render-consulting.json" 2> "$OUT/render-consulting.stderr" \
  || { cat "$OUT/render-consulting.stderr" >&2; cat "$OUT/render-consulting.json" >&2; \
       fail "consulting render failed"; }
assert_json "consulting render contract" "$OUT/render-consulting.json" \
  "d.schemaVersion === '1' && d.status === 'ok'"
cp "$WORK/out/consulting.pdf" "$OUT/consulting.pdf"
# Everything below except the index check is genuinely unambiguous evidence for
# its own component (Impact/Evidence/Recommendation only appear inside a
# finding body; Methodology only inside the appendix; Executive Summary is the
# exec-summary heading) -- whole-document pdftotext is fine for these.
assert_pdf "$OUT/consulting.pdf" 2 \
  "Executive Summary" "Impact" "Evidence" "Recommendation" \
  "Methodology" \
  -- "${UNIVERSAL_FORBIDDEN[@]}"

# The id/severity/title strings above are NOT safe evidence for the *index*:
# finding.ts prints its own id, severity label and title in the finding's own
# header line, so if \@starttoc silently read the wrong aux extension, or
# \addcontentsline entries were dropped, the index would render as a bare
# "Findings Summary" heading with nothing under it -- and a whole-document
# assertion would still pass, because the finding bodies on page 2 supply
# every one of those strings anyway. Scope this check to page 1, where the
# fixture's ::pagebreak places the generated index and nothing else, so the
# assertion can only pass if \listoffindings actually populated it.
INDEX_TXT="$OUT/consulting-index.txt"
pdftotext -f 1 -l 1 "$OUT/consulting.pdf" "$INDEX_TXT"
assert_contains "consulting.pdf index (page 1)" "$INDEX_TXT" \
  "Findings Summary" \
  "F_01" "F-02" \
  "High" "Medium" \
  "Secrets recoverable from CI logs" "No dependency pinning"

# And the "??" check in UNIVERSAL_FORBIDDEN above only proves the
# :ref[F_01]{kind=finding} cross-reference did not dangle -- not that it
# resolved to the right thing. A \ref that silently resolved to a page number
# instead of the finding's id would pass every check above while still being
# wrong (this exact mistake happened earlier in this template's development).
assert_contains "consulting.pdf text" "$OUT/consulting.txt" \
  "Remediation for F_01 is tracked separately"

# --- 6. failure paths survive the relay -------------------------------------

banner "Invalid document is rejected through the relay"
unset DRUCKFORM_TEMPLATES_DIR
set +e
druck render --template base --in invalid-document.md --style style.yaml \
  --assets assets --out "$WORK/out/invalid.pdf" --json \
  > "$OUT/render-invalid.json" 2> "$OUT/render-invalid.stderr"
INVALID_EXIT=$?
set -e
[ "$INVALID_EXIT" -ne 0 ] || fail "invalid document unexpectedly rendered"
assert_json "invalid render contract" "$OUT/render-invalid.json" \
  "d.status === 'error' && d.pdf === null && d.error.findings.length > 0"
[ ! -f "$WORK/out/invalid.pdf" ] || fail "a PDF was written for a document that failed to render"
echo "  ok  exited $INVALID_EXIT with findings and no PDF"

banner "Lint through the relay path agrees with render"
druck lint --template base --in invalid-document.md --style style.yaml --json \
  > "$OUT/lint-invalid.json" || true
assert_json "lint rejects" "$OUT/lint-invalid.json" "d.ok === false && d.findings.length > 0"
export DRUCKFORM_TEMPLATES_DIR="$TEMPLATES_OUTSIDE"
druck lint --in custom-document.md --style style.yaml --json > "$OUT/lint-acme.json"
assert_json "lint accepts the custom template document" "$OUT/lint-acme.json" \
  "d.ok === true && d.findings.length === 0"

banner "All e2e checks passed"
