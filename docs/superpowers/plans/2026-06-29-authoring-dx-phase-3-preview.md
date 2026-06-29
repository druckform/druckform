# Authoring DX Phase 3 — Preview Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give authors a fast, isolated author→verify loop — render a single component with sample params/children into a PDF without hand-writing a document — via a `druck preview-component` CLI command (with `--watch`) and an MCP `preview_component` tool.

**Architecture:** Reuse the existing render pipeline. First extract a non-exiting `renderToFile(...)` core out of `renderCommand` (so it can be called without `process.exit`, which `--watch` needs). `preview-component` resolves the template, looks up the named component, synthesizes a minimal `:::`-fenced document (defaulting to the component's `meta.example`), and renders it through that core. The MCP `preview_component` tool spawns `druck preview-component` via the existing `cli-runner` and returns a download URL using the Phase-4A inline-job + token machinery.

**Tech Stack:** TypeScript (ESM), `yargs`, `vitest`, `tsup`, pnpm workspace; `@modelcontextprotocol/sdk` + `fastify` (MCP).

## Global Constraints

- Node.js ≥ 22; pnpm; tests via `vitest`. Run all commands from repo root: `/Users/torbenhartmann/Documents/customers/private/druckform`.
- **Commit after each task** with `git add` of exactly the files that task touched.
- Existing tests must keep passing; `renderCommand`'s external behavior (emit `RenderContract`, exit 1 on error) is unchanged after the refactor.
- `preview-component` targets `:::`-invoked (param/children) components. `block:*` and `document` are renderer-internal — reject them with guidance to use `druck render` on a Markdown snippet.
- Assumes Authoring DX Phase 1 (in-process loader, `renderComponent` helper) and extensibility Phase 4A (`render_markdown`, `JobStore.createInline`) are merged.
- Design source: `docs/superpowers/specs/2026-06-29-authoring-dx-design.md` §3 Phase 3.

---

### Task 1: Extract a non-exiting `renderToFile` core from `renderCommand`

**Files:**
- Modify: `packages/druckform/src/commands/render.ts`
- Test: existing `packages/druckform/tests/integration/render.test.ts` + `template-from-frontmatter.test.ts` are the regression gate.

**Interfaces:**
- Produces: `renderToFile(doc: ParsedDocument, resolved: ResolvedTemplate, styleConfig: StyleConfig, assetsDir: string, outPdf: string, diagramSkinBase: string): Promise<RenderContract>` — runs token-coverage check + diagram pre-render + compose + tectonic, returns a `RenderContract` (never calls `process.exit`).
- `renderCommand` keeps its signature `(templateArg, stylePath, inFile, assetsDir, outPdf, json)` and behavior.

- [ ] **Step 1: Run the baseline render tests (must stay green)**
```bash
pnpm --filter druckform exec vitest run tests/integration/render.test.ts tests/integration/template-from-frontmatter.test.ts
```
Expected: PASS.

- [ ] **Step 2: Add the `renderToFile` core and have `renderCommand` call it**

In `packages/druckform/src/commands/render.ts`, add imports for the types and split the body. Add:
```ts
import type { ParsedDocument, RenderContract, ResolvedTemplate, StyleConfig } from "../sdk/types.js";

export async function renderToFile(
  doc: ParsedDocument,
  resolved: ResolvedTemplate,
  styleConfig: StyleConfig,
  assetsDir: string,
  outPdf: string,
  diagramSkinBase: string,
): Promise<RenderContract> {
  // Required-token check before invoking LaTeX
  const required = extractRequiredTokens(resolved);
  const tokenFindings = checkTokenCoverage(required, resolved, styleConfig);
  if (tokenFindings.length > 0) {
    return {
      schemaVersion: "1",
      status: "error",
      pdf: null,
      error: { summary: summarizeFinding(tokenFindings), findings: tokenFindings },
    };
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "druckform-"));
  try {
    const diagramMap = await prerenderDiagrams(doc, styleConfig, workDir, diagramSkinBase);
    const { tex, sourceMap } = composeDocument(doc, resolved, styleConfig, diagramMap, assetsDir);
    const texPath = path.join(workDir, "document.tex");
    fs.writeFileSync(texPath, tex, "utf8");
    const { ok, log } = runTectonic(texPath, outPdf);
    if (ok) {
      return { schemaVersion: "1", status: "ok", pdf: outPdf };
    }
    const findings = mapErrors(log, sourceMap);
    return {
      schemaVersion: "1",
      status: "error",
      pdf: null,
      error: { summary: summarizeFinding(findings), findings },
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
```
Then replace the body of `renderCommand` after `styleConfig` is computed with:
```ts
  const diagramSkinBase = stylePath ? path.dirname(stylePath) : assetsDir;
  const contract = await renderToFile(doc, resolved, styleConfig, assetsDir, outPdf, diagramSkinBase);
  emitResult(contract, json);
  if (contract.status === "error") process.exit(1);
}
```
(Remove the now-duplicated token-check/workDir/try-finally block from `renderCommand`. `parseDocument`, the template resolution + `emitError`/`emitResult` helpers stay.)

- [ ] **Step 3: Run the render tests to verify behavior is unchanged**
```bash
pnpm --filter druckform exec vitest run tests/integration/render.test.ts tests/integration/template-from-frontmatter.test.ts
pnpm --filter druckform typecheck
```
Expected: PASS; `tsc` clean.

- [ ] **Step 4: Commit**
```bash
git add packages/druckform/src/commands/render.ts
git commit -m "refactor(druckform): extract non-exiting renderToFile core from renderCommand"
```

---

### Task 2: `druck preview-component` command (+ `--watch`)

**Files:**
- Create: `packages/druckform/src/commands/preview-component.ts`
- Modify: `packages/druckform/src/cli.ts` (register the command)
- Test: `packages/druckform/tests/integration/preview-component.test.ts`

**Interfaces:**
- Produces:
  - `synthesizeComponentDoc(name: string, params: Record<string, string>, children: string | undefined, example: string | undefined): string`
  - `previewComponentCommand(template: string, name: string, paramsJson: string | undefined, children: string | undefined, stylePath: string | undefined, outPdf: string, json: boolean, watch: boolean): Promise<void>`
- Consumes: `renderToFile` (Task 1), `loadAllTemplates`, `resolveTemplate`, `mergeStyle`, `loadStyle`, `parseMarkdownString`.

- [ ] **Step 1: Write the failing test** — `tests/integration/preview-component.test.ts`:
```ts
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// Don't run tectonic in tests.
vi.mock("../../src/latex/tectonic.js", () => ({
  runTectonic: vi.fn().mockReturnValue({ ok: true, log: "" }),
}));

import {
  previewComponentCommand,
  synthesizeComponentDoc,
} from "../../src/commands/preview-component.js";

const OUT = path.join(import.meta.dirname, "../../dist/test-preview.pdf");

describe("synthesizeComponentDoc", () => {
  it("uses meta.example verbatim when no params/children are given", () => {
    expect(synthesizeComponentDoc("infobox", {}, undefined, '::: infobox title="Note"\nx\n:::')).toBe(
      '::: infobox title="Note"\nx\n:::',
    );
  });
  it("builds a fenced block from params + children", () => {
    expect(synthesizeComponentDoc("infobox", { title: "Hi" }, "Body", undefined)).toBe(
      '::: infobox title="Hi"\nBody\n:::\n',
    );
  });
});

describe("preview-component", () => {
  it("renders the named component (status ok) via the base template", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      writes.push(String(s));
      return true;
    });
    await previewComponentCommand("base", "infobox", '{"title":"Hi"}', "Body", undefined, OUT, true, false);
    expect(JSON.parse(writes.join("")).status).toBe("ok");
    vi.restoreAllMocks();
  });

  it("rejects block:/document targets with guidance", async () => {
    const errs: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      errs.push(String(s));
      return true;
    });
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    await expect(
      previewComponentCommand("base", "block:table", undefined, undefined, undefined, OUT, true, false),
    ).rejects.toThrow("exit");
    expect(JSON.parse(errs.join("")).status).toBe("error");
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run to verify it fails** (`Cannot find module .../preview-component.js`).

- [ ] **Step 3: Implement `preview-component.ts`**
```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RenderContract } from "../sdk/types.js";
import { mergeStyle } from "../style/merge.js";
import { loadStyle } from "../style/validate.js";
import { loadAllTemplates } from "../template/loader.js";
import { resolveTemplate } from "../template/resolver.js";
import { parseMarkdownString } from "../parse/parser.js";
import { renderToFile } from "./render.js";

