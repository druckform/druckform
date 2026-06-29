# Authoring DX Phase 5 — Agent Surface

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give agents a reliable, low-knowledge way to author and verify druckform components/templates: an authoring skill, MCP authoring tools (`scaffold_component`, `validate_component`) that drive the Phase 2–4 CLI inside `DRUCKFORM_TEMPLATES_DIR`, a curated examples gallery, and a richer `list_components` that hands an agent the exact contract it must produce.

**Architecture:** This phase is glue. The MCP `cli-runner` already shells out to the `druck` binary; we add runners for `druck doctor` (Phase 2) and `druck new` (Phase 4), then expose them as MCP tools that mirror `render-markdown.ts`/`list-job-files.ts` and confine all writes to `DRUCKFORM_TEMPLATES_DIR`. `list_components` is enriched at its source (`src/commands/components.ts`) by threading the component source path through the resolver. The authoring skill (built with `superpowers:writing-skills`) encodes the contract and the author→doctor→preview loop.

**Tech Stack:** TypeScript (ESM), `zod`, `vitest`, MCP SDK, pnpm workspace.

## Global Constraints

- Node.js ≥ 22; pnpm; tests via `vitest`. Run all commands from repo root: `/Users/torbenhartmann/Documents/customers/private/druckform`.
- **Commit after each task** with `git add` of exactly the files that task touched.
- Existing tests must keep passing; changes are additive.
- **Depends on earlier phases (assume present):** P1 (in-process loader, `renderComponent` helper), P2 (`druck doctor --template <t> [--json]` → `LintContract`), P3 (`druck preview-component` + MCP `preview_component`), P4 (`druck new component|template ... [--json]` emitting `{ created: string[] }`, and component auto-discovery).
- MCP authoring tools must **only** write within `DRUCKFORM_TEMPLATES_DIR` and must reject names containing path separators or `..`.
- Design source: `docs/superpowers/specs/2026-06-29-authoring-dx-design.md` §3 Phase 5.

---

### Task 1: Richer `list_components` (source, acceptsElement, contractVersion)

**Files:**
- Modify: `packages/druckform/src/sdk/types.ts` (extend `ComponentsContract` items; add `ResolvedComponentEntry.sourcePath`; add `COMPONENT_CONTRACT_VERSION`)
- Modify: `packages/druckform/src/template/resolver.ts` (thread `sourcePath` into the resolved entry)
- Modify: `packages/druckform/src/commands/components.ts` (emit `source`, `acceptsElement`, `contractVersion`)
- Test: `packages/druckform/tests/integration/list-components-rich.test.ts`

**Interfaces:**
- Produces: `ComponentsContract.components[]` gains `source?: string`, `acceptsElement: boolean`, `contractVersion: string`. `ResolvedComponentEntry` gains `sourcePath: string`. `COMPONENT_CONTRACT_VERSION: string` exported from `src/sdk/types.ts`.

- [ ] **Step 1: Write the failing test** — `tests/integration/list-components-rich.test.ts`:
```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { componentsCommand } from "../../src/commands/components.js";
import { vi } from "vitest";

describe("rich list_components", () => {
  it("includes source, acceptsElement, and contractVersion", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      writes.push(String(s));
      return true;
    });
    await componentsCommand("base", true);
    vi.restoreAllMocks();
    const out = JSON.parse(writes.join(""));
    const table = out.components.find((c: { name: string }) => c.name === "block:table");
    expect(table.contractVersion).toBe("1");
    expect(table.acceptsElement).toBe(true); // block:table reads `element`
    expect(typeof table.source).toBe("string");
    expect(table.source).toContain("export const meta");
    const infobox = out.components.find((c: { name: string }) => c.name === "infobox");
    expect(infobox.acceptsElement).toBe(false); // declarative infobox: no element/{{body}}
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/integration/list-components-rich.test.ts`
Expected: FAIL (`contractVersion`/`acceptsElement`/`source` undefined).

- [ ] **Step 3: Extend the types** — in `packages/druckform/src/sdk/types.ts`:

