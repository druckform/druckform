# Inline & Leaf Components (Generic Directives) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace druckform's bespoke `::: name key="value"` container syntax with the CommonMark generic-directives convention and add **inline** (`:name[content]{attrs}`) and **leaf** (`::name[content]{attrs}`) component forms, using a purpose-built micromark-compatible parser.

**Architecture:** A shared brace-attribute parser feeds two layers — druckform's line-based block parser (`parser.ts`, handling tight `:::name{attrs}` containers and `::name[content]{attrs}` leaves) and a new markdown-it inline rule (feeding `tokens-to-latex.ts`, handling `:name[content]{attrs}` spans). Components declare a `form` ("inline"|"leaf"|"container"). A reserved `raw{format=latex|html}` directive is the verbatim escape hatch; unregistered names error clearly.

**Tech Stack:** TypeScript (ESM, NodeNext), Node 22, vitest, markdown-it, biome.

## Global Constraints

- TypeScript ESM with `.js` import specifiers (NodeNext); match existing style per file.
- Attribute model (all three forms): `{#id .class key=val key="v" key='v' bare}` — `#`→`id` (last wins), `.`→adds to `class` (space-joined), `key=val`/quoted/bare→params; matches micromark so the same source parses on a future Obsidian/micromark side.
- Container: tight `:::name{attrs}` (name required, 3 colons), closed by a `:::` line. Leaf: `::name[content]{attrs}` (2 colons, own line, optional `[content]`, optional `{attrs}`, no body). Inline: `:name[content]{attrs}`.
- **Inline firing rule:** `:name` fires only when immediately followed by `[` or `{`, the name is `[A-Za-z][\w-]*`, and it resolves to a registered component with `form:"inline"`; otherwise it is literal text. A literal `\:` is an escape.
- **Escape hatch:** unregistered directive name → a clear render error (and doctor finding), never an undefined-LaTeX crash. Reserved `raw` directive with `{format=latex|html}`: druckform emits its content verbatim iff `format=latex` (skips `format=html`); content is NOT markdown-parsed or escaped.
- `meta.form` defaults to `"container"` (existing components unchanged).
- YAGNI: no Obsidian plugin; no `druck migrate` command; no anonymous spans/divs; no MDX.
- Migrate only ACTIVE in-repo `:::` usages (docs/authoring.md, docs/extending-druckform.md, examples, tests, fixtures). Leave historical plan docs under `docs/superpowers/plans/2026-06-*` untouched.
- Run `pnpm biome check <changed files>` before every commit; branch stays lint-clean. Tests: `pnpm --filter druckform test` (full) / `pnpm --filter druckform exec vitest run <path>` (focused).

---

### Task 1: Shared brace-attribute parser

**Files:**
- Create: `packages/druckform/src/parse/directive-attrs.ts`
- Test: `packages/druckform/tests/unit/directive-attrs.test.ts`

**Interfaces:**
- Produces: `parseDirectiveAttributes(attrStr: string): Record<string, string>` — `attrStr` is the text INSIDE the braces (no `{}`). Returns a flat map: `id` (last `#` wins), `class` (space-joined `.` tokens), and each `key=val`/`key="v"`/`key='v'`/bare `key` (bare → `"true"`). Empty/whitespace → `{}`.

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/directive-attrs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDirectiveAttributes } from "../../src/parse/directive-attrs.js";