const _t1 = path.resolve(new URL("../../templates", import.meta.url).pathname);
const BUNDLED_TEMPLATES = fs.existsSync(_t1)
  ? _t1
  : path.resolve(new URL("../templates", import.meta.url).pathname);

export function synthesizeComponentDoc(
  name: string,
  params: Record<string, string>,
  children: string | undefined,
  example: string | undefined,
): string {
  // No overrides and the component ships an example → render it verbatim.
  if (Object.keys(params).length === 0 && children === undefined && example) {
    return example;
  }
  const attrs = Object.entries(params)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  const open = attrs ? `::: ${name} ${attrs}` : `::: ${name}`;
  return `${open}\n${children ?? ""}\n:::\n`;
}

function emit(contract: RenderContract, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
  } else if (contract.status === "ok") {
    console.log(`✓ preview written to ${contract.pdf}`);
  } else {
    console.error(`✗ ${contract.error?.summary}`);
    for (const f of contract.error?.findings ?? []) {
      console.error(`  [${f.severity}] ${f.component}${f.line ? `:${f.line}` : ""}: ${f.message}`);
    }
  }
}

export async function previewComponentCommand(
  template: string,
  name: string,
  paramsJson: string | undefined,
  children: string | undefined,
  stylePath: string | undefined,
  outPdf: string,
  json: boolean,
  watch: boolean,
): Promise<void> {
  if (name.startsWith("block:") || name === "document") {
    emit(
      {
        schemaVersion: "1",
        status: "error",
        pdf: null,
        error: {
          summary: `'${name}' is renderer-internal; preview it by rendering a Markdown snippet with 'druck render'.`,
          findings: [],
        },
      },
      json,
    );
    process.exit(1);
  }

  const all = loadAllTemplates(BUNDLED_TEMPLATES, process.env.DRUCKFORM_TEMPLATES_DIR);
  const fail = (summary: string) => {
    emit({ schemaVersion: "1", status: "error", pdf: null, error: { summary, findings: [] } }, json);
    process.exit(1);
  };
  if (!all.has(template)) fail(`Template not found: '${template}'`);

  const resolved = await resolveTemplate(template, all);
  const entry = resolved.components[name];
  if (!entry) fail(`Component '${name}' not found in template '${template}'`);

  const params = (paramsJson ? JSON.parse(paramsJson) : {}) as Record<string, string>;
  const md = synthesizeComponentDoc(name, params, children, entry?.def.meta.example);

  const externalStyle = stylePath ? loadStyle(stylePath) : undefined;
  const styleConfig = mergeStyle(resolved.style, externalStyle);
  const assetsDir = stylePath ? path.dirname(stylePath) : process.cwd();

  const renderOnce = async (): Promise<RenderContract> => {
    const doc = parseMarkdownString(md);
    return renderToFile(doc, resolved, styleConfig, assetsDir, outPdf, assetsDir);
  };

  const contract = await renderOnce();
  emit(contract, json);

  if (!watch) {
    if (contract.status === "error") process.exit(1);
    return;
  }

  // --watch: re-render when files under the user templates dir (or bundled) change.
  // (recursive fs.watch is supported on macOS/Windows; on Linux it may be shallow.)
  const watchDir = process.env.DRUCKFORM_TEMPLATES_DIR ?? BUNDLED_TEMPLATES;
  console.error(`watching ${watchDir} … (Ctrl-C to stop)`);
  let timer: ReturnType<typeof setTimeout> | null = null;
  fs.watch(watchDir, { recursive: true }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void renderOnce().then((c) => emit(c, json));
    }, 150);
  });
}
```

- [ ] **Step 4: Register the command in `cli.ts`**

In `packages/druckform/src/cli.ts`, add the import `import { previewComponentCommand } from "./commands/preview-component.js";` and a `.command(...)` (place it after `render`):
```ts
  .command(
    "preview-component",
    "Render a single component with sample params to a PDF (fast author loop)",
    (y) =>
      y
        .option("template", { alias: "t", type: "string", demandOption: true })
        .option("name", { type: "string", demandOption: true })
        .option("params", { type: "string", describe: "JSON object of component params" })
        .option("children", { type: "string", describe: "Markdown body for the component" })
        .option("style", { type: "string" })
        .option("out", { type: "string", demandOption: true })
        .option("watch", { type: "boolean", default: false })
        .option("json", { type: "boolean", default: false }),
    async (argv) => {
      await previewComponentCommand(
        argv.template,
        argv.name,
        argv.params,
        argv.children,
        argv.style,
        argv.out,
        argv.json,
        argv.watch,
      );
    },
  )