Add near the top of the contracts section:
```ts
/** Bump when the component authoring contract changes shape. */
export const COMPONENT_CONTRACT_VERSION = "1";
```
Change `ComponentsContract` items to:
```ts
export interface ComponentsContract {
  schemaVersion: "1";
  template: string;
  components: Array<{
    name: string;
    description: string;
    params: Record<string, unknown>; // JSON Schema
    acceptsChildren: boolean;
    acceptsElement: boolean; // reads the BlockElement/DocumentLayout payload
    contractVersion: string;
    example?: string;
    source?: string; // raw component source text
  }>;
}
```
Add `sourcePath` to `ResolvedComponentEntry`:
```ts
export interface ResolvedComponentEntry {
  def: ComponentDef;
  defaults: Record<string, string>; // merged param defaults from inheritance chain
  sourcePath: string; // absolute path to the component source file
}
```

- [ ] **Step 4: Thread `sourcePath` through the resolver** — in `packages/druckform/src/template/resolver.ts`, the load loop currently builds `components[compName] = { def, defaults }`. The `sourcePath` is already in scope (the `mergedComponents` entry). Change the load to:
```ts
    [...mergedComponents.entries()].map(async ([compName, { sourcePath, defaults }]) => {
      const def = await loadComponent(sourcePath, "");
      components[compName] = { def, defaults, sourcePath };
    }),
```

- [ ] **Step 5: Emit the new fields in `components.ts`** — in `packages/druckform/src/commands/components.ts`, add `import fs from "node:fs"` is already present; add the contract-version import and read source per component:
```ts
import { COMPONENT_CONTRACT_VERSION, type ComponentsContract } from "../sdk/types.js";
// ...
  const contract: ComponentsContract = {
    schemaVersion: "1",
    template,
    components: Object.values(resolved.components).map(({ def, sourcePath }) => {
      const source = (() => {
        try {
          return fs.readFileSync(sourcePath, "utf8");
        } catch {
          return undefined;
        }
      })();
      return {
        name: def.meta.name,
        description: def.meta.description,
        params: def.jsonSchema,
        acceptsChildren: def.meta.acceptsChildren,
        // Heuristic: TS components read `element`; declarative document shells use {{body}}.
        acceptsElement: source ? /\belement\b/.test(source) || source.includes("{{body}}") : false,
        contractVersion: COMPONENT_CONTRACT_VERSION,
        ...(def.meta.example !== undefined ? { example: def.meta.example } : {}),
        ...(source !== undefined ? { source } : {}),
      };
    }),
  };
```
(Replace the existing `components:` mapping; keep the human-readable `else` branch below unchanged.)

- [ ] **Step 6: Run the test + typecheck**

Run:
```bash
pnpm --filter druckform exec vitest run tests/integration/list-components-rich.test.ts
pnpm --filter druckform typecheck
```
Expected: PASS; `tsc` clean. (Search for other constructors of `ResolvedComponentEntry` — only `resolver.ts` builds it; if any test constructs one, add `sourcePath`.)

- [ ] **Step 7: Run the full suite (the contract shape changed)**

Run: `pnpm --filter druckform exec vitest run`
Expected: all pass (the `list-templates`/`components` cli-runner tests parse the contract loosely).

- [ ] **Step 8: Commit**
```bash
git add packages/druckform/src/sdk/types.ts packages/druckform/src/template/resolver.ts packages/druckform/src/commands/components.ts packages/druckform/tests/integration/list-components-rich.test.ts
git commit -m "feat(druckform): enrich list_components with source, acceptsElement, contractVersion"
```

---

### Task 2: cli-runner authoring runners (`doctor`, `new`)

**Files:**
- Modify: `packages/druckform-mcp/src/cli-runner.ts`
- Test: `packages/druckform-mcp/tests/cli-runner.test.ts`

**Interfaces:**
- Produces:
  - `doctorTemplate(template: string): LintContract`
  - `newComponent(template: string, name: string, kind: "ts" | "yaml", acceptsChildren: boolean): { created: string[] }`
  - `newTemplate(name: string, extendsName?: string): { created: string[] }`

