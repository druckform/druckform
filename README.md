# Druckform

Convert AI-authored Markdown into styled PDFs via LaTeX. Two packages in a TypeScript monorepo, distributed as a Docker image and on npm.

- **`druckform`** — render engine CLI (`druck` / `druckform` binaries)
- **`druckform-mcp`** — MCP server adapter for Claude Code

## Quick start (Docker)

```bash
# Render a document
docker run --rm \
  -v "$(pwd):/work" \
  ghcr.io/YOUR_GH_USERNAME/druckform:latest \
  render --template base --style /work/style.yaml --in /work/document.md --out /work/out.pdf
```

Mount your working directory to `/work`. The `--template`, `--style`, `--in`, and `--out` paths should be absolute (inside the container).

See [docs/authoring.md](docs/authoring.md) for the document format and available components.

## Using with Claude Code

Install the druckform Claude Code plugin:

```
/plugin marketplace add YOUR_GH_USERNAME/druckform
/plugin install druckform@druckform
```

This auto-configures the druckform MCP server (via Docker) and adds the `/druckform:druckform` skill.

**Requirements:** Docker must be running. curl and zip must be available in your session PATH.

See [docs/authoring.md](docs/authoring.md) for the document format and [the skill](claude-plugin/skills/druckform/SKILL.md) for the MCP workflow.

## CLI reference

```
druck templates [--json]
druck components --template <name> [--json]
druck lint     --template <name> --in <file> [--style <file>] [--json]
druck render   --template <name> --style <file> --in <file> --out <file> [--json]
druck mcp      # start MCP + HTTP server on stdio
```

Use `--json` to get machine-readable output on stdout.

## npm install

```bash
npm install -g druckform druckform-mcp
```

Requires Node.js ≥ 22 and system dependencies: Tectonic (LaTeX), JRE (PlantUML), Graphviz, Chromium (mermaid), and librsvg2.

Use the Docker image unless you need to run in a CI environment that already provides these tools.

## Documentation

- [Authoring guide](docs/authoring.md) — document format, components, styles, templates
- [Extending guide](docs/extending.md) — adding components, templates, themes; contributing

## Development

```bash
pnpm install
pnpm turbo build
pnpm turbo test
```

Requires pnpm ≥ 9, Node.js ≥ 22.