```

- [ ] **Step 5: Run the test + typecheck**
```bash
pnpm --filter druckform exec vitest run tests/integration/preview-component.test.ts
pnpm --filter druckform typecheck
```
Expected: PASS (3 cases); `tsc` clean. (`--watch` is exercised manually: `druck preview-component -t base --name infobox --out /tmp/p.pdf --watch`.)

- [ ] **Step 6: Commit**
```bash
git add packages/druckform/src/commands/preview-component.ts packages/druckform/src/cli.ts packages/druckform/tests/integration/preview-component.test.ts
git commit -m "feat(druckform): add druck preview-component for fast single-component rendering"
```

---

### Task 3: MCP `preview_component` tool

**Files:**
- Modify: `packages/druckform-mcp/src/cli-runner.ts` (add `previewComponent`)
- Create: `packages/druckform-mcp/src/tools/preview-component.ts`
- Modify: `packages/druckform-mcp/src/mcp-server.ts` (register it)
- Test: `packages/druckform-mcp/tests/preview-component.test.ts`

**Interfaces:**
- Produces (cli-runner): `previewComponent(template: string, name: string, params: Record<string,string> | undefined, children: string | undefined, outPdf: string): RenderContract`.
- Produces (tool): `preview_component({ template, name, params?, children? })` → `{ job_id, download_url, expires_at }` or `{ status: "error", error }`.
- Consumes: `JobStore.createInline`, `generateToken` (extensibility Phase 4A).

- [ ] **Step 1: Write the failing test** — `tests/preview-component.test.ts` (mock the cli-runner, mirroring `render-markdown.test.ts`):
```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/cli-runner.js", () => ({
  previewComponent: vi.fn((_t, _n, _p, _c, outPdf) => {
    fs.writeFileSync(outPdf, "%PDF-stub", "utf8");
    return { schemaVersion: "1", status: "ok", pdf: outPdf };
  }),
}));

