# @druckform/mcp

**Druckform** — from the German *Druckform*, the composed printing *forme*: the plate of set type and layout, locked and ready for the press to ink onto paper. Druckform turns AI-authored Markdown into typeset PDFs — you write Markdown, it composes your content with a **style** and a **template** into LaTeX and presses it through [Tectonic](https://tectonic-typesetting.github.io/) into a polished PDF.

`@druckform/mcp` is the **[Model Context Protocol](https://modelcontextprotocol.io/) server** that lets AI agents render documents through druckform. It wraps the [`@druckform/core`](https://www.npmjs.com/package/@druckform/core) engine as MCP tools, with an HTTP upload/download flow for moving files in and out of the render sandbox.

## Do you need this package?

Usually not directly. The easiest way for an agent to render with druckform is the **Claude Code plugin**, which wires up a Docker-backed MCP server (no local LaTeX toolchain, no manual setup):

```
/plugin marketplace add druckform/druckform
/plugin install druckform@druckform
```

Install `@druckform/mcp` yourself when you're **integrating druckform into your own MCP host / agent**, or running the server outside Docker.

## Run the server

```bash
npm install -g @druckform/mcp @druckform/core
druckform-mcp        # starts the MCP server (stdio) + its HTTP file endpoint
```

Requires Node.js ≥ 22 and the `druck` CLI from `@druckform/core` on `PATH` (or set `DRUCK_BIN` to the binary). Rendering needs the same tools as the engine — install them locally or let `druck` relay to Docker (`DRUCK_ENGINE=auto`).

Register it with an MCP-capable agent, e.g. Claude Code:

```bash
claude mcp add druckform -- druckform-mcp
```

## How an agent renders through it

The tools mirror the engine and add a job lifecycle for file transfer:

1. **Discover** — `list_templates`, then `list_components` (read each component's `example` and params).
2. **Validate** *(optional, recommended)* — `validate_document` catches unknown components and missing params/tokens before LaTeX runs.
3. **Open a job** — `render_document` creates a job and returns an HTTP **upload URL**; upload the Markdown document plus any assets to it.
4. **Finalize & fetch** — `finalize_job` runs the render; download the resulting PDF from the job's download URL. (`refresh_job`, `list_job_files`, and `delete_job` manage the job lifecycle.)

For a quick render without the upload step there's the inline helper `render_markdown`; `preview_component` renders a single component, and `scaffold_component` / `validate_component` support authoring. See the [Extending guide → MCP workflow](https://github.com/druckform/druckform/blob/main/docs/extending-druckform.md) for the authoritative tool list and the full job flow.

## Documentation

- [Authoring guide](https://github.com/druckform/druckform/blob/main/docs/authoring.md) — document format, components, styles, templates
- [Extending guide](https://github.com/druckform/druckform/blob/main/docs/extending-druckform.md) — CLI, MCP, and authoring/overriding components, templates, and styles

## Related packages

- **[@druckform/core](https://www.npmjs.com/package/@druckform/core)** — the render engine and `druck` CLI this server drives.

MIT © druckform · [github.com/druckform/druckform](https://github.com/druckform/druckform)
