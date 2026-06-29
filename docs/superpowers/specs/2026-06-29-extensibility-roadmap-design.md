# Druckform Extensibility Roadmap — Design

Make Druckform's templates **self-contained and fully overrideable**, and make the
MCP/CLI surface lower-friction for the common cases. This spec captures four phases
of work agreed in design review, with the document-wrapper redesign as the
architectural centrepiece.

The phases are independent enough to land incrementally, but they converge on one
north star: **a self-describing document that names its own template; the template
carries its style and its LaTeX wrapper; so rendering an asset-less document is just
`render_markdown({ document })`** — no separate template arg, no style file, no ZIP.

---

## 1. Problem

The current design has five friction points, each confirmed against the code:

1. **Vocabulary noise.** Tool descriptions and docs use German flavour terms
   ("Sätze", "Lettern" — `druckform-mcp/src/tools/list-templates.ts`,
   `list-components.ts`) that add cognitive load without meaning.

2. **No way to remove an inherited component.** `resolver.ts` merges components down
   the `extends` chain; an unmentioned component is inherited as-is (`resolver.ts:44`),
   a `source:` replaces it, an `extends:`+`defaults:` patches its defaults — but there
   is **no tombstone** to *drop* an inherited component.

3. **`requiredTokens` drift in TS components.** Declarative components auto-derive
   required tokens from `token`-typed params (`declarative.ts:30-46`) — one source of
   truth. TS components must call `ctx.token("x")` in the body **and** separately list
   `requiredTokens: ["x"]` in `meta` (`typescript.ts:55`). Two places, silent drift.

4. **Port clash across instances.** The MCP HTTP server binds a fixed port at startup
   (`druckform-mcp/src/index.ts:5` → default `7331`; `http-server.ts:99`). Two Claude
   instances on one machine collide. `DRUCKFORM_HTTP_PORT` exists but must be
   hand-coordinated.

5. **Style and the document shell are not template concerns.**
   - Style is passed explicitly to `render`; `template.yaml`'s `style_defaults` field
     is **dead** — stored by the resolver (`resolver.ts:67`) but never loaded.
   - The entire LaTeX shell is **hardcoded** in `composer.ts` (`\documentclass{article}`,
     five fixed `\usepackage` lines, `\begin{document}…\end{document}`, `texParts` at
     `composer.ts:127-136`). Templates cannot change document class, geometry, margins,
     headers/footers, or paper size.
   - Asset-less documents still pay the full ZIP + HTTP upload tax.

## 2. Roadmap & sequencing

| Phase | Theme | Items |
|-------|-------|-------|
| **1** | Quick wins | vocab cleanup · `null` tombstone · token-schema unification · ephemeral port |
| **2** | Self-contained templates | style-in-template (+ override) · document-as-component |
| **3** | Document model | frontmatter (schema-declared, exposed to components) · template-via-frontmatter |
| **4** | Server statefulness | `render_markdown` inline path · persistent jobs (delta upload, list/delete, TTL reset) |

Each phase is shippable on its own. Phase 2 establishes the merge/override machinery
that Phase 3 reuses; Phase 4's `render_markdown` becomes trivial once 2+3 land.

---

## 3. Phase 1 — Quick wins

### 3.1 Drop Satz/Letter vocabulary
Remove from `docs/extending-druckform.md` **and** from the tool description strings
(`list-templates.ts`, `list-components.ts`) so docs and tool output agree. Pure copy
change, no behavior.

### 3.2 `null` to remove an inherited component
Extend `ComponentOverrideSpec` handling in `resolver.ts`. When a template maps a
component name to `null` (explicit YAML null), **delete** it from `mergedComponents`:

```yaml
# child template
components:
  infobox: null          # drop the inherited base.infobox entirely
```

- Unmentioned components remain inherited 1:1 (unchanged).
- **Guard:** the GFM emitter calls `block(opts, "block:table", …)` and throws if the
  component is missing (`tokens-to-latex.ts`). Nulling a `block:*` component must be
  **rejected at load time** (alongside the existing reserved-namespace check in
  `loader.ts`), or it crashes any document using that construct. Nulling ordinary
  components (`infobox`, `callout`) is safe.

### 3.3 Derive `requiredTokens` from the schema (TS components)
Ship a token-typed schema helper from the package entry so TS components declare token
params the same way declarative ones do, and `requiredTokens` is **derived, not
hand-maintained**:

