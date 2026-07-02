# @druckform/mcp

Druckform turns Markdown into styled, print-ready PDFs by way of LaTeX, for the case where an AI agent writes the document and it needs to look properly typeset rather than like a plain Markdown export. The name is German: a *Druckform* is the printing forme, the locked-up block of type a letterpress prints from, the last thing you assemble before you pull a proof.

`@druckform/mcp` is a **[Model Context Protocol](https://modelcontextprotocol.io/) server** that hands that job to an agent. It wraps the [`@druckform/core`](https://www.npmjs.com/package/@druckform/core) engine as MCP tools, with an HTTP upload/download flow for getting files in and out of the render sandbox.

> **Status: experimental and unstable.** For rendering with Claude Code, use the plugin (skill + `druck` CLI). This server is for custom MCP integrations and is still changing.

## Do you need this package?

Usually not. For rendering with Claude Code, use the **plugin**: it adds a skill that drives the `druck` CLI (with Docker as the rendering backend) and does not use this MCP server.

```
/plugin marketplace add druckform/druckform
/plugin install druckform@druckform
```

Install `@druckform/mcp` yourself only if you're **integrating druckform into your own MCP host**, or experimenting with the MCP surface directly.

## Run the server

```bash
npm install -g @druckform/mcp @druckform/core
druckform-mcp        # starts the MCP server (stdio) + its HTTP file endpoint
```

Requires Node.js ≥ 22 and the `druck` CLI from `@druckform/core` on `PATH` (or set `DRUCK_BIN` to the binary). Rendering needs the same tools as the engine: install them locally or let `druck` relay to Docker (`DRUCK_ENGINE=auto`).

Register it with an MCP-capable agent, e.g. Claude Code:

```bash
claude mcp add druckform -- druckform-mcp
```

## How an agent renders through it

The tools mirror the engine and add a job lifecycle for file transfer:

1. **Discover**: `list_templates`, then `list_components` (read each component's `example` and params).
2. **Validate** *(optional, recommended)*: `validate_document` catches unknown components and missing params/tokens before LaTeX runs.
3. **Open a job**: `render_document` creates a job and returns an HTTP **upload URL**; upload the Markdown document plus any assets to it.
4. **Finalize and fetch**: `finalize_job` runs the render; download the resulting PDF from the job's download URL. (`refresh_job`, `list_job_files`, and `delete_job` manage the job lifecycle.)

For a quick render without the upload step there's the inline helper `render_markdown`; `preview_component` renders a single component, and `scaffold_component` / `validate_component` support authoring. See the [Extending guide → MCP workflow](https://github.com/druckform/druckform/blob/main/docs/extending-druckform.md) for the authoritative tool list and the full job flow.

## Documentation

- [Authoring guide](https://github.com/druckform/druckform/blob/main/docs/authoring.md): document format, components, styles, templates
- [Extending guide](https://github.com/druckform/druckform/blob/main/docs/extending-druckform.md): CLI, MCP, and authoring/overriding components, templates, and styles

## Related packages

- **[@druckform/core](https://www.npmjs.com/package/@druckform/core)**: the render engine and `druck` CLI this server drives.

MIT © druckform · [github.com/druckform/druckform](https://github.com/druckform/druckform)