- [ ] **Step 1: Write the failing test** — extend `packages/druckform-mcp/tests/cli-runner.test.ts` (it already sets `DRUCK_BIN` to the built CLI in `beforeAll`, and has an `afterEach` that removes `tmp`):
```ts
import { doctorTemplate, newComponent } from "../src/cli-runner.js";
// ...inside describe("cli-runner", ...):
  it("doctorTemplate returns a LintContract for the base template", () => {
    const result = doctorTemplate("base");
    expect(result.schemaVersion).toBe("1");
    expect(typeof result.ok).toBe("boolean");
  });

  it("newComponent scaffolds into DRUCKFORM_TEMPLATES_DIR", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cli-new-"));
    // a minimal user template to scaffold into
    fs.mkdirSync(path.join(tmp, "acme", "components"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "acme", "template.yaml"),
      "name: acme\nextends: base\ncomponents: {}\n",
      "utf8",
    );
    const prev = process.env.DRUCKFORM_TEMPLATES_DIR;
    process.env.DRUCKFORM_TEMPLATES_DIR = tmp;
    try {
      const result = newComponent("acme", "banner", "ts", true);
      expect(result.created.length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(tmp, "acme", "components", "banner.ts"))).toBe(true);
    } finally {
      process.env.DRUCKFORM_TEMPLATES_DIR = prev;
    }
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter druckform-mcp exec vitest run tests/cli-runner.test.ts`
Expected: FAIL (`doctorTemplate`/`newComponent` not exported).

- [ ] **Step 3: Implement the runners** — in `packages/druckform-mcp/src/cli-runner.ts`, add `LintContract` is already imported; add:
```ts
export function doctorTemplate(template: string): LintContract {
  return JSON.parse(runOrThrow(["doctor", "--template", template])) as LintContract;
}

export function newComponent(
  template: string,
  name: string,
  kind: "ts" | "yaml",
  acceptsChildren: boolean,
): { created: string[] } {
  const args = ["new", "component", "--template", template, "--name", name, "--kind", kind];
  if (acceptsChildren) args.push("--accepts-children");
  return JSON.parse(runOrThrow(args)) as { created: string[] };
}

export function newTemplate(name: string, extendsName?: string): { created: string[] } {
  const args = ["new", "template", "--name", name];
  if (extendsName) args.push("--extends", extendsName);
  return JSON.parse(runOrThrow(args)) as { created: string[] };
}
```
(`run()` uses `spawnSync` which inherits `process.env`, so the MCP server's `DRUCKFORM_TEMPLATES_DIR` reaches `druck new` automatically.)

- [ ] **Step 4: Run the test + typecheck**

Run:
```bash
pnpm --filter druckform-mcp exec vitest run tests/cli-runner.test.ts
pnpm --filter druckform-mcp typecheck
```
Expected: PASS; `tsc` clean.

- [ ] **Step 5: Commit**
```bash
git add packages/druckform-mcp/src/cli-runner.ts packages/druckform-mcp/tests/cli-runner.test.ts
git commit -m "feat(druckform-mcp): cli-runner support for druck doctor and druck new"
```

---

### Task 3: `validate_component` MCP tool

**Files:**
- Create: `packages/druckform-mcp/src/tools/validate-component.ts`
- Create: `packages/druckform-mcp/src/template-guard.ts` (shared name guard)
- Test: `packages/druckform-mcp/tests/validate-component.test.ts`

**Interfaces:**
- Produces: `assertSafeTemplateName(name: string): void` (throws on `/`, `\`, `..`, empty); `makeValidateComponentTool()` → tool with `validate_component({ template })`.

- [ ] **Step 1: Write the failing test** — `tests/validate-component.test.ts` (mock the cli-runner, mirroring `render-markdown.test.ts`):
```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/cli-runner.js", () => ({
  doctorTemplate: vi.fn(() => ({
    schemaVersion: "1",
    ok: false,
    findings: [{ severity: "error", component: "banner", message: "missing render" }],
  })),
}));