```ts
import { z, tokenRef } from "druckform";

export const schema = z.object({
  accent: tokenRef("accent"),   // runtime: string; marks "accent" as a required token
  title:  z.string(),
});
// meta.requiredTokens becomes optional/legacy — derived from the schema instead
```

`loadTypeScriptComponent` (`typescript.ts`) inspects the schema for `tokenRef` markers
and unions them into `requiredTokens`. `meta.requiredTokens` stays supported for
back-compat but is no longer the primary source. This makes `list_components` params
self-documenting (a token param is visibly a token).

### 3.4 Ephemeral HTTP port by default
Change the default so each MCP instance grabs a free port for its lifetime:

```ts
// druckform-mcp/src/index.ts — default to 0 (OS-assigned ephemeral)
const HTTP_PORT = Number.parseInt(process.env.DRUCKFORM_HTTP_PORT ?? "0", 10);
```

```ts
// druckform-mcp/src/http-server.ts — report the ACTUAL bound port, not the requested one
await app.listen({ port, host });
const actual = (app.server.address() as import("node:net").AddressInfo).port;
return { url: `http://127.0.0.1:${actual}`, port: actual };
```

`DRUCKFORM_HTTP_PORT` is retained for deterministic setups (CI, docker port mapping).
**Rejected:** a port-per-upload scheme — there is no "request upload" step to hang it
on (`render_document` mints the `upload_url` *before* the upload), and per-job
listeners are racy and leak sockets. Ephemeral-at-startup solves the clash in ~5 lines.

---

## 4. Phase 2 — Self-contained templates

### 4.1 Style belongs to the template (with override)

Today style is fully decoupled and `style_defaults` is dead. The change:

- A template may declare its style **inline** in `template.yaml`, and style tokens
  **merge down the `extends` chain** exactly like component defaults — `base` defines
  the base palette, a child overrides `accent`, etc.
- `render`/`render_document` may still pass an **external override style** that merges
  on top of the resolved template style.

```yaml
# template.yaml
name: report
extends: base
style:                       # merged over base's style
  tokens:
    colors: { accent: "#B26A00" }
```

Resolution order (lowest → highest precedence):
`base.style` → … → `leaf.style` → external override style passed to render.

**Settled decision A:** style is *template-default + overridable*, **not**
template-only. Rationale: one `report` template must still serve many client palettes
without minting a template per brand. Keeping an injectable override preserves that
while making templates self-contained by default.

Token-coverage checking (`tokens.ts`) runs against the **fully merged** style, so it
becomes deterministic per template. The `fontMain`/`fontMono` special-casing
(`tokens.ts:31-32`) is unchanged.

### 4.2 The document wrapper as an overrideable `document` component

**This is the architectural centrepiece.** Instead of a bespoke `layout:` config
section, the document shell becomes a **reserved, always-present, non-invocable
component** named `document`, overrideable in YAML or TS through the normal chain.
This reuses the component loaders, the resolver override chain, `requiredTokens`, and
preamble dedup — no parallel concept.

#### 4.2.1 Rules
- Reserved name (validated like `block:*` in `loader.ts`): a template may **override**
  `document`, may not invent siblings, and it is **not invocable from the document
  body** (exactly one wrapper per document).
- `base` ships a default `document` component reproducing today's `article` shell.

#### 4.2.2 Contract — a typed `DocumentLayout` payload
The wrapper needs more than `children`: it needs the compiled style preamble and the
deduped component preambles. This mirrors how `block:*` components receive
`BlockElement` as the 4th render arg:

```ts
export type DocumentLayout = {
  kind: "document";
  documentclass: string;        // default "article"; overridable via params/frontmatter
  stylePreamble: string;        // compiled from the resolved style (raw LaTeX)
  componentPreamble: string;    // deduped union of every used component's preamble
  frontmatter: Record<string, string>;   // populated once Phase 3 lands; {} until then
};
```

The render contract's 4th argument generalises from `BlockElement` to
`BlockElement | DocumentLayout` (both discriminated by `kind`; existing components
ignore it).

#### 4.2.3 Declarative override (covers most layout needs)
New **raw** slots in the declarative emitter — `{{body}}`, `{{stylePreamble}}`,
`{{componentPreamble}}` — injected unescaped like the existing `{{children}}`
(`declarative.ts:80-82`):

```yaml
name: document
description: "Document shell."
params:
  documentclass: { type: string, required: false, default: article }
