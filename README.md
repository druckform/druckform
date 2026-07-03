# Druckform

Druckform turns Markdown into styled, print-ready PDFs by way of LaTeX. It exists for a specific situation: a document gets authored by an AI agent (usually Claude), and it needs to come out looking like a properly typeset document rather than a plain Markdown export.

The name is German. A *Druckform* is the printing forme, the locked-up block of type and images that a letterpress actually prints from. It is the last thing you assemble before you pull a proof. That is more or less the job here: take loose Markdown and assemble the finished thing you hand over.

There are two ways to use it:

- **Through Claude**, which is the common case. The Claude Code plugin adds a skill that drives the `druck` CLI, handling the whole author, lint, render loop. You describe the document, Claude writes the Markdown and renders it.
- **From the command line**, if you would rather run the render engine yourself or wire it into CI.

Under the hood it is two packages in a TypeScript monorepo, shipped as a Docker image and on npm:

- **`@druckform/core`**: the render engine and CLI (`druck` / `druckform` binaries)
- **`@druckform/mcp`**: an MCP server adapter for Claude Code (experimental, unstable for now)

## Contents

- [Using with Claude Code](#using-with-claude-code)
- [Install and run with npm](#install-and-run-with-npm)
- [Running with Docker](#running-with-docker)
- [CLI reference](#cli-reference)
- [Documentation](#documentation)
- [Development](#development)
- [Testing the CLI locally with Claude Code](#testing-the-cli-locally-with-claude-code)

## Using with Claude Code

This is the intended way to use Druckform day to day. Install the Druckform Claude Code plugin:

```
/plugin marketplace add druckform/druckform
/plugin install druckform@druckform
```

This adds the `/druckform:druckform` skill, which gives Claude the authoring workflow and shells out to the `druck` CLI to do the actual rendering. From there you can just ask Claude to produce a document and it handles the render.

There is also an `@druckform/mcp` server, but it is an experimental test for now. The skill plus CLI is the path to use.

**Requirements:** the `druck` CLI on your `PATH` (see [Install and run with npm](#install-and-run-with-npm)). The CLI uses Docker as its rendering backend automatically, so you do not need to install the LaTeX toolchain yourself.

See [docs/authoring.md](docs/authoring.md) for the document format and [the skill](claude-plugin/skills/druckform/SKILL.md) for the MCP workflow.

## Install and run with npm

To get the CLI on its own, install both packages globally:

```bash
npm install -g @druckform/core @druckform/mcp
```

That puts the `druck` (and `druckform`) binary on your `PATH`. Render a document with:

```bash
druck render --template base --style style.yaml --in document.md --out out.pdf
```

The `--template` flag is optional; it falls back to the `template:` value in the document's frontmatter. To start the MCP server for a Claude Code instance instead, run `druck mcp`.

This route requires Node.js ≥ 22. For the actual rendering, the CLI uses Docker as a backend automatically, so you do not need to install the LaTeX toolchain (Tectonic, PlantUML, Graphviz, mermaid, librsvg) yourself. If you would rather render fully locally without Docker, install those tools and see [System dependencies](#system-dependencies).

## Running with Docker

You can also call the Docker image directly, without installing the CLI. This is essentially what the CLI does for you under the hood, and it is handy for CI or one-off renders:

```bash
# Render a document
docker run --rm \
  -v "$(pwd):/work" \
  ghcr.io/druckform/druckform:latest \
  render --template base --style /work/style.yaml --in /work/document.md --out /work/out.pdf
```

Mount your working directory to `/work`. The `--template`, `--style`, `--in`, and `--out` paths should be absolute (inside the container).

**Apple Silicon (arm64):** the image is built multi-arch (linux/amd64 + linux/arm64), so it runs natively on Apple Silicon, both directly and via `druck --engine docker`. Older tags were amd64-only; if you pin one and Docker reports `no matching manifest for linux/arm64`, force emulation with `DRUCK_DOCKER_PLATFORM=linux/amd64` (when using the `druck` CLI) or `--platform linux/amd64` (with `docker run` directly). Emulated renders are slower, so prefer a multi-arch tag.

See [docs/authoring.md](docs/authoring.md) for the document format and available components.

## CLI reference

```
druck templates [--json]
druck components --template <name> [--json]
druck lint     --in <file> [--template <name>] [--style <file>] [--json]
druck doctor   --template <name> [--json]
druck render            --in <file> --out <file> [--template <name>] [--style <file>] [--json]
#   --template is optional: falls back to the document's `template:` frontmatter
druck preview-component --template <name> --name <component> --out <file> [--params <json>] [--children <text>] [--style <file>] [--watch] [--json]
druck new component     --name <name> --template <name> [--format ts|yaml] [--accepts-children]
druck new template      --name <name> [--extends <parent>]
druck mcp      # start MCP + HTTP server on stdio
```

Use `--json` to get machine-readable output on stdout.

## Documentation

- [Authoring guide](docs/authoring.md): document format, components, styles, templates
- [Extending guide](docs/extending-druckform.md): adding components, templates, themes, contributing

## Development

```bash
pnpm install
pnpm turbo build
pnpm turbo test
```

Requires pnpm ≥ 9, Node.js ≥ 22.

## Testing the CLI locally with Claude Code

This section covers the experimental MCP server, not the skill plus CLI path that the shipped plugin uses. To try your local build's MCP server against a separate Claude Code instance, instead of the published Docker image, point Claude at the freshly built CLI's MCP server.

1. **Build the packages** so the CLI binary exists:

   ```bash
   pnpm install
   pnpm turbo build
   ```

   This produces two files you'll need: `packages/druckform-mcp/dist/index.js` (the MCP + HTTP server entry point) and `packages/druckform/dist/cli.js` (the render engine). (The published Docker image runs `druck mcp`, which just spawns the globally-installed `druckform-mcp` binary. In a local checkout that binary isn't on your `PATH`, so point Claude at the built file directly.)

2. **Register the local server** in the Claude Code instance you want to test with. The MCP server shells out to the `druck` CLI, which isn't on your `PATH` in a checkout, so set `DRUCK_BIN` to the built CLI. From the directory you're testing in:

   ```bash
   claude mcp add druckform-local \
     -e DRUCK_BIN="node /ABS/PATH/druckform/packages/druckform/dist/cli.js" \
     -e DRUCKFORM_JOBS_DIR="$HOME/.druckform/jobs" \
     -- node /ABS/PATH/druckform/packages/druckform-mcp/dist/index.js
   ```

   `DRUCKFORM_JOBS_DIR` overrides the server's job working directory. It defaults to `/work/jobs`, which only exists inside the Docker container, so locally you must point it at a writable path (create it first: `mkdir -p ~/.druckform/jobs`). Use the absolute path to your checkout. Alternatively, add a `.mcp.json` to the test project:

   ```json
   {
     "mcpServers": {
       "druckform": {
         "command": "node",
         "args": ["/ABS/PATH/druckform/packages/druckform-mcp/dist/index.js"],
         "env": {
           "DRUCK_BIN": "node /ABS/PATH/druckform/packages/druckform/dist/cli.js",
           "DRUCKFORM_JOBS_DIR": "/ABS/PATH/home/.druckform/jobs"
         }
       }
     }
   }
   ```

3. **Symlink the skill** so Claude gets the authoring workflow alongside the MCP tools (otherwise only the raw tools are available). Claude Code discovers skills under `.claude/skills/`, so link the skill directory into the test project (or `~/.claude/skills/` to make it available everywhere):

   ```bash
   # project-level (just this test project)
   mkdir -p .claude/skills
   ln -s /ABS/PATH/druckform/claude-plugin/skills/druckform .claude/skills/druckform

   # or, for user-level (all projects)
   mkdir -p ~/.claude/skills
   ln -s /ABS/PATH/druckform/claude-plugin/skills/druckform ~/.claude/skills/druckform
   ```

   A symlink means edits to `SKILL.md` in your checkout show up immediately, with no copy to keep in sync.

4. **Start Claude Code** in that project and confirm the `druckform` MCP tools are listed (`/mcp`) and the skill is picked up (`/druckform` or `/help`). Ask it to render a document; the tool calls now hit your local build instead of `ghcr.io/druckform/druckform`.

Rebuild (`pnpm turbo build`) and restart the MCP server after code changes.

> Tip: to exercise the CLI directly without Claude, call the built binary, e.g. `node packages/druckform/dist/cli.js templates --json` or `... render --template base --style style.yaml --in document.md --out out.pdf`.

**Troubleshooting `Failed to reconnect … -32000`:** the server crashed on startup. The two common causes:

- **Port already in use.** By default (`DRUCKFORM_HTTP_PORT=0`) the server binds an OS-assigned ephemeral port on launch, so concurrent instances don't clash and `EADDRINUSE` should not occur. If you pin a fixed port via `DRUCKFORM_HTTP_PORT` and another instance already holds it, startup fails with `EADDRINUSE`. Free the port or choose another (and use `DRUCKFORM_HTTP_BIND` to change the bind host). With `claude mcp add`, pass it via `-e DRUCKFORM_HTTP_PORT=7332`.
- **Wrong entry point.** Make sure you registered `packages/druckform-mcp/dist/index.js`, not `cli.js mcp`: the latter needs `druckform-mcp` on your `PATH`.

To see the actual error, run the entry point by hand: `node packages/druckform-mcp/dist/index.js`. It logs the listening URL or the crash.

**Troubleshooting `druck … failed: spawnSync druck ENOENT`:** the MCP server couldn't find the `druck` CLI. Either set `DRUCK_BIN` as shown in step 2, or put `druck` on your `PATH` by symlinking the built binary (it has a shebang and is executable):

```bash
ln -sf /ABS/PATH/druckform/packages/druckform/dist/cli.js ~/.local/bin/druck
```

**Troubleshooting `ENOENT … mkdir '/work/jobs/...'`:** the server is using its container default job directory. Set `DRUCKFORM_JOBS_DIR` to a writable local path (`mkdir -p ~/.druckform/jobs` first), as shown in step 2.

> **The MCP server only reads its env/PATH when it launches.** After changing the config (`DRUCK_BIN`, port) or the PATH, you must reconnect the server: open `/mcp` and reconnect, or restart the Claude session. Retrying a failed tool call reuses the same already-running server and will keep failing. Note that a Claude instance started from the macOS GUI app may not inherit your shell `PATH` (so `~/.local/bin` won't be visible). Launch `claude` from a terminal, or rely on the absolute `DRUCK_BIN`.

### System dependencies

Rendering shells out to external tools, so a local (non-Docker) setup needs these on your `PATH`:

| Tool                      | Used for                    | Binary           |
| ------------------------- | --------------------------- | ---------------- |
| Node.js ≥ 22, pnpm ≥ 9    | build & run                 | `node`, `pnpm`   |
| Tectonic                  | LaTeX to PDF                | `tectonic`       |
| JRE (Java) + PlantUML jar | PlantUML diagrams           | `java`           |
| Graphviz                  | PlantUML layout             | `dot`            |
| mermaid-cli               | Mermaid diagrams            | `mmdc`           |
| librsvg                   | SVG to PDF conversion       | `rsvg-convert`   |
| curl, zip                 | upload the document bundle  | `curl`, `zip`    |

On macOS with Homebrew:

```bash
brew install tectonic graphviz librsvg openjdk node pnpm
npm install -g @mermaid-js/mermaid-cli   # provides mmdc (downloads Chromium)
# PlantUML: download the jar, then point druckform at it
brew install plantuml   # or grab plantuml.jar manually
export PLANTUML_JAR="$(brew --prefix)/opt/plantuml/libexec/plantuml.jar"
```

`PLANTUML_JAR` defaults to `/usr/local/lib/plantuml.jar`; set it to wherever your jar lives. `curl` and `zip` ship with macOS. mermaid-cli needs Chromium: if `mmdc` can't find one, set `PUPPETEER_EXECUTABLE_PATH` to a Chromium/Chrome binary.

If installing all of this locally is impractical, use the Docker image instead. It bundles every dependency.

### Tectonic cache

The renderer runs Tectonic with network access, so on the first render Tectonic downloads the LaTeX format, packages, and Latin Modern fonts into its cache (`~/Library/Caches/Tectonic` on macOS, `~/.cache/Tectonic` on Linux). The first render is therefore slower; subsequent renders reuse the cache. The Docker image pre-warms this cache at build time so the network is only needed if a document pulls in a package the image didn't cache.

If you need fully offline / hermetic rendering, pre-warm the cache once by compiling a representative document, then run Tectonic with `--only-cached`. (The renderer no longer passes `--only-cached` itself.)

### Fonts

The bundled example style requests `Liberation Serif` / `Liberation Mono`, which the Docker image installs but a local machine usually lacks. `fontspec` then fails with *"The font … cannot be found."* Either install them (`brew install --cask font-liberation`, plus Noto) or use a style with **no `fonts` block**, which falls back to Latin Modern (bundled with Tectonic).

### Docker smoke test

To verify the published image builds and the CLI contracts hold, run the smoke test (requires Docker):

```bash
./tests/docker-smoke.sh                 # builds druckform:local and exercises the CLI
./tests/docker-smoke.sh my-image:tag    # use a custom image tag
```