describe("parseDirectiveAttributes", () => {
  it("parses #id and .class per micromark rules", () => {
    expect(parseDirectiveAttributes("#foo .a .b")).toEqual({ id: "foo", class: "a b" });
  });
  it("last id wins; classes combine", () => {
    expect(parseDirectiveAttributes("#one #two .x")).toEqual({ id: "two", class: "x" });
  });
  it("parses key=val, quoted, and bare keys", () => {
    expect(parseDirectiveAttributes('title="Key Finding" accent=accent flag')).toEqual({
      title: "Key Finding",
      accent: "accent",
      flag: "true",
    });
  });
  it("handles single quotes and mixed with id/class", () => {
    expect(parseDirectiveAttributes("#h .warn title='Heads up'")).toEqual({
      id: "h",
      class: "warn",
      title: "Heads up",
    });
  });
  it("returns {} for empty input", () => {
    expect(parseDirectiveAttributes("")).toEqual({});
    expect(parseDirectiveAttributes("   ")).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/directive-attrs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/druckform/src/parse/directive-attrs.ts`:

```ts
/**
 * Parse the text INSIDE a generic-directives `{ … }` attribute block (no braces)
 * into a flat map. Matches the micromark/remark-directive model:
 *   #foo        -> id=foo (last id wins)
 *   .a .b       -> class="a b" (classes combine)
 *   key=val / key="v" / key='v' / bare key (=> "true")
 * Whitespace-separated. Empty input -> {}.
 */
export function parseDirectiveAttributes(attrStr: string): Record<string, string> {
  const out: Record<string, string> = {};
  const classes: string[] = [];
  // token: #id | .class | key="v" | key='v' | key=val | bareKey
  const re = /([#.])([\w-]+)|([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g;
  for (let m = re.exec(attrStr); m !== null; m = re.exec(attrStr)) {
    if (m[1] === "#") {
      out.id = m[2] ?? "";
    } else if (m[1] === ".") {
      if (m[2]) classes.push(m[2]);
    } else if (m[3]) {
      const val = m[4] ?? m[5] ?? m[6];
      out[m[3]] = val ?? "true";
    }
  }
  if (classes.length > 0) out.class = classes.join(" ");
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter druckform exec vitest run tests/unit/directive-attrs.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
pnpm biome check packages/druckform/src/parse/directive-attrs.ts packages/druckform/tests/unit/directive-attrs.test.ts
git add packages/druckform/src/parse/directive-attrs.ts packages/druckform/tests/unit/directive-attrs.test.ts
git commit -m "feat(druckform): shared generic-directives attribute parser"
```

---

### Task 2: Block parser — tight container + leaf, `form` discriminator, migrate in-repo `:::`

**Files:**
- Modify: `packages/druckform/src/parse/parser.ts`
- Modify: `packages/druckform/src/sdk/types.ts` (`ComponentBlock.form`)
- Modify (migrate to new syntax): `packages/druckform/tests/unit/parser.test.ts`, `packages/druckform/tests/unit/composer-document.test.ts`, `packages/druckform/tests/integration/preview-component.test.ts`, `packages/druckform/tests/fixtures/documents/valid.md`, `packages/druckform/tests/fixtures/documents/invalid-missing-required.md`

**Interfaces:**
- Consumes: `parseDirectiveAttributes` (Task 1).
- Produces: `ComponentBlock` gains `form: "leaf" | "container"`. Container = `:::name{attrs}` … `:::` (recurses, children are block ASTNodes). Leaf = `::name[content]{attrs}` (own line; `children` is `[{type:"text", content, sourceLine}]` when `[content]` present, else `[]`).

- [ ] **Step 1: Add `form` to the type**

In `packages/druckform/src/sdk/types.ts`, change `ComponentBlock`:

```ts
export interface ComponentBlock {
  name: string;
  params: Record<string, string>;
  children: ASTNode[];
  sourceLine: number;
  form: "leaf" | "container";
}
```

- [ ] **Step 2: Write the failing parser tests**

Replace the body of `packages/druckform/tests/unit/parser.test.ts` with new-syntax coverage (read the file first to preserve its imports; it imports `parseMarkdownString` from `../../src/parse/parser.js`). Add:

```ts
import { describe, expect, it } from "vitest";
import { parseMarkdownString } from "../../src/parse/parser.js";

describe("directive block parser", () => {
  it("parses a tight container with brace attributes", () => {
    const doc = parseMarkdownString(':::infobox{title="Note" #n .warn}\nbody\n:::\n');
    const node = doc.nodes[0];
    if (node?.type !== "component") throw new Error("expected component");
    expect(node.block.name).toBe("infobox");
    expect(node.block.form).toBe("container");
    expect(node.block.params).toEqual({ title: "Note", id: "n", class: "warn" });
    expect(node.block.children[0]).toMatchObject({ type: "text", content: "body" });
  });

  it("parses nested containers", () => {
    const doc = parseMarkdownString(":::outer{}\n:::inner{}\nx\n:::\n:::\n");
    const outer = doc.nodes[0];
    if (outer?.type !== "component") throw new Error("expected component");
    expect(outer.block.name).toBe("outer");
    const inner = outer.block.children.find((n) => n.type === "component");
    expect(inner && inner.type === "component" && inner.block.name).toBe("inner");
  });

  it("parses a leaf directive (two colons, no body)", () => {
    const doc = parseMarkdownString('::figure[A cat]{src=cat.pdf}\n');
    const node = doc.nodes[0];
    if (node?.type !== "component") throw new Error("expected component");
    expect(node.block.name).toBe("figure");
    expect(node.block.form).toBe("leaf");
    expect(node.block.params).toEqual({ src: "cat.pdf" });
    expect(node.block.children[0]).toMatchObject({ type: "text", content: "A cat" });
  });

  it("treats a leaf with no content/attrs as an empty-children component", () => {
    const doc = parseMarkdownString("::pagebreak\n");
    const node = doc.nodes[0];
    if (node?.type !== "component") throw new Error("expected component");
    expect(node.block.form).toBe("leaf");
    expect(node.block.children).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/parser.test.ts`
Expected: FAIL — old parser doesn't recognize tight `:::name{}` / `::name` (and `form` is absent).

- [ ] **Step 4: Rewrite the block grammar in `parser.ts`**

Replace the regex constants and `parseAttrs` (lines 5–16) with:

```ts
import { parseDirectiveAttributes } from "./directive-attrs.js";

// Container: three colons, tight name, optional {attrs}. Closed by a `:::` line.
const CONTAINER_OPEN_RE = /^:::([A-Za-z][\w-]*)\s*(?:\{([^}]*)\})?\s*$/;
const CONTAINER_CLOSE_RE = /^:::\s*$/;
// Leaf: two colons, tight name, optional [content], optional {attrs}, own line.
const LEAF_RE = /^::([A-Za-z][\w-]*)(?:\[([^\]]*)\])?\s*(?:\{([^}]*)\})?\s*$/;
```

(Delete the old `OPEN_RE`, `CLOSE_RE`, `ATTR_RE`, and `parseAttrs`.)

Then replace the parsing loop inside `parseLines` (the `while` body, lines 69–96) with:

```ts
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const containerOpen = CONTAINER_OPEN_RE.exec(line);
    const isClose = CONTAINER_CLOSE_RE.test(line) && !containerOpen;

    if (isClose) {
      flushText();
      return [nodes, i]; // caller consumes the closing :::
    }

    if (containerOpen) {
      flushText();
      const name = containerOpen[1] ?? "";
      const params = parseDirectiveAttributes(containerOpen[2] ?? "");
      const sourceLine = i + 1;
      i++;
      const [children, closedAt] = parseLines(lines, i);
      i = closedAt + 1; // skip the closing :::
      nodes.push({ type: "component", block: { name, params, children, sourceLine, form: "container" } });
      textStartLine = i + 1;
      continue;
    }

    const leaf = LEAF_RE.exec(line);
    if (leaf) {
      flushText();
      const name = leaf[1] ?? "";
      const content = leaf[2];
      const params = parseDirectiveAttributes(leaf[3] ?? "");
      const sourceLine = i + 1;
      const children: ASTNode[] = content ? [{ type: "text", content, sourceLine }] : [];
      nodes.push({ type: "component", block: { name, params, children, sourceLine, form: "leaf" } });
      i++;
      textStartLine = i + 1;
      continue;
    }

    textBuf.push(line);
    i++;
  }
```

(`ASTNode` is already imported at the top of `parser.ts`.)

- [ ] **Step 5: Run parser tests → GREEN**

Run: `pnpm --filter druckform exec vitest run tests/unit/parser.test.ts`
Expected: PASS.

- [ ] **Step 6: Migrate in-repo test docs/fixtures to the new syntax, then fix any consumers**

Update every ACTIVE in-repo `::: name key="value"` to `:::name{key="value"}` in these files (read each, rewrite the directive lines):
- `packages/druckform/tests/unit/composer-document.test.ts`
- `packages/druckform/tests/integration/preview-component.test.ts`
- `packages/druckform/tests/fixtures/documents/valid.md`
- `packages/druckform/tests/fixtures/documents/invalid-missing-required.md`

Any code that constructs a `ComponentBlock` literal (e.g. in `composer` tests) must add `form: "container"`. The composer itself reads `block.name`/`block.params`/`block.children` and does not branch on `form`, so container behavior is unchanged; leaf blocks flow through the same `renderNode` path (their `[content]` text child renders inline).

- [ ] **Step 7: Full suite → GREEN**

Run: `pnpm --filter druckform test`
Expected: PASS. If a composer/preview test still asserts old-syntax strings, update the input document to the new syntax (do not weaken assertions). Confirm `tsc --noEmit` passes (the `form` field is required on `ComponentBlock`).

- [ ] **Step 8: Commit**

```bash
pnpm biome check packages/druckform/src/parse/parser.ts packages/druckform/src/sdk/types.ts
git add -A packages/druckform/src packages/druckform/tests
git commit -m "feat(druckform): tight directive block grammar (container + leaf) with form discriminator"
```

---

### Task 3: Component `form` metadata (declare inline/leaf/container)

**Files:**
- Modify: `packages/druckform/src/sdk/types.ts` (`ComponentMeta.form`)
- Modify: `packages/druckform/src/component/typescript.ts` and `packages/druckform/src/component/declarative.ts` (read/default `form`)
- Test: `packages/druckform/tests/unit/component-form.test.ts` (create)

**Interfaces:**
- Produces: `ComponentMeta.form?: "inline" | "leaf" | "container"`; `ComponentDef.meta.form` is always populated (defaulting to `"container"`). Declarative `*.component.yaml` accepts a top-level `form:`.

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/component-form.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDeclarativeComponent } from "../../src/component/declarative.js";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-form-")); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function yaml(content: string): string {
  const p = path.join(dir, "c.component.yaml");
  fs.writeFileSync(p, content, "utf8");
  return p;
}

describe("component form metadata", () => {
  it("defaults form to container when unspecified", () => {
    const def = loadDeclarativeComponent(yaml("name: box\ndescription: d\nparams: {}\nemits: x\n"));
    expect(def.meta.form).toBe("container");
  });
  it("reads an explicit inline form", () => {
    const def = loadDeclarativeComponent(
      yaml("name: badge\ndescription: d\nform: inline\nparams: {}\nemits: x\n"),
    );
    expect(def.meta.form).toBe("inline");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/component-form.test.ts`
Expected: FAIL — `meta.form` is `undefined`.

- [ ] **Step 3: Add the type**

In `packages/druckform/src/sdk/types.ts`, extend `ComponentMeta`:

```ts
export interface ComponentMeta {
  name: string;
  description: string;
  acceptsChildren: boolean;
  /** Directive form. Defaults to "container". */
  form?: "inline" | "leaf" | "container";
  example?: string;
  requiredTokens?: string[];
}
```

- [ ] **Step 4: Populate `form` in both loaders**

In `packages/druckform/src/component/declarative.ts`, add `form?: "inline" | "leaf" | "container"` to the `DeclarativeComponentYaml` interface, and in the returned `meta` object set:

```ts
      form: spec.form ?? "container",
```

In `packages/druckform/src/component/typescript.ts`, where the component's `meta` is read from the module, normalize the form when constructing the returned `ComponentDef.meta` — set `form: mod.meta.form ?? "container"` (spread the module meta then override). Locate the `meta: mod.meta,` line and replace with:

```ts
      meta: { ...mod.meta, form: mod.meta.form ?? "container" },
```

- [ ] **Step 5: Run → GREEN, then full suite**

Run: `pnpm --filter druckform exec vitest run tests/unit/component-form.test.ts`
Expected: PASS.
Run: `pnpm --filter druckform test`
Expected: PASS (existing components default to `"container"`).

- [ ] **Step 6: Commit**

```bash
pnpm biome check packages/druckform/src/sdk/types.ts packages/druckform/src/component/declarative.ts packages/druckform/src/component/typescript.ts packages/druckform/tests/unit/component-form.test.ts
git add packages/druckform/src/sdk/types.ts packages/druckform/src/component/declarative.ts packages/druckform/src/component/typescript.ts packages/druckform/tests/unit/component-form.test.ts
git commit -m "feat(druckform): component form metadata (inline/leaf/container)"
```

---

### Task 4: Inline directive rule + dispatch

**Files:**
- Create: `packages/druckform/src/latex/inline-directive.ts` (markdown-it inline rule)
- Modify: `packages/druckform/src/latex/md-to-latex.ts` (register the rule)
- Modify: `packages/druckform/src/latex/tokens-to-latex.ts` (render `directive_inline` via the registry; refactor `renderInline` to render an arbitrary child list)
- Test: `packages/druckform/tests/unit/inline-directive.test.ts` (create)

**Interfaces:**
- Consumes: `parseDirectiveAttributes` (Task 1); `meta.form` (Task 3).
- Produces: a markdown-it inline rule `directiveInline` that emits a token `type:"directive_inline"` with `token.meta = { name: string, params: Record<string,string> }` and `token.children = <inline tokens of [content]>`. `tokens-to-latex` renders it by calling the registered inline component `render(params, innerLatex, ctx)`; non-firing cases (see rule) emit literal text.

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/inline-directive.test.ts`. It builds a template with an inline component and renders prose through `mdToLatex`:

```ts
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { mdToLatex } from "../../src/latex/md-to-latex.js";
import type { ResolvedTemplate } from "../../src/sdk/types.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";
import { testCtx } from "../helpers/render-component.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const FIXTURES = path.resolve(import.meta.dirname, "../fixtures/templates");
let template: ResolvedTemplate;

beforeAll(async () => {
  // "inlinetheme" ships a `badge` inline component: emits \fbox{<children>}
  template = await resolveTemplate("inlinetheme", loadAllTemplates(BUNDLED, FIXTURES));
});

function render(src: string): string {
  return mdToLatex(src, { template, ctx: testCtx(), assetsRoot: "/a" });
}

describe("inline directives", () => {
  it("renders a registered inline component with its bracket content", () => {
    expect(render("Status: :badge[NEW] today")).toContain("Status: \\fbox{NEW} today");
  });
  it("passes attributes as params and renders inline markdown in content", () => {
    // badge emits \fbox{<children>}; content **bold** must become \textbf
    expect(render(":badge[**hi**]{tone=warn}")).toContain("\\fbox{\\textbf{hi}}");
  });
  it("does NOT fire on prose colons (colon not followed by a letter+bracket)", () => {
    expect(render("at 10:30 and localhost:8080")).toContain("10:30");
    expect(render("at 10:30 and localhost:8080")).toContain("localhost:8080");
  });
  it("does NOT fire without a following bracket/brace", () => {
    expect(render("a :badge b")).toContain(":badge");
  });
  it("throws on a structurally-fired but unregistered inline name", () => {
    expect(() => render(":nope[x]")).toThrow(/nope/);
  });
});
```

Create the fixture `packages/druckform/tests/fixtures/templates/inlinetheme/template.yaml`:

```yaml
name: inlinetheme
extends: base
components:
  badge:
    source: ./badge.component.yaml
```

Create `packages/druckform/tests/fixtures/templates/inlinetheme/badge.component.yaml`:

```yaml
name: badge
description: inline badge
form: inline
params: {}
slots:
  children: true
emits: "\\fbox{{{children}}}"
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/inline-directive.test.ts`
Expected: FAIL — `:badge[NEW]` is emitted literally (no inline rule yet).

- [ ] **Step 3: Implement the markdown-it inline rule**

Create `packages/druckform/src/latex/inline-directive.ts`:

```ts
import type MarkdownIt from "markdown-it";
import { parseDirectiveAttributes } from "../parse/directive-attrs.js";

// Matches an inline directive at the current position: :name , then REQUIRED
// [content] and/or {attrs} (at least one), name is letter-initial. The required
// bracket/brace is what prevents matching prose colons (10:30, localhost:8080).
const NAME = /^:([A-Za-z][\w-]*)/;

/**
 * markdown-it inline rule for generic-directive inline spans `:name[content]{attrs}`.
 * Emits a `directive_inline` token whose `.children` are the parsed inline tokens of
 * `[content]` and whose `.meta` carries `{ name, params }`. Rendering/registry lookup
 * happens later in tokens-to-latex.
 */
export function inlineDirectivePlugin(md: MarkdownIt): void {
  md.inline.ruler.before("emphasis", "directive_inline", (state, silent) => {
    const src = state.src;
    let pos = state.pos;
    if (src.charCodeAt(pos) !== 0x3a /* : */) return false;
    const nameMatch = NAME.exec(src.slice(pos));
    if (!nameMatch) return false;
    const name = nameMatch[1] as string;
    let cur = pos + nameMatch[0].length;

    // Optional [content]
    let content: string | null = null;
    if (src.charCodeAt(cur) === 0x5b /* [ */) {
      const close = src.indexOf("]", cur + 1);
      if (close === -1) return false;
      content = src.slice(cur + 1, close);
      cur = close + 1;
    }
    // Optional {attrs}
    let attrStr = "";
    if (src.charCodeAt(cur) === 0x7b /* { */) {
      const close = src.indexOf("}", cur + 1);
      if (close === -1) return false;
      attrStr = src.slice(cur + 1, close);
      cur = close + 1;
    }
    // Firing rule: require at least one of [content] / {attrs}.
    if (content === null && attrStr === "") return false;
    if (silent) return true;

    const token = state.push("directive_inline", "", 0);
    token.meta = { name, params: parseDirectiveAttributes(attrStr) };
    token.children = content ? md.parseInline(content, state.env)[0]?.children ?? [] : [];
    state.pos = cur;
    return true;
  });
}
```

- [ ] **Step 4: Register the rule in `md-to-latex.ts`**

In `packages/druckform/src/latex/md-to-latex.ts`, import and apply the plugin to the `md` instance:

```ts
import MarkdownIt from "markdown-it";
import { inlineDirectivePlugin } from "./inline-directive.js";
import { type EmitOpts, tokensToLatex } from "./tokens-to-latex.js";

const md = new MarkdownIt({ html: false, linkify: true });
md.use(inlineDirectivePlugin);
```

- [ ] **Step 5: Handle `directive_inline` in `tokens-to-latex.ts`**

In `packages/druckform/src/latex/tokens-to-latex.ts`, refactor `renderInline` so the per-child switch is a helper that takes a child-token array, then add the directive case. Replace the `renderInline` function with:

```ts
function renderInline(token: Token | undefined, opts: EmitOpts): string {
  if (!token || !token.children) return token ? escapeTeX(token.content) : "";
  return renderInlineChildren(token.children, opts);
}

function renderInlineChildren(children: Token[], opts: EmitOpts): string {
  let out = "";
  for (const c of children) {
    switch (c.type) {
      case "directive_inline": {
        const name = (c.meta as { name?: string } | undefined)?.name ?? "";
        const params = (c.meta as { params?: Record<string, string> } | undefined)?.params ?? {};
        const inner = c.children ? renderInlineChildren(c.children, opts) : "";
        const entry = opts.template.components[name];
        if (!entry || entry.def.meta.form !== "inline") {
          throw new Error(
            `Unknown inline component ':${name}' — no registered component with form "inline" in template '${opts.template.name}'.`,
          );
        }
        out += entry.def.render(params, inner, opts.ctx);
        break;
      }
      case "text":
        out += escapeTeX(c.content);
        break;
      case "softbreak":
        out += " ";
        break;
      case "hardbreak":
        out += "\\\\\n";
        break;
      case "code_inline":
        out += `\\texttt{${escapeTeX(c.content)}}`;
        break;
      case "strong_open":
        out += "\\textbf{";
        break;
      case "strong_close":
        out += "}";
        break;
      case "em_open":
        out += "\\textit{";
        break;
      case "em_close":
        out += "}";
        break;
      case "s_open":
        out += "\\sout{";
        break;
      case "s_close":
        out += "}";
        break;
      case "link_open":
        out += `\\href{${escapeUrl(c.attrGet?.("href") ?? "")}}{`;
        break;
      case "link_close":
        out += "}";
        break;
      case "image": {
        const ref = c.attrGet?.("src") ?? "";
        let src = ref;
        try {
          src = resolveAssetPath(opts.assetsRoot, ref);
        } catch {
          src = ref;
        }
        out += block(opts, "block:image", "", {
          kind: "image",
          src,
          alt: c.content,
          title: c.attrGet?.("title") || null,
        });
        break;
      }
      case "html_inline":
        out += escapeTeX(c.content);
        break;
      default:
        break;
    }
  }
  return out;
}
```

> NOTE: the inline rule fires **structurally** (a letter-initial `:name` followed by `[`/`{`), independent of registration; registration is validated here at dispatch. An unregistered inline name (or one whose component isn't `form:"inline"`) is a hard error — this is the final behavior. Prose colons (`10:30`, `localhost:8080`) and `:name` without a bracket/brace never enter the rule, so they stay literal and never throw. (Task 5 adds the `raw` branch ahead of this check.)

- [ ] **Step 6: Run inline tests → GREEN, then full suite**

Run: `pnpm --filter druckform exec vitest run tests/unit/inline-directive.test.ts`
Expected: PASS (4 tests).
Run: `pnpm --filter druckform test`
Expected: PASS (the refactor preserves all existing inline rendering; existing tests exercise `renderInlineChildren` via `renderInline`).

- [ ] **Step 7: Commit**

```bash
pnpm biome check packages/druckform/src/latex/inline-directive.ts packages/druckform/src/latex/md-to-latex.ts packages/druckform/src/latex/tokens-to-latex.ts packages/druckform/tests/unit/inline-directive.test.ts packages/druckform/tests/fixtures/templates/inlinetheme/
git add packages/druckform/src/latex packages/druckform/tests/unit/inline-directive.test.ts packages/druckform/tests/fixtures/templates/inlinetheme/
git commit -m "feat(druckform): inline directive rule + registry dispatch"
```

---

### Task 5: `raw` escape hatch + unregistered-name errors

**Files:**
- Modify: `packages/druckform/src/latex/composer.ts` (block: unregistered-name error already exists for `:::`; add `raw` container/leaf verbatim handling)
- Modify: `packages/druckform/src/latex/tokens-to-latex.ts` (inline: `raw` verbatim; unregistered inline name → error)
- Modify: `packages/druckform/src/parse/parser.ts` (capture `raw` container body verbatim)
- Modify: `packages/druckform/src/sdk/types.ts` (`ComponentBlock.rawBody?`)
- Test: `packages/druckform/tests/unit/raw-directive.test.ts` (create)

**Interfaces:**
- Produces: `ComponentBlock.rawBody?: string` (set for `:::raw{…}` containers and `::raw[…]{…}` leaves). A `raw` directive with `params.format === "latex"` emits `rawBody`/content verbatim (no escaping); `format` other than `latex` emits nothing. An inline `:raw[literal]{format=latex}` emits `literal` verbatim. Unregistered non-`raw` names throw a clear error.

- [ ] **Step 1: Write the failing tests**

Create `packages/druckform/tests/unit/raw-directive.test.ts`:

```ts
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { composeDocument } from "../../src/latex/composer.js";
import { mdToLatex } from "../../src/latex/md-to-latex.js";
import { parseMarkdownString } from "../../src/parse/parser.js";
import type { ResolvedTemplate, StyleConfig } from "../../src/sdk/types.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";
import { testCtx } from "../helpers/render-component.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const style: StyleConfig = { $schema: "style-v1", tokens: {} };
let template: ResolvedTemplate;
beforeAll(async () => { template = await resolveTemplate("base", loadAllTemplates(BUNDLED)); });

describe("raw directive", () => {
  it("emits a raw latex container verbatim (unescaped)", () => {
    const doc = parseMarkdownString(':::raw{format=latex}\n\\vspace{2cm} 100% & _x_\n:::\n');
    const { tex } = composeDocument(doc, template, style, new Map(), "/a");
    expect(tex).toContain("\\vspace{2cm} 100% & _x_"); // NOT escaped
  });
  it("skips a raw html container in the LaTeX pipeline", () => {
    const doc = parseMarkdownString(':::raw{format=html}\n<b>hi</b>\n:::\n');
    const { tex } = composeDocument(doc, template, style, new Map(), "/a");
    expect(tex).not.toContain("<b>hi</b>");
  });
  it("emits an inline raw latex span verbatim", () => {
    const out = mdToLatex(':raw[\\LaTeX{}]{format=latex}', { template, ctx: testCtx(), assetsRoot: "/a" });
    expect(out).toContain("\\LaTeX{}");
  });
  it("throws a clear error for an unregistered block directive name", () => {
    const doc = parseMarkdownString(":::nosuch{}\nx\n:::\n");
    expect(() => composeDocument(doc, template, style, new Map(), "/a")).toThrow(/nosuch/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/raw-directive.test.ts`
Expected: FAIL — `raw` is treated as an unknown component (or its body is markdown-escaped).

- [ ] **Step 3: Capture `raw` container body verbatim in `parser.ts`**

Add `rawBody?: string` to `ComponentBlock` in `types.ts`:

```ts
export interface ComponentBlock {
  name: string;
  params: Record<string, string>;
  children: ASTNode[];
  sourceLine: number;
  form: "leaf" | "container";
  /** For the reserved `raw` directive: verbatim body (not markdown-parsed). */
  rawBody?: string;
}
```

In `parser.ts`, in the `containerOpen` branch, special-case `raw` to consume the body verbatim until the closing `:::` (do NOT recurse):

```ts
    if (containerOpen) {
      flushText();
      const name = containerOpen[1] ?? "";
      const params = parseDirectiveAttributes(containerOpen[2] ?? "");
      const sourceLine = i + 1;
      i++;
      if (name === "raw") {
        const rawLines: string[] = [];
        while (i < lines.length && !CONTAINER_CLOSE_RE.test(lines[i] ?? "")) {
          rawLines.push(lines[i] ?? "");
          i++;
        }
        i++; // skip closing :::
        nodes.push({
          type: "component",
          block: { name, params, children: [], sourceLine, form: "container", rawBody: rawLines.join("\n") },
        });
        textStartLine = i + 1;
        continue;
      }
      const [children, closedAt] = parseLines(lines, i);
      i = closedAt + 1;
      nodes.push({ type: "component", block: { name, params, children, sourceLine, form: "container" } });
      textStartLine = i + 1;
      continue;
    }
```

For the leaf branch, capture `rawBody` from `[content]` when `name === "raw"`:

```ts
    const leaf = LEAF_RE.exec(line);
    if (leaf) {
      flushText();
      const name = leaf[1] ?? "";
      const content = leaf[2];
      const params = parseDirectiveAttributes(leaf[3] ?? "");
      const sourceLine = i + 1;
      if (name === "raw") {
        nodes.push({ type: "component", block: { name, params, children: [], sourceLine, form: "leaf", rawBody: content ?? "" } });
      } else {
        const children: ASTNode[] = content ? [{ type: "text", content, sourceLine }] : [];
        nodes.push({ type: "component", block: { name, params, children, sourceLine, form: "leaf" } });
      }
      i++;
      textStartLine = i + 1;
      continue;
    }
```

- [ ] **Step 4: Handle `raw` + unregistered names in the composer (block path)**

In `packages/druckform/src/latex/composer.ts`, `renderNode`'s component branch currently throws `Unknown component '<name>'` when `template.components[block.name]` is missing. Add `raw` handling BEFORE the registry lookup. Locate the component branch (after the `block:`/`document` guard) and insert:

```ts
    if (block.name === "raw") {
      return block.params.format === "latex" ? (block.rawBody ?? "") : "";
    }
```

The existing `Unknown component` throw already satisfies the unregistered-name requirement for block directives (it names the component). Leave it.

- [ ] **Step 5: Handle inline `raw` + unregistered inline names in `tokens-to-latex.ts`**

In the `directive_inline` case added in Task 4, handle `raw` and turn the unregistered fallback into a hard error. Replace that case body with:

```ts
      case "directive_inline": {
        const name = (c.meta as { name?: string } | undefined)?.name ?? "";
        const params = (c.meta as { params?: Record<string, string> } | undefined)?.params ?? {};
        if (name === "raw") {
          out += params.format === "latex" ? ((c.meta as { rawContent?: string }).rawContent ?? "") : "";
          break;
        }
        const inner = c.children ? renderInlineChildren(c.children, opts) : "";
        const entry = opts.template.components[name];
        if (!entry || entry.def.meta.form !== "inline") {
          throw new Error(
            `Unknown inline component ':${name}' — no registered component with form "inline" in template '${opts.template.name}'.`,
          );
        }
        out += entry.def.render(params, inner, opts.ctx);
        break;
      }
```

For inline `raw` to carry its verbatim content, update the inline rule (`inline-directive.ts`) to stash raw content unparsed: when `name === "raw"`, set `token.meta.rawContent = content ?? ""` and skip child parsing. In `inlineDirectivePlugin`, before `token.children = …`, add:

```ts
    if (name === "raw") {
      token.meta = { name, params: parseDirectiveAttributes(attrStr), rawContent: content ?? "" };
      token.children = [];
      state.pos = cur;
      return true;
    }
```

(place this immediately after `const token = state.push(...)` and before the generic `token.meta = …` assignment; make the generic assignment the `else`.)

- [ ] **Step 6: Run raw tests → GREEN, then full suite**

Run: `pnpm --filter druckform exec vitest run tests/unit/raw-directive.test.ts`
Expected: PASS.
Run: `pnpm --filter druckform test`
Expected: PASS. (Task 4 already made unregistered inline names throw, so no earlier test needs changing; Step 5 only added the `raw` branch ahead of that check and the block-path `raw` handling.)

- [ ] **Step 7: Commit**

```bash
pnpm biome check packages/druckform/src/parse/parser.ts packages/druckform/src/sdk/types.ts packages/druckform/src/latex/composer.ts packages/druckform/src/latex/tokens-to-latex.ts packages/druckform/src/latex/inline-directive.ts packages/druckform/tests/unit/raw-directive.test.ts packages/druckform/tests/unit/inline-directive.test.ts
git add -A packages/druckform/src packages/druckform/tests
git commit -m "feat(druckform): raw{format} escape hatch + unregistered-directive errors"
```

---

### Task 6: Docs + migrate active in-repo `:::` usages

Pure documentation + the remaining in-repo migration. No unit tests; verify claims against the shipped parser/rule.

**Files:**
- Modify: `claude-plugin/skills/druckform-authoring/SKILL.md`, `docs/extending-druckform.md`, `docs/authoring.md`
- Modify (migrate): any `templates/examples/**` + `docs/examples-gallery.md` `:::` invocations

**Prerequisite:** read `src/parse/parser.ts`, `src/latex/inline-directive.ts`, `src/latex/directive-attrs.ts` (via `src/parse/`), and `src/sdk/types.ts` (`meta.form`) so prose matches code.

- [ ] **Step 1: Migrate the doc examples to the new container syntax**

In `docs/authoring.md` and `docs/extending-druckform.md`, rewrite every `::: name key="value"` to `:::name{key="value"}`. If `templates/examples/**` or `docs/examples-gallery.md` contain `:::` invocations, migrate them too (`grep -rn "^::: " docs templates | grep -v superpowers/plans`).

- [ ] **Step 2: Document the three forms + attribute model**

Add a "Directive components" section (to `SKILL.md` and `docs/extending-druckform.md`) covering:
- inline `:name[content]{attrs}`, leaf `::name[content]{attrs}`, container `:::name{attrs} … :::` — distinguished by colon count.
- attribute model `{#id .class key=val}` (id last-wins, classes combine, quoted/bare values).
- `meta.form: "inline" | "leaf" | "container"` (default container); inline components must emit inline LaTeX, leaf/container emit block LaTeX.
- the inline firing rule (must be followed by `[`/`{`, letter-initial, registered) and the `\:` escape.

- [ ] **Step 3: Document the `raw` escape hatch**

State: `:::raw{format=latex} … :::` / `::raw[…]{format=latex}` / `:raw[…]{format=latex}` emit their content verbatim (unescaped) in the LaTeX pipeline; `format=html` is for a future Obsidian renderer and is skipped by druckform. Note it's the way to drop raw LaTeX that the component model can't express.

- [ ] **Step 4: Note portability (Obsidian) intent**

One paragraph: the syntax follows the CommonMark generic-directives convention (micromark/remark-compatible) specifically so the same document can later be rendered by an Obsidian plugin; that plugin is not part of druckform.

- [ ] **Step 5: Verify + commit**

- `grep -rn "::: [a-z].*=\"" docs claude-plugin | grep -v superpowers/plans` → should be empty (no old-syntax examples remain in active docs).
- Confirm documented names match code (`meta.form`, `raw`, `{#id .class}`), no rich claims beyond what's implemented.
- biome does not process `.md` (no-op) — skip.

```bash
git add claude-plugin/skills/druckform-authoring/SKILL.md docs/extending-druckform.md docs/authoring.md docs/examples-gallery.md packages/druckform/templates/examples
git commit -m "docs(druckform): document directive components (inline/leaf/container) + migrate examples"
```

---

## Notes for the implementer

- **Task order 1→6.** Task 1 (attrs) underpins 2 and 4. Task 2 (block grammar) is the breaking parser change — it migrates in-repo test docs/fixtures with it. Task 3 (form) gates Task 4's inline dispatch. Task 5 layers `raw` + errors on top. Task 6 is docs + remaining doc migration.
- **The markdown-it inline rule (Task 4) is the riskiest piece.** Its test is the arbiter: registered inline fires with inline-markdown content; prose colons and no-bracket cases stay literal. If `md.parseInline` child extraction misbehaves, inspect the token shape it returns rather than weakening the test.
- **Container behavior must not regress.** The composer reads `block.name/params/children` and doesn't branch on `form`, so existing `:::` components render as before once migrated to the new attribute syntax.
- **Keep the branch biome-clean** — run `pnpm biome check` before each commit.