emits: |
  \documentclass{{{documentclass}}}
  {{stylePreamble}}
  {{componentPreamble}}
  \usepackage[a4paper,margin=2.5cm]{geometry}
  \usepackage{fancyhdr}\pagestyle{fancy}
  \begin{document}
  {{body}}
  \end{document}
```

#### 4.2.4 TypeScript override (when logic is needed)
```ts
export const render: Component<typeof schema> = (params, children, ctx, el) => {
  if (el?.kind !== "document") return children;
  const title = ctx.frontmatter?.title;   // Phase 3
  return Tex`\documentclass{${raw(el.documentclass)}}
${raw(el.stylePreamble)}
${raw(el.componentPreamble)}
\usepackage[a4paper,margin=2.5cm]{geometry}
\begin{document}
${title ? raw("\\maketitle") : raw("")}
${raw(children)}
\end{document}`;
};
```

#### 4.2.5 Composer inversion + source-map preservation
`composeDocument` inverts: render the body first, collect style + component preambles,
then call the `document` component with them as the payload. The hard part is the
**source map** — today `PREAMBLE_LINES` (`composer.ts:54`) counts the fixed header so
`.tex`→`.md` line attribution stays aligned. With an arbitrary wrapper, the composer no
longer knows how many lines precede the body.

**Solution (reuses the existing diagram-placeholder pattern, `composer.ts:75-87`):**
the wrapper emits a body sentinel; the composer splits on it to learn the prefix line
count, then substitutes:

```ts
const docTex = documentComp.render({}, "", ctx, layoutPayloadWith("DRUCKFORM_BODY"));
const [prefix] = docTex.split("DRUCKFORM_BODY");
const PREAMBLE_LINES = prefix.split("\n").length;
const finalTex = docTex.replace("DRUCKFORM_BODY", body);
```

The contract for a wrapper is therefore "place the body marker somewhere," not "return
a flat string we string-match" — robust against the body appearing more than once.

#### 4.2.6 Engine-core split

**Settled decision B:** four packages are correctness requirements of the *output*,
not layout choices, and stay **composer-injected and non-overridable**:

| Package | Needed by |
|---------|-----------|
| `fontspec` | style fonts (`\setmainfont`) |
| `hyperref` | links (`\href`) emitted inline by the GFM emitter |
| `ulem` (`normalem`) | strikethrough (`\sout`) |
| `graphicx` | images / `block:image` (adjustbox builds on it) |

The `document` component owns everything that is genuinely a design choice:
`\documentclass`, geometry, page style, title block, and *where* the style/component
preambles and body land. Rationale: an override that forgot `ulem` would silently
break every `~~strike~~`; the split makes that impossible. (Rejected alternative:
document component owns the entire preamble with a presence check — turns a forgotten
`\usepackage` into a confusing render-time LaTeX error instead of a clear contract.)

So the final preamble is: **composer-injected engine core** → `document` component's
output (which splices `stylePreamble` + `componentPreamble` wherever it chooses).

---

## 5. Phase 3 — Document model

### 5.1 Frontmatter
- `document.md` may begin with a YAML frontmatter block (`--- … ---`), parsed in
  `parser.ts` before `:::` extraction.
- A template **declares its frontmatter schema** the same way components declare
  params (reuses the zod-based validation already in the loaders). Unknown/missing
  required keys surface as lint findings, like component params do today.

```yaml
# template.yaml
frontmatter:
  title:  { type: string, required: true }
  author: { type: string, required: false }
  date:   { type: string, required: false }
```

### 5.2 Values exposed to all components
Frontmatter values are added to `RenderCtx` so every component can read them:

```ts
interface RenderCtx {
  token(name: string): string;
  style: StyleTokens;
  frontmatter: Record<string, string>;   // new
}
```

- TS components: `ctx.frontmatter.title`.
- Declarative components: a `{{fm.title}}` slot family (escaped, like string params).
- The `document` component is the natural consumer (title block / `\maketitle`).

### 5.3 Template selectable via frontmatter

**Settled decision C:** frontmatter sets the **default** template; an explicit
CLI/MCP arg **overrides** it. A document becomes self-describing
(`druck render --in doc.md --out x.pdf`), yet "render this doc with another template"
doesn't require editing the doc.

```markdown
---
template: report
title: Q3 Review
---
# ...
```

The frontmatter template name is **validated against available templates** regardless
of source — never trusted blindly. `render_document`'s `template` arg becomes optional
(falls back to frontmatter).

---

## 6. Phase 4 — Server statefulness

### 6.1 `render_markdown` — the no-ZIP path
A new MCP tool for asset-less documents. Both inputs are text, so skip the upload HTTP
dance entirely; only the **output** stays a URL (PDF is binary):

```
render_markdown({ template?, document: "<md text>", style?: "<yaml text>" })
  → { job_id, download_url, expires_at }
