# Authoring Guide

This guide covers everything you need to write and style druckform documents.

## Document format

A druckform document is a standard Markdown file (`.md`) with component **directives** — a syntax with three forms distinguished by colon count:

- **inline** `:name[content]{attrs}` — mid-sentence, must emit inline LaTeX
- **leaf** `::name[content]{attrs}` — single line, no nested body
- **container** `:::name{attrs}` … `:::` — a fenced block that can contain further Markdown/components

```markdown
# Document Title

Regular Markdown: **bold**, *italic*, `code`, > blockquotes, lists, tables.

:::component-name{param="value"}
Children content — also Markdown.
:::
```

See [Directive components](#directive-components) below for the full syntax and attribute model. Save the file as `document.md` at the root of your ZIP bundle.

## Component syntax

Container components are invoked with a `:::name{attrs}` opening fence, optional children, and a `:::` closing fence:

```markdown
:::infobox{title="Key Finding"}
The body of the info box supports **Markdown** and nested components.
:::
```

**Parameter rules:**
- Attributes live in `{...}`: `key="value"` (quoted), `key=value` (bare, no spaces), plus the shorthands `#id` and `.class`. See [Directive components](#directive-components).
- Required params: the CLI/MCP will report an error if missing.
- Optional params with defaults: omitting them uses the default from the template.

**Nesting:** components can be nested to any depth:

```markdown
:::infobox{title="Outer"}
Outer body.
:::infobox{title="Inner"}
Inner body.
:::
:::
```

To discover all components available for a template, run:

```bash
druck components --template base --json
```

or call the `list_components` MCP tool.

## Directive components

druckform components are invoked with **generic directives** — a Markdown convention with three forms, distinguished by how many colons open them:

| Form | Syntax | Use for |
|------|--------|---------|
| inline | `:name[content]{attrs}` | mid-sentence content (e.g. a badge); must emit inline LaTeX |
| leaf | `::name[content]{attrs}` | a single line, attributes-only, no nested body |
| container | `:::name{attrs}` … `:::` | a fenced block that can contain further Markdown/components |

A component declares which form it is via `meta.form: "inline" | "leaf" | "container"` (default `"container"` when omitted).

**Attribute model** — the `{...}` block accepts, space-separated:
- `#id` — sets an id; if given more than once, the **last one wins**.
- `.class` — adds a class; repeated `.class` tokens **combine** (space-joined).
- `key="value"` / `key='value'` / `key=value` (bare, no whitespace) — an attribute; a bare `key` with no `=` is shorthand for `key="true"`.

```markdown
:::infobox{#note .highlight accent="warning"}
Shown with an id, a class, and a param.
:::
```

**Inline firing rule:** an inline directive only fires when `:` is immediately followed by a letter-initial name (`[A-Za-z][\w-]*`) *and* at least one of `[content]` / `{attrs}` follows immediately after the name. This is what keeps ordinary prose colons (`10:30`, `localhost:8080`) untouched — a bare `:word` with no bracket/brace never fires. To write a literal colon immediately before what would otherwise look like a directive name, escape it as `\:` (standard Markdown backslash-escaping — `:` is an escapable punctuation character, so the escaped colon is consumed as literal text and never reaches the directive rule). An inline/leaf/container name that isn't a registered component is an error (unregistered names do not silently pass through).

## Directive components: the `raw` escape hatch

`raw` is a reserved directive name that emits its body **verbatim** — unescaped — into the LaTeX output, for the rare case where you need LaTeX the component model can't express:

```markdown
:::raw{format=latex}
\clearpage
:::
```

It also works as a leaf or inline form: `::raw[...]{format=latex}`, `:raw[...]{format=latex}`. Only `format=latex` emits anything through druckform's LaTeX pipeline; `format=html` is reserved for a future Obsidian renderer and is silently skipped here.

## Portability

The directive syntax follows the CommonMark "generic directives" convention (the same one implemented by micromark/remark-directive), rather than a druckform-specific dialect. The intent is that the same `document.md` source can, in the future, also be opened and live-previewed by an Obsidian plugin implementing the same convention — that plugin is not part of druckform, but the document format is written to not preclude it.

## Built-in components

The components below are from the bundled templates. Run `druck components --template <name>` to see up-to-date parameter lists for your chosen template.

### `infobox` (template: base)

A boxed callout with a title and body.

```markdown
:::infobox{title="Key Finding"}
Body text. **Markdown** is supported. Nested components are allowed.
:::
```

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `title` | string | yes | — | Title shown in the box header |
| `accent` | token | no | `accent` | Style token name for the border/header colour |

### `callout` (template: report, extends base)

A variant-styled alert box. Only available in the `report` template (and templates that extend it).

```markdown
:::callout{variant="warn" title="Heads up"}
Body text.
:::
```

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `title` | string | yes | — | Title shown in the callout header |
| `variant` | `info` \| `warn` \| `danger` | no | `info` | Visual style variant |

## Diagrams

Embed Mermaid and PlantUML diagrams as fenced code blocks — they are pre-rendered to PDF automatically.

**Mermaid:**

````markdown
```mermaid
graph TD
  A[Start] --> B[Decision]
  B -->|yes| C[Accept]
  B -->|no| D[Reject]
```
````

**PlantUML:**

````markdown
```plantuml
@startuml
Alice -> Bob : Hello
Bob --> Alice : Hi
@enduml
```
````

Place `.puml` skin files in the `assets/` folder and reference them in your style file via `diagrams.plantuml.skinRef`.

## Templates

Templates define which components are available. Use `druck templates --json` to list all:

| Name | Extends | Description |
|------|---------|-------------|
| `base` | — | Foundational components for all documents |
| `report` | `base` | Extends base with a variant-styled callout |

The `report` template inherits all components from `base` and adds or overrides its own. Template extensions are transitive.

## Style file

Every document needs a style YAML file included in the ZIP bundle. Create `style.yaml`:

```yaml
$schema: "style-v1"
tokens:
  colors:
    accent:    "#2E5AAC"   # primary accent (borders, headers)
    warning:   "#B26A00"   # warning callouts
    infoboxBg: "#EEF3FB"   # info box background
  fonts:
    main: "TeX Gyre Pagella"   # body font (must be a TeX Gyre or system font)
    mono: "JetBrains Mono"     # monospace font
  spacing:
    blockGap: "0.8em"          # vertical gap between blocks
diagrams:
  mermaid:
    theme: "neutral"           # mermaid theme name
  plantuml:
    skinRef: "skin.puml"       # relative to assets/
```

**Token rules:**
- All color values must be `#RRGGBB` (exactly 6 hex digits, # prefix).
- `fonts.main` and `fonts.mono` must be fonts available in the Docker image. The bundled image includes TeX Gyre fonts and common system fonts.
- All `tokens.*` sub-blocks are optional; the render engine applies defaults for missing tokens.
- Additional token names (e.g. `infoboxBg`) are only meaningful if a component reads them via the style schema.
- The `diagrams` block is entirely optional.
- There is no `fonts.sans` / `\setsansfont` — only `fonts.main` (→ `\setmainfont`) and `fonts.mono` (→ `\setmonofont`) are supported.
- A font can also be `{ name, options }` instead of a bare string, e.g. `main: { name: "Noto Sans", options: "AutoFakeBold=2.2" }` — useful for variable fonts where `\bfseries` would otherwise render as Regular weight. See `docs/extending-druckform.md` §4.1 for details.

## Bundle layout

The ZIP you upload (via `PUT <upload_url>` or `druck render`) must follow this structure:

```
bundle.zip
├── document.md       # required
├── style.yaml        # required (or whatever path you pass as `style`)
└── assets/           # optional — images, PlantUML skins, etc.
    ├── logo.png
    └── skin.puml
```

The `style` argument to `render_document` (MCP) or `--style` flag (CLI) is the path to the YAML file within the bundle, relative to the ZIP root.

**Assemble and upload the bundle:**

```bash
mkdir /tmp/df-bundle
cp document.md style.yaml /tmp/df-bundle/
cp -r assets/ /tmp/df-bundle/assets/ 2>/dev/null || true
cd /tmp/df-bundle && zip -r /tmp/bundle.zip .
curl -X PUT -H "Content-Type: application/octet-stream" \
  --data-binary @/tmp/bundle.zip \
  "<upload_url from render_document>"
```

## Validate before rendering

Run a lint pass to catch authoring errors before triggering the LaTeX pipeline:

```bash
druck lint --template base --in document.md --style style.yaml --json
```

A `findings` array with `severity: "error"` means the document will fail to render. Warnings are informational.

Via MCP: call `validate_document(job_id)` after uploading the bundle and before calling `finalize_job`.
