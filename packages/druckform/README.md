# @druckform/core

**Druckform**: from the German *Druckform*, the composed printing *forme*, the plate of set type and layout, locked and ready for the press to ink onto paper. This tool assembles that forme for you: you write Markdown, druckform composes it with a **style** (colors, fonts, spacing) and a **template** (a set of components) into LaTeX, then presses it through [Tectonic](https://tectonic-typesetting.github.io/) into a PDF.

`@druckform/core` is the render engine and its command-line interface, the `druck` binary (also aliased as `druckform`).

```
Markdown ──▶ parse ──▶ compose (style + template) ──▶ LaTeX ──▶ Tectonic ──▶ PDF
```

## Install

```bash
npm install -g @druckform/core
```

Requires Node.js ≥ 22. Rendering shells out to **Tectonic** (LaTeX) and, for diagrams, to Graphviz, a JRE (PlantUML), Chromium (Mermaid), and librsvg. You don't have to install those yourself: `druck` can relay the render into the prebuilt Docker image automatically (see [Execution engines](#execution-engines)). For a zero-install workflow, use the image directly:

```bash
docker run --rm -v "$(pwd):/work" ghcr.io/druckform/druckform:latest \
  render --template base --style /work/style.yaml --in /work/document.md --out /work/out.pdf
```

## Render a document

```bash
# 1. Discover what's available
druck templates                       # list templates
druck components --template base       # components + their syntax/params

# 2. Validate before rendering (cheap — catches unknown components, missing params/tokens)
druck lint --template report --style style.yaml --in document.md

# 3. Render to PDF
druck render --template report --style style.yaml --in document.md --out out.pdf
```

A document is Markdown with optional YAML frontmatter and `:::` component directives. `--template` is optional when the document's frontmatter declares `template:`; `--style` is optional when the template carries its own. See the [Authoring guide](https://github.com/druckform/druckform/blob/main/docs/authoring.md) for the full format and component reference.

## Rendering with an AI agent

Druckform is designed to be driven by a coding agent (e.g. Claude Code). The whole surface is discoverable and every command emits a stable JSON contract.

**Recommended: the Claude Code plugin.** It installs a skill plus a Docker-backed server, so the agent renders with no local LaTeX toolchain:

```
/plugin marketplace add druckform/druckform
/plugin install druckform@druckform
```

The agent then follows a tight loop: **discover** (`druck templates`, `druck components -t <t> --json`) → **write** the Markdown → **validate** (`druck lint --json`) → **render** (`druck render`). Because `lint` and `render` exit non-zero and report findings as JSON, the agent can fix issues and retry deterministically.

**Or drive the CLI directly.** Point the agent at the `druck` binary and pass `--json` to any command for machine-readable output:

```bash
druck components --template base --json      # component contracts to author against
druck lint --template report --in doc.md --style style.yaml --json
druck render --template report --in doc.md --style style.yaml --out out.pdf --json
```

## Execution engines

`druck render` and `druck preview-component` choose where the render actually runs:

- `--engine local`: use the tools installed on this machine.
- `--engine docker`: relay the command into a container (default `ghcr.io/druckform/druckform:<version>`, override with `DRUCK_DOCKER_IMAGE`).
- `--engine auto` *(default)*: probe for the local tools; run locally if all are present, otherwise relay to Docker. Set `DRUCK_ENGINE=local|docker|auto` to change the default without a flag.

Paths are mounted identically inside the container, so `--in`/`--out`/`--style`/`--assets` need no rewriting. All other commands (`templates`, `components`, `lint`, `doctor`, `new`) always run locally.

## Documentation

- [Authoring guide](https://github.com/druckform/druckform/blob/main/docs/authoring.md): document format, components, styles, templates
- [Extending guide](https://github.com/druckform/druckform/blob/main/docs/extending-druckform.md): the full developer surface: CLI, MCP, authoring and overriding components/templates/styles
- [Examples gallery](https://github.com/druckform/druckform/blob/main/docs/examples-gallery.md)

## Related packages

- **[@druckform/mcp](https://www.npmjs.com/package/@druckform/mcp)**: a Model Context Protocol server that exposes this engine to MCP-capable agents.

MIT © druckform · [github.com/druckform/druckform](https://github.com/druckform/druckform)