```

With Phases 2+3, `template` and `style` are optional (template from frontmatter, style
from the template), collapsing the common case to `render_markdown({ document })`.

### 6.2 Persistent jobs + delta uploads
For the edit loop (render → tweak → re-render without re-shipping large assets):

- **Keep job assets** across renders instead of reaping on first finalize.
- **Checksum-delta upload** (rsync-over-MCP): a new `list_job_files` tool returns
  `[{ name, size, checksum }]`; the client diffs locally and uploads only changed
  files (or a single changed `.md`).
- **Activity-reset TTL:** each upload/render resets the job TTL; a hard max-lifetime
  cap bounds disk. `DRUCKFORM_MAX_JOBS` (`job-store.ts:11`) still caps count.
- **New tools:** `list_job_files`, `delete_job` (explicit cleanup).

**Token-model consequence:** today's URLs are single-use + 15-min
(`url-tokens.ts`). Reuse implies a longer-lived, re-usable job handle, so tokens become
**re-issuable per job** (job-scoped auth) rather than one-shot. This is a deliberate
security-model change, called out as a risk (§9).

Stage this last and split it: `render_markdown` (6.1) is the cheap half; persistent
jobs (6.2) is the expensive half.

---

## 7. Backward compatibility

- **Phase 1** is additive (`null` tombstone, `tokenRef`) or a default change (port);
  existing templates/components unaffected. `meta.requiredTokens` keeps working.
- **Phase 2**: the 4th render arg generalises to `BlockElement | DocumentLayout` —
  additive, existing components ignore it. Templates with no `style`/`document`
  override get today's behavior from `base`'s defaults. The `mdToLatex`/composer
  changes are internal.
- **Phase 3**: documents with no frontmatter and an explicit template arg behave as
  today. `ctx.frontmatter` defaults to `{}`.
- **Phase 4**: new tools; existing `render_document` + ZIP flow stays.

## 8. Testing

- **Phase 1:** resolver test for `null` tombstone (and rejection for `block:*`);
  loader test deriving `requiredTokens` from `tokenRef`; http-server test asserting an
  ephemeral port is reported and reachable.
- **Phase 2:** style-merge-down-chain test (+ external override precedence);
  `document` override tests in **both** YAML and TS; a **source-map test** proving line
  attribution survives a custom wrapper (the key risk); an engine-core test asserting
  `ulem`/`hyperref` are present even when `document` is overridden.
- **Phase 3:** frontmatter parse + schema-validation lint findings; `ctx.frontmatter`
  reaches a component; template-from-frontmatter with arg-override precedence;
  invalid frontmatter template name rejected.
- **Phase 4:** `render_markdown` round-trip with no ZIP; delta-upload checksum diff;
  TTL reset; `list_job_files`/`delete_job`.
- Existing suites must stay green throughout.

## 9. Out of scope

- Overrideable **inline** marks (bold/italic/code/link/strikethrough) — still fixed in
  the emitter.
- Multiple `document` wrappers / per-section layouts.
- Auth beyond job-scoped tokens (no user accounts).
- Math, footnotes, raw-HTML passthrough (unchanged from the GFM spec).

## 10. Risks

- **Source-map alignment (Phase 2)** is the highest-risk item: a custom wrapper that
  doesn't surround the body marker cleanly would misattribute LaTeX errors. Mitigated
  by the placeholder contract + a dedicated test.
- **Engine-core drift:** if a future inline feature needs a new package, it must be
  added to the composer core, not a component preamble — documented as a maintenance
  rule.
- **Token-model change (Phase 4)** widens the job lifetime/auth surface; keep tokens
  job-scoped and the max-lifetime cap firm.
- **Frontmatter-as-template (Phase 3)** is an injection surface; always validate the
  name against the resolved template set.

## 11. Documentation to update (every phase)

- `docs/extending-druckform.md` (the developer guide)
- `README.md`
- The in-repo skill file `claude-plugin/skills/druckform/SKILL.md` (source of truth;
  the installed `~/.claude/skills/druckform/SKILL.md` is a copy)