import { doctorTemplate } from "../src/cli-runner.js";
import { makeValidateComponentTool } from "../src/tools/validate-component.js";

afterEach(() => vi.clearAllMocks());

async function call(args: unknown): Promise<Record<string, unknown>> {
  const tool = makeValidateComponentTool();
  return JSON.parse((await tool.handler(args)).content[0].text);
}

describe("validate_component", () => {
  it("returns the doctor findings for a template", async () => {
    const out = await call({ template: "acme" });
    expect(out.ok).toBe(false);
    expect((out.findings as unknown[]).length).toBe(1);
    expect(doctorTemplate).toHaveBeenCalledWith("acme");
  });

  it("rejects unsafe template names", async () => {
    await expect(call({ template: "../etc" })).rejects.toThrow(/invalid template name/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails** (`Cannot find module ../src/tools/validate-component.js`).

- [ ] **Step 3: Implement the name guard** — `packages/druckform-mcp/src/template-guard.ts`:
```ts
// Authoring tools may only address templates by a bare name inside
// DRUCKFORM_TEMPLATES_DIR — never a path. Reject separators and traversal.
export function assertSafeTemplateName(name: string): void {
  if (!name || /[\\/]/.test(name) || name.includes("..") || name.startsWith(".")) {
    throw new Error(`Invalid template name: '${name}'`);
  }
}
```

- [ ] **Step 4: Implement the tool** — `packages/druckform-mcp/src/tools/validate-component.ts`:
```ts
import { z } from "zod";
import { doctorTemplate } from "../cli-runner.js";
import { assertSafeTemplateName } from "../template-guard.js";

const schema = z.object({ template: z.string() });

export function makeValidateComponentTool() {
  return {
    name: "validate_component",
    description:
      "Validate a template's components against the authoring contract (runs `druck doctor`). Returns lint findings.",
    inputSchema: {
      type: "object",
      properties: { template: { type: "string", description: "Template name" } },
      required: ["template"],
    },
    handler: async (args: unknown) => {
      const { template } = schema.parse(args);
      assertSafeTemplateName(template);
      const result = doctorTemplate(template);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  };
}
```

- [ ] **Step 5: Run the test + typecheck**

Run:
```bash
pnpm --filter druckform-mcp exec vitest run tests/validate-component.test.ts
pnpm --filter druckform-mcp typecheck
```
Expected: PASS; `tsc` clean.

- [ ] **Step 6: Commit**
```bash
git add packages/druckform-mcp/src/tools/validate-component.ts packages/druckform-mcp/src/template-guard.ts packages/druckform-mcp/tests/validate-component.test.ts
git commit -m "feat(druckform-mcp): add validate_component tool (wraps druck doctor)"
```

---

### Task 4: `scaffold_component` MCP tool

**Files:**
- Create: `packages/druckform-mcp/src/tools/scaffold-component.ts`
- Test: `packages/druckform-mcp/tests/scaffold-component.test.ts`

**Interfaces:**
- Produces: `makeScaffoldComponentTool()` → tool with `scaffold_component({ template, name, kind?, acceptsChildren? })` → `{ created: string[] }`.

- [ ] **Step 1: Write the failing test** — `tests/scaffold-component.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/cli-runner.js", () => ({
  newComponent: vi.fn(() => ({ created: ["templates/acme/components/banner.ts"] })),
}));

import { newComponent } from "../src/cli-runner.js";
import { makeScaffoldComponentTool } from "../src/tools/scaffold-component.js";

afterEach(() => vi.clearAllMocks());

async function call(args: unknown): Promise<Record<string, unknown>> {
  const tool = makeScaffoldComponentTool();
  return JSON.parse((await tool.handler(args)).content[0].text);
}

describe("scaffold_component", () => {
  it("scaffolds a component and returns the created paths", async () => {
    const out = await call({ template: "acme", name: "banner", kind: "ts", acceptsChildren: true });
    expect((out.created as string[]).length).toBe(1);
    expect(newComponent).toHaveBeenCalledWith("acme", "banner", "ts", true);
  });

  it("rejects unsafe template or component names", async () => {
    await expect(call({ template: "acme", name: "../x" })).rejects.toThrow(/invalid/i);
  });

  it("defaults kind to ts and acceptsChildren to false", async () => {
    await call({ template: "acme", name: "banner" });
    expect(newComponent).toHaveBeenCalledWith("acme", "banner", "ts", false);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement** — `packages/druckform-mcp/src/tools/scaffold-component.ts`:
```ts
import { z } from "zod";
import { newComponent } from "../cli-runner.js";
import { assertSafeTemplateName } from "../template-guard.js";

const schema = z.object({
  template: z.string(),
  name: z.string(),
  kind: z.enum(["ts", "yaml"]).default("ts"),
  acceptsChildren: z.boolean().default(false),
});

export function makeScaffoldComponentTool() {
  return {
    name: "scaffold_component",
    description:
      "Create a new component (with a starter test) in a template under DRUCKFORM_TEMPLATES_DIR. Returns the created file paths. Then validate_component and preview_component to verify.",
    inputSchema: {
      type: "object",
      properties: {
        template: { type: "string", description: "Target template name" },
        name: { type: "string", description: "Component name" },
        kind: { type: "string", enum: ["ts", "yaml"], description: "Component kind (default ts)" },
        acceptsChildren: { type: "boolean", description: "Whether it accepts ::: children" },
      },
      required: ["template", "name"],
    },
    handler: async (args: unknown) => {
      const { template, name, kind, acceptsChildren } = schema.parse(args);
      assertSafeTemplateName(template);
      assertSafeTemplateName(name); // same rule: bare name, no path
      const result = newComponent(template, name, kind, acceptsChildren);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  };
}
```

- [ ] **Step 4: Run the test + typecheck.**

- [ ] **Step 5: Commit**
```bash
git add packages/druckform-mcp/src/tools/scaffold-component.ts packages/druckform-mcp/tests/scaffold-component.test.ts
git commit -m "feat(druckform-mcp): add scaffold_component tool (wraps druck new, scoped to templates dir)"
```

---

### Task 5: Register the authoring tools

**Files:**
- Modify: `packages/druckform-mcp/src/mcp-server.ts`
- Test: `packages/druckform-mcp/tests/tool-descriptions.test.ts` (assert the new tools exist)

**Interfaces:** Consumes `makeValidateComponentTool`, `makeScaffoldComponentTool` (Tasks 3–4). `preview_component` (P3) is assumed already registered.

- [ ] **Step 1: Write the failing test** — extend `tests/tool-descriptions.test.ts`:
```ts
import { makeValidateComponentTool } from "../src/tools/validate-component.js";
import { makeScaffoldComponentTool } from "../src/tools/scaffold-component.js";

it("exposes the authoring tools", () => {
  expect(makeValidateComponentTool().name).toBe("validate_component");
  expect(makeScaffoldComponentTool().name).toBe("scaffold_component");
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Register in `mcp-server.ts`** — add imports and registrations alongside the existing job tools:
```ts
import { makeScaffoldComponentTool } from "./tools/scaffold-component.js";
import { makeValidateComponentTool } from "./tools/validate-component.js";
// ...after the existing tool registrations, before transport:
  const validateComponentTool = makeValidateComponentTool();
  server.tool(
    validateComponentTool.name,
    validateComponentTool.description,
    { template: z.string() },
    async (args) => validateComponentTool.handler(args),
  );

  const scaffoldTool = makeScaffoldComponentTool();
  server.tool(
    scaffoldTool.name,
    scaffoldTool.description,
    {
      template: z.string(),
      name: z.string(),
      kind: z.enum(["ts", "yaml"]).optional(),
      acceptsChildren: z.boolean().optional(),
    },
    async (args) => scaffoldTool.handler(args),
  );
```

- [ ] **Step 4: Run the test + full mcp suite + typecheck + build**

Run:
```bash
pnpm --filter druckform-mcp exec vitest run
pnpm --filter druckform-mcp typecheck
pnpm --filter druckform-mcp build
```
Expected: PASS; `tsc` clean; build succeeds.

- [ ] **Step 5: Commit**
```bash
git add packages/druckform-mcp/src/mcp-server.ts packages/druckform-mcp/tests/tool-descriptions.test.ts
git commit -m "feat(druckform-mcp): register validate_component and scaffold_component"
```

---

### Task 6: Examples gallery

**Files:**
- Create: `packages/druckform/templates/examples/template.yaml`
- Create: `packages/druckform/templates/examples/components/fancy-table.ts`
- Create: `packages/druckform/templates/examples/components/callout.ts`
- Create: `packages/druckform/templates/examples/components/document.ts`
- Create: `docs/examples-gallery.md`
- Test: `packages/druckform/tests/integration/examples-gallery.test.ts`

**Interfaces:** Consumes the component contract; each component must pass `druck doctor` (P2).

- [ ] **Step 1: Write the failing test** — `tests/integration/examples-gallery.test.ts`:
```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const DIR = path.resolve(import.meta.dirname, "../../templates/examples/components");

describe("examples gallery", () => {
  it("callout renders a variant-styled box", async () => {
    const out = await renderComponent(path.join(DIR, "callout.ts"), { variant: "warn", title: "Heads up" }, {
      children: "Body",
    });
    expect(out).toContain("Body");
    expect(out).toContain("\\begin{callout}");
  });

  it("document shell emits the body marker and not the engine core", async () => {
    const out = await renderComponent(path.join(DIR, "document.ts"), {}, {
      element: {
        kind: "document",
        documentclass: "article",
        stylePreamble: "%S",
        componentPreamble: "%C",
        frontmatter: {},
      },
    });
    expect(out).toContain("DRUCKFORM_BODY");
    expect(out).not.toContain("\\documentclass");
  });

  it("fancy-table renders a tabularx from a table element", async () => {
    const out = await renderComponent(path.join(DIR, "fancy-table.ts"), {}, {
      element: { kind: "table", alignments: ["left", "right"], header: ["A", "B"], rows: [["1", "2"]] },
    });
    expect(out).toContain("\\begin{tabularx}");
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Create `templates/examples/template.yaml`**:
```yaml
name: examples
description: "Canonical example components for authors to copy."
extends: base
components:
  "block:table":
    source: components/fancy-table.ts
  document:
    source: components/document.ts
  callout:
    source: components/callout.ts
style:
  tokens:
    colors:
      accent: "#2E5AAC"
      warning: "#B26A00"
```

- [ ] **Step 4: Create `components/callout.ts`** (param + children + token, the most-copied pattern):
```ts
import { Tex, raw, tokenRef } from "druckform";
import type { Component, RenderCtx } from "druckform";
import { z } from "zod";

export const schema = z.object({
  variant: z.enum(["info", "warn", "danger"]).default("info"),
  title: z.string(),
  accent: tokenRef("accent"),
  warning: tokenRef("warning"),
});

export const meta = {
  name: "callout",
  description: "Variant-styled callout box with a title.",
  acceptsChildren: true,
  example: '::: callout variant="warn" title="Heads up"\nBody\n:::',
};

export const preamble = `\\newenvironment{callout}[2]{%
  \\par\\vspace{0.5em}\\noindent{\\leavevmode#1\\bfseries#2}\\par
  \\noindent\\rule{\\linewidth}{0.5pt}\\par\\smallskip\\noindent\\ignorespaces
}{\\par\\vspace{0.5em}}`;

export const render: Component<typeof schema> = (params, children, ctx: RenderCtx) => {
  const color = params.variant === "warn" ? ctx.token(params.warning) : ctx.token(params.accent);
  return Tex`\begin{callout}{${raw(color)}}{${params.title}}
${raw(children)}
\end{callout}`;
};
```

- [ ] **Step 5: Create `components/document.ts`** (a titled document shell — the canonical override):
```ts
import { z } from "zod";
import type { BlockElement, DocumentLayout, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "document", description: "Titled A4 document shell", acceptsChildren: true };

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement | DocumentLayout,
): string {
  if (!element || element.kind !== "document") return "DRUCKFORM_BODY";
  const title = element.frontmatter.title;
  return [
    element.stylePreamble,
    element.componentPreamble,
    "\\usepackage[a4paper,margin=2.5cm]{geometry}",
    "\\begin{document}",
    title ? `\\section*{${title}}` : "",
    "DRUCKFORM_BODY",
    "\\end{document}",
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}
```

- [ ] **Step 6: Create `components/fancy-table.ts`** (a `block:` override — the canonical structured element):
```ts
import { z } from "zod";
import type { BlockElement, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "block:table", description: "Booktabs table with a shaded header", acceptsChildren: false };
export const preamble = ["\\usepackage{tabularx}", "\\usepackage{booktabs}", "\\usepackage{array}"].join("\n");

function col(a: "left" | "center" | "right" | null): string {
  if (a === "center") return ">{\\centering\\arraybackslash}X";
  if (a === "right") return ">{\\raggedleft\\arraybackslash}X";
  return ">{\\raggedright\\arraybackslash}X";
}

export function render(
  _p: unknown,
  _c: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "table") return "";
  const cols = element.alignments.map(col).join("");
  const header = `${element.header.map((c) => `\\textbf{${c}}`).join(" & ")} \\\\`;
  const body = element.rows.map((r) => `${r.join(" & ")} \\\\`).join("\n");
  return [`\\begin{tabularx}{\\linewidth}{${cols}}`, "\\toprule", header, "\\midrule", body, "\\bottomrule", "\\end{tabularx}"].join("\n");
}
```

- [ ] **Step 7: Verify the gallery passes `doctor` and renders**

Run:
```bash
pnpm --filter druckform exec vitest run tests/integration/examples-gallery.test.ts
pnpm --filter druckform build
node packages/druckform/dist/cli.js doctor --template examples --json
```
Expected: tests PASS; `doctor` reports `"ok": true` (no findings).

- [ ] **Step 8: Write the gallery doc** — `docs/examples-gallery.md`: a short page introducing the `examples` template, then for each of the three components: what it demonstrates (param+children+token / document shell / block override), and a fenced code block with its full source (copy from the files above). End with: "Copy one into your template's `components/`, rename `meta.name`, run `druck doctor` and `druck preview-component`."

- [ ] **Step 9: Commit**
```bash
git add packages/druckform/templates/examples docs/examples-gallery.md packages/druckform/tests/integration/examples-gallery.test.ts
git commit -m "feat(druckform): add examples gallery (callout, document shell, table override)"
```

---

### Task 7: Authoring skill

**Files:**
- Create: `claude-plugin/skills/druckform-authoring/SKILL.md` (+ any reference files the skill needs)

**Interfaces:** none (documentation/skill artifact).

- [ ] **Step 1: Build the skill with the writing-skills discipline**

Invoke `superpowers:writing-skills` and author a **new** skill at `claude-plugin/skills/druckform-authoring/SKILL.md` (separate from the consume-focused `claude-plugin/skills/druckform/SKILL.md`). The skill's `description` must trigger on authoring intent ("create/add a druckform component or template", "write a block override", "make a document shell"). Its body MUST encode:
  - **The contract:** a TS component exports `schema` (zod), `meta` (`name`/`description`/`acceptsChildren`/optional `example`), and `render(params, children, ctx, element?)`; declarative components are `*.component.yaml` with `params`/`slots`/`emits`.
  - **The 4th arg** is `BlockElement | DocumentLayout`, set only for built-in `block:*` and the `document` shell.
  - **Escaping:** `escapeTeX` user strings; wrap trusted LaTeX (`children`, `ctx.token(...)`) in `raw()`; declare token params with `tokenRef("name")` (derives `requiredTokens`).
  - **Reserved names:** `block:*` and `document` are reserved; a `document` override must emit the `DRUCKFORM_BODY` marker and must NOT emit `\documentclass`/engine-core packages (composer injects them).
  - **The loop:** `scaffold_component`/`druck new` → edit → `validate_component`/`druck doctor` → `preview_component`/`druck preview-component` → iterate. Reference the examples gallery (Task 6) for canonical patterns and `list_components` (Task 1) for the exact contract fields.

- [ ] **Step 2: Verify the skill loads/validates** per the writing-skills skill's own verification step (frontmatter well-formed, description present).

- [ ] **Step 3: Commit**
```bash
git add claude-plugin/skills/druckform-authoring
git commit -m "docs(druckform): add druckform-authoring skill (contract + author→doctor→preview loop)"
```

---

### Task 8: Docs + changeset

**Files:**
- Modify: `docs/extending-druckform.md` (cross-link the gallery + authoring tools + the loop)
- Modify: `claude-plugin/skills/druckform/SKILL.md` (cross-link to the authoring skill + new MCP tools)
- Create: `.changeset/authoring-dx-agent-surface.md`

- [ ] **Step 1: Update `docs/extending-druckform.md`** — add an "Authoring loop" note in §5 (Creating a component) pointing to `druck new` → `druck doctor` → `druck preview-component`, link `docs/examples-gallery.md`, and document the enriched `list_components` fields (`source`, `acceptsElement`, `contractVersion`) in the MCP §2 table footnotes.

- [ ] **Step 2: Update the `druckform` skill** — in `claude-plugin/skills/druckform/SKILL.md`, add `validate_component` and `scaffold_component` to the MCP Tools table and a one-line pointer to the `druckform-authoring` skill for authoring tasks.

- [ ] **Step 3: Changeset** — `.changeset/authoring-dx-agent-surface.md`:
```markdown
---
"druckform": minor
"druckform-mcp": minor
---

Authoring agent surface: `list_components` now returns each component's source,
an `acceptsElement` flag, and a contract version. New MCP tools `scaffold_component`
and `validate_component` drive `druck new`/`druck doctor` within
DRUCKFORM_TEMPLATES_DIR. Adds an examples gallery (`examples` template) and a
`druckform-authoring` skill encoding the component/template contract and the
scaffold → doctor → preview loop.
```

- [ ] **Step 4: Commit**
```bash
git add docs/extending-druckform.md claude-plugin/skills/druckform/SKILL.md .changeset/authoring-dx-agent-surface.md
git commit -m "docs(druckform): document the authoring agent surface (Phase 5)"
```

---

## Final verification
```bash
pnpm --filter druckform exec vitest run && pnpm --filter druckform-mcp exec vitest run
pnpm lint && pnpm turbo typecheck && pnpm turbo build && pnpm turbo test
node packages/druckform/dist/cli.js doctor --template examples --json   # ok: true
```

## Self-Review

**Spec coverage (§3 Phase 5):** authoring skill (Task 7) · MCP `scaffold_component`/`validate_component` scoped to `DRUCKFORM_TEMPLATES_DIR` (Tasks 3–4, guard in `template-guard.ts`, registered Task 5) · `preview_component` reused (P3, registered there) · examples gallery (Task 6) · richer `list_components` with `source`/`acceptsElement`/`contractVersion` (Task 1).

**Placeholder scan:** every code step shows complete code; the skill task (7) intentionally delegates content generation to `superpowers:writing-skills` but enumerates the exact required contents.

**Type consistency:** `ResolvedComponentEntry.sourcePath` is added (Task 1) and consumed only in `components.ts`; `ComponentsContract` item fields (`acceptsElement`, `contractVersion`, `source`) are defined in Task 1 and asserted in its test. cli-runner returns (`LintContract`, `{ created: string[] }`) match the tool consumers in Tasks 3–4. `assertSafeTemplateName` is defined once (`template-guard.ts`) and used by both authoring tools.

**Dependency assumptions (documented in Global Constraints):** `druck doctor --json`→`LintContract` (P2), `druck new ... --json`→`{ created: string[] }` (P4), MCP `preview_component` (P3), `renderComponent` helper (P1). If P4's `druck new` JSON shape differs, adjust the `newComponent`/`newTemplate` parse in Task 2 to match.