import { JobStore } from "../src/job-store.js";
import { makePreviewComponentTool } from "../src/tools/preview-component.js";

const BASE = "http://127.0.0.1:9999";
let store: JobStore;
beforeEach(() => {
  process.env.DRUCKFORM_JOBS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pc-"));
  store = new JobStore();
});
afterEach(() => {
  store.destroy();
  vi.clearAllMocks();
});

async function call(args: unknown): Promise<Record<string, unknown>> {
  const tool = makePreviewComponentTool(store, BASE);
  return JSON.parse((await tool.handler(args)).content[0].text);
}

describe("preview_component", () => {
  it("renders a component and returns a download URL", async () => {
    const out = await call({ template: "base", name: "infobox", params: { title: "Hi" }, children: "Body" });
    expect(out.job_id).toBeTruthy();
    expect(String(out.download_url)).toContain(`${BASE}/download/`);
    expect(store.get(out.job_id as string)?.status).toBe("done");
  });

  it("returns an error result when the render fails", async () => {
    const { previewComponent } = await import("../src/cli-runner.js");
    (previewComponent as unknown as { mockReturnValueOnce: (v: unknown) => void }).mockReturnValueOnce({
      schemaVersion: "1",
      status: "error",
      pdf: null,
      error: { summary: "boom", findings: [] },
    });
    const out = await call({ template: "base", name: "infobox" });
    expect(out.status).toBe("error");
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Add `previewComponent` to `cli-runner.ts`** (spawns the new CLI command; parses the contract from stdout regardless of exit code, like `renderDocument`):
```ts
export function previewComponent(
  template: string,
  name: string,
  params: Record<string, string> | undefined,
  children: string | undefined,
  outPdf: string,
): RenderContract {
  const args = ["preview-component", "--template", template, "--name", name, "--out", outPdf];
  if (params && Object.keys(params).length > 0) args.push("--params", JSON.stringify(params));
  if (children !== undefined) args.push("--children", children);
  const { stdout, stderr } = run(args);
  try {
    return JSON.parse(stdout) as RenderContract;
  } catch {
    throw new Error(`druck preview-component produced no parseable contract: ${stderr || stdout || "(empty)"}`);
  }
}
```

- [ ] **Step 4: Create the tool `tools/preview-component.ts`** (mirror `render-markdown.ts`):
```ts
import path from "node:path";
import { z } from "zod";
import { previewComponent } from "../cli-runner.js";
import type { JobStore } from "../job-store.js";
import { generateToken } from "../url-tokens.js";

const schema = z.object({
  template: z.string(),
  name: z.string(),
  params: z.record(z.string()).optional(),
  children: z.string().optional(),
});

export function makePreviewComponentTool(store: JobStore, baseUrl: string) {
  return {
    name: "preview_component",
    description:
      "Render a single component with sample params/children to a PDF (fast author loop) and return a download_url. Targets ':::'-invoked components.",
    inputSchema: {
      type: "object",
      properties: {
        template: { type: "string" },
        name: { type: "string" },
        params: { type: "object", description: "Component params (string values)" },
        children: { type: "string", description: "Markdown body for the component" },
      },
      required: ["template", "name"],
    },
    handler: async (args: unknown) => {
      const { template, name, params, children } = schema.parse(args);
      const job = store.createInline(template, "placeholder-download");
      const downloadToken = generateToken(job.id, "download");
      store.update(job.id, { downloadToken, status: "rendering" });

      const outPdf = path.join(job.dir, "out.pdf");
      const result = previewComponent(template, name, params, children, outPdf);

      if (result.status === "ok") {
        store.update(job.id, { status: "done" });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                job_id: job.id,
                download_url: `${baseUrl}/download/${downloadToken}`,
                expires_at: new Date(job.expiresAt).toISOString(),
              }),
            },
          ],
        };
      }
      const errSummary = result.error?.summary;
      store.update(job.id, { status: "error", ...(errSummary !== undefined && { errorSummary: errSummary }) });
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ status: "error", error: result.error }) }],
      };
    },
  };
}
```

- [ ] **Step 5: Register in `mcp-server.ts`** — add the import and, alongside the other `store`-based tools:
```ts
import { makePreviewComponentTool } from "./tools/preview-component.js";
// …
const previewTool = makePreviewComponentTool(store, baseUrl);
server.tool(
  previewTool.name,
  previewTool.description,
  {
    template: z.string(),
    name: z.string(),
    params: z.record(z.string()).optional(),
    children: z.string().optional(),
  },
  async (args) => previewTool.handler(args),
);
```

- [ ] **Step 6: Run the test + full mcp suite + typecheck + build**
```bash
pnpm --filter druckform-mcp exec vitest run tests/preview-component.test.ts
pnpm --filter druckform-mcp exec vitest run
pnpm --filter druckform-mcp typecheck
pnpm --filter druckform-mcp build
```
Expected: PASS; `tsc` clean; build succeeds.

- [ ] **Step 7: Commit**
```bash
git add packages/druckform-mcp/src/cli-runner.ts packages/druckform-mcp/src/tools/preview-component.ts packages/druckform-mcp/src/mcp-server.ts packages/druckform-mcp/tests/preview-component.test.ts
git commit -m "feat(druckform-mcp): add preview_component tool"
```

---

### Task 4: Docs + changeset

**Files:**
- Modify: `docs/extending-druckform.md` (CLI reference table + MCP tool table + a "Preview a component" subsection)
- Modify: `claude-plugin/skills/druckform/SKILL.md` (add `preview_component` to the MCP tools table)
- Create: `.changeset/authoring-dx-preview.md`

- [ ] **Step 1: Update `docs/extending-druckform.md`**
- Add a `druck preview-component` row to the CLI reference table (required: `--template/-t`, `--name`, `--out`; optional: `--params`, `--children`, `--style`, `--watch`, `--json`).
- Add a `preview_component` row to the MCP tool table: `preview_component` | `template, name, params?, children?` | `{ job_id, download_url, expires_at }` **or** `{ status: "error", error }`.
- Add a short "Preview a component" subsection showing: `druck preview-component -t base --name infobox --params '{"title":"Note"}' --children 'Body' --out /tmp/p.pdf` and the `--watch` loop; note it targets `:::` components and that `meta.example` is the default when params/children are omitted.

- [ ] **Step 2: Update the skill** — add the `preview_component` row to the MCP Tools table in `claude-plugin/skills/druckform/SKILL.md` with a one-line note that it's for quickly previewing one component.

- [ ] **Step 3: Changeset** — `.changeset/authoring-dx-preview.md`:
```markdown
---
"druckform": minor
"druckform-mcp": minor
---

Add a fast single-component preview loop: `druck preview-component` (with `--watch`)
renders one component with sample params/children to a PDF, defaulting to the
component's `meta.example`. New MCP `preview_component` tool returns a download_url.
Internally, the render pipeline gains a non-exiting `renderToFile` core.
```

- [ ] **Step 4: Commit**
```bash
git add docs/extending-druckform.md claude-plugin/skills/druckform/SKILL.md .changeset/authoring-dx-preview.md
git commit -m "docs(druckform): document preview-component + preview_component"
```

---

## Final verification
```bash
pnpm --filter druckform exec vitest run && pnpm --filter druckform-mcp exec vitest run
pnpm lint && pnpm turbo typecheck && pnpm turbo build && pnpm turbo test
# Real smoke (tectonic): preview the base infobox to a PDF
pnpm --filter druckform build
node packages/druckform/dist/cli.js preview-component -t base --name infobox --params '{"title":"Note"}' --children 'Body' --out /tmp/adx-p3.pdf && ls /tmp/adx-p3.pdf
```

## Self-Review

**Spec coverage (§3 Phase 3):** `druck preview-component` with `--params`/`--children`/`--style`/`--out`/`--json` and `meta.example` defaulting (Task 2) · `--watch` (Task 2) · source-mapped compile findings (via `renderToFile` → `mapErrors`, Task 1) · `:::`-component targeting with block:/document guidance (Task 2) · MCP `preview_component` → `download_url` reusing inline-job/token machinery (Task 3) · docs (Task 4).

**Placeholder scan:** every code step shows complete code; commands list expected output.

**Type consistency:** `renderToFile` returns `RenderContract` (consumed by `previewComponentCommand` and `renderCommand`); `previewComponent` (cli-runner) returns `RenderContract` and is consumed by the tool; `synthesizeComponentDoc` signature is identical across its definition (Task 2) and tests. The MCP tool mirrors `render-markdown.ts`'s `createInline` + `generateToken` + download-token shape.

**Risk:** recursive `fs.watch` is platform-dependent (shallow on some Linux); noted inline and `--watch` is manual-tested only. `--params` values are interpolated into `key="value"` fence attributes, so values containing `"` aren't supported (matches the parser's `ATTR_RE`); documented behavior, acceptable for preview.
