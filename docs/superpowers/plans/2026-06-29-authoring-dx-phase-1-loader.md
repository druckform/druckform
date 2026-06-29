# Authoring DX Phase 1 — Loader & Test Ergonomics

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the esbuild→temp-`.mjs`→`import()` TypeScript component loader with an in-process runtime loader (no temp file, no race, instrumentable by v8), add a `renderComponent` test helper, and restore template-component coverage (drop the CI workaround exclude).

**Architecture:** `src/component/typescript.ts` currently bundles each `.ts` component with esbuild, writes it to a temp `.mjs` beside the source, and dynamically imports that. That indirection caused a filename-collision race and makes v8 attribute 0% coverage to component source. Swap it for `tsx`'s programmatic `tsImport()`, which transpiles and loads the module in-process under its real source path. Keep all downstream behavior (schema/meta/render validation, `tokenRef` derivation, preamble) identical.

**Tech Stack:** TypeScript (ESM), `tsx`, `zod`, `vitest`, `tsup`, pnpm workspace.

> **⚠️ DESCOPED (2026-06-29).** The `tsx` loader swap (Tasks 1 & 3) was attempted and **reverted**: `tsx`'s `tsImport` cannot self-bootstrap inside the tsup-bundled `dist/cli.js` on Node 22 (its `module.register()` worker-thread hook activates after Node's native ESM parser already rejects the `.ts` syntax) — tests pass, but production `druck render` breaks. The two motivations no longer justified the swap: the temp-file **race was already fixed** (extensibility Phase 1, pid+counter filename), and **coverage** is handled by the existing `templates/**` exclude (components are tested via output assertions). **What shipped from this phase: only Task 2 — the `renderComponent` test helper** (the low-risk, high-value piece that unblocks Phases 2–5). The esbuild loader is retained. To revisit the swap, bump the runtime to Node ≥24 (`module.registerHooks` is synchronous there) — tracked as a future option, not done here. Tasks 1, 3, 4 below are kept as historical record.

## Global Constraints

- Node.js ≥ 22; pnpm; tests via `vitest`. Run all commands from repo root: `/Users/torbenhartmann/Documents/customers/private/druckform`.
- **Commit after each task** with `git add` of exactly the files that task touched.
- Existing tests must keep passing; the component-loading contract (`loadComponent(sourcePath, "")` → `ComponentDef`) is unchanged.
- The loader runs in **two environments**: under vitest, and in the bundled `dist/cli.js` at runtime (production loads user `.ts` components from `DRUCKFORM_TEMPLATES_DIR`). Both must work.
- Design source: `docs/superpowers/specs/2026-06-29-authoring-dx-design.md` §3 Phase 1.

---

### Task 1: Add `tsx` and swap the loader implementation

**Files:**
- Modify: `packages/druckform/package.json` (add `tsx` dependency)
- Modify: `packages/druckform/src/component/typescript.ts`
- Test: existing `tests/unit/component-element-payload.test.ts`, `block-components-*.test.ts`, `token-ref.test.ts` are the regression gate.

**Interfaces:**
- Unchanged public surface: `loadTypeScriptComponent(tsPath: string): Promise<ComponentDef>` and the `loadComponent` dispatcher.

- [ ] **Step 1: Add the dependency**

Run:
```bash
pnpm --filter druckform add tsx@^4.19.2
```
Expected: `tsx` under `dependencies`; lockfile updates.

- [ ] **Step 2: Confirm the current behavior is green (baseline)**

Run:
```bash
pnpm --filter druckform build
pnpm --filter druckform exec vitest run tests/unit/token-ref.test.ts tests/unit/block-components-simple.test.ts
```
Expected: PASS (this is the behavior we must preserve).

- [ ] **Step 3: Replace the esbuild temp-file body with `tsImport`**

In `packages/druckform/src/component/typescript.ts`, replace the esbuild build + temp-file write + dynamic import with `tsImport`. Keep the imports of `tokenRefName` and the `ComponentDef`/`ComponentMeta` types. New body:

```ts
import { tsImport } from "tsx/esm/api";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { tokenRefName } from "../sdk/token-ref.js";
import type { ComponentDef, ComponentMeta } from "../sdk/types.js";

export async function loadTypeScriptComponent(tsPath: string): Promise<ComponentDef> {
  // Transpile + load the component in-process under its real source path
  // (no temp file → no race, and v8 can attribute coverage to the source).
  const mod = (await tsImport(tsPath, import.meta.url)) as {
    schema: z.ZodObject<z.ZodRawShape>;
    meta: ComponentMeta;
    render: (params: unknown, children: string, ctx: unknown, element?: unknown) => string;
    preamble?: string;
  };

  if (!mod.schema || !mod.meta || !mod.render) {
    throw new Error(`Component ${tsPath} must export schema, meta, and render`);
  }

  const jsonSchema =
    zodToJsonSchema(mod.schema, { name: mod.meta.name }).definitions?.[mod.meta.name] ??
    zodToJsonSchema(mod.schema);

  const derivedTokens = new Set<string>();
  for (const field of Object.values(mod.schema.shape ?? {})) {
    const t = tokenRefName(field);
    if (t) derivedTokens.add(t);
  }
  const requiredTokens = new Set([...(mod.meta.requiredTokens ?? []), ...derivedTokens]);

  return {
    meta: mod.meta,
    schema: mod.schema,
    jsonSchema: jsonSchema as Record<string, unknown>,
    render: (params, children, ctx, element) => {
      const validated = mod.schema.parse(params);
      return mod.render(validated, children, ctx, element);
    },
    requiredTokens,
    ...(mod.preamble !== undefined ? { preamble: mod.preamble } : {}),
  };
}
```
Remove the now-unused `esbuild` import and the `tmpCounter` module variable.

- [ ] **Step 4: Run the loader regression tests**

Run:
```bash
pnpm --filter druckform exec vitest run tests/unit/token-ref.test.ts tests/unit/block-components-simple.test.ts tests/unit/block-components-structured.test.ts tests/unit/component-element-payload.test.ts tests/unit/document-component.test.ts
```
Expected: PASS. **Gate:** if `tsImport` cannot resolve the component's `import { tokenRef } from "druckform"` (a runtime package export), see Task 4's note — but tests should pass against the built `dist` as today.

- [ ] **Step 5: Verify the production runtime path still loads a TS component**

The bundled CLI loads `.ts` components at runtime. Confirm a real render still works:
```bash
pnpm --filter druckform build
node packages/druckform/dist/cli.js render --template base \
  --in packages/druckform/tests/fixtures/documents/gfm-kitchensink.md --out /tmp/adx-p1.pdf
ls -la /tmp/adx-p1.pdf
```
Expected: `✓ PDF written…` and the file exists. **Gate:** if `tsx` is tree-shaken/broken by tsup, mark `tsx` external in `tsup.config.ts` (`external: ["tsx"]`) and rebuild. If `tsImport` fundamentally cannot run inside the bundle, apply the fallback in Task 1's design note (keep esbuild for the dist build, route test-time loads through tsx) and document it here.

- [ ] **Step 6: Remove the unused esbuild dependency if nothing else uses it**

Run:
```bash
grep -rn "esbuild" packages/druckform/src && echo "still used — keep it" || pnpm --filter druckform remove esbuild
```
Expected: if no `src` reference remains, esbuild is removed; otherwise left in place.

- [ ] **Step 7: Typecheck + commit**

```bash
pnpm --filter druckform typecheck
git add packages/druckform/package.json packages/druckform/src/component/typescript.ts pnpm-lock.yaml packages/druckform/tsup.config.ts
git commit -m "refactor(druckform): load TS components in-process via tsx (no temp file, race-free, instrumentable)"
```

---

### Task 2: `renderComponent` test helper

**Files:**
- Create: `packages/druckform/tests/helpers/render-component.ts`
- Test: `packages/druckform/tests/unit/render-component-helper.test.ts`

**Interfaces:**
- Produces:
  - `testCtx(over?: Partial<RenderCtx>): RenderCtx` — a default ctx (token→`\druckName`, empty style, empty frontmatter).
  - `renderComponent(sourcePath: string, params?: Record<string, unknown>, opts?: { children?: string; element?: BlockElement | DocumentLayout; ctx?: Partial<RenderCtx> }): Promise<string>`.

- [ ] **Step 1: Write the failing test** — `tests/unit/render-component-helper.test.ts`:
```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const DIR = path.resolve(import.meta.dirname, "../../templates/base/components");

describe("renderComponent helper", () => {
  it("loads + renders a block component in one call", async () => {
    const out = await renderComponent(path.join(DIR, "block-heading.ts"), {}, {
      children: "Title",
      element: { kind: "heading", level: 1 },
    });
    expect(out).toBe("\\section{Title}");
  });
});
```

- [ ] **Step 2: Run to verify it fails** (`Cannot find module ../helpers/render-component.js`).

- [ ] **Step 3: Implement the helper** — `tests/helpers/render-component.ts`:
```ts
import { loadComponent } from "../../src/component/loader.js";
import type { BlockElement, DocumentLayout, RenderCtx } from "../../src/sdk/types.js";

export function testCtx(over: Partial<RenderCtx> = {}): RenderCtx {
  return {
    token: (n) => `\\druck${n.charAt(0).toUpperCase()}${n.slice(1)}`,
    style: { colors: {}, fonts: {}, spacing: {} },
    frontmatter: {},
    ...over,
  };
}

export async function renderComponent(
  sourcePath: string,
  params: Record<string, unknown> = {},
  opts: { children?: string; element?: BlockElement | DocumentLayout; ctx?: Partial<RenderCtx> } = {},
): Promise<string> {
  const def = await loadComponent(sourcePath, "");
  return def.render(params, opts.children ?? "", testCtx(opts.ctx), opts.element);
}
```

- [ ] **Step 4: Run to verify it passes** + typecheck.

- [ ] **Step 5: Commit**
```bash
git add packages/druckform/tests/helpers/render-component.ts packages/druckform/tests/unit/render-component-helper.test.ts
git commit -m "test(druckform): add renderComponent test helper"
```

---

### Task 3: Restore template-component coverage

**Files:**
- Modify: `packages/druckform/vitest.config.ts`

**Interfaces:** none.

- [ ] **Step 1: Drop the `templates/**` coverage exclude**

In `packages/druckform/vitest.config.ts`, remove the `"templates/**"` entry from `coverage.exclude` (keep `"tests/**"` — those are fixtures/support). The comment explaining the temp-file instrumentation gap is now obsolete; replace it with: `// components load in-process (tsx), so their source is now instrumented`.

- [ ] **Step 2: Measure coverage**

Run:
```bash
pnpm --filter druckform exec vitest run --coverage 2>&1 | grep -E "All files|does not meet|block-|document.ts|callout"
```
Expected: the `templates/**` component files now show **real** (non-zero) coverage, and **All files ≥ 80% lines**.

- [ ] **Step 3: If any genuinely-untested component path drags it below 80%, add a test (not an exclude)**

For any component still under-covered, add a focused test using `renderComponent` (Task 2). Re-run Step 2 until **All files ≥ 80%**. (Do not re-add a blanket exclude — the point of Phase 1 is that these are now measurable.)

- [ ] **Step 4: Run the full suite + the exact CI test command**

```bash
pnpm --filter druckform exec vitest run
pnpm turbo test
```
Expected: all pass; `turbo test` (coverage-gated) succeeds for both packages.

- [ ] **Step 5: Commit**
```bash
git add packages/druckform/vitest.config.ts
git commit -m "test(druckform): restore template-component coverage now that components are instrumented"
```

---

### Task 4: Docs + changeset

**Files:**
- Modify: `docs/extending-druckform.md` (TS component section: note in-process loading; the `renderComponent` test helper)
- Create: `.changeset/authoring-dx-loader.md`

- [ ] **Step 1: Document** — in `docs/extending-druckform.md` §5.2, add a short note that TS components are loaded in-process (no build step needed for type-only-import components; runtime package imports like `tokenRef`/`Tex` still resolve to the built package) and show the `renderComponent` helper as the recommended way to unit-test a component.

- [ ] **Step 2: Changeset** — `.changeset/authoring-dx-loader.md`:
```markdown
---
"druckform": patch
---

Load TypeScript components in-process via tsx instead of bundling each to a temp
file. Removes a filename-collision race, and lets coverage attribute to component
source. Adds a `renderComponent` test helper.
```

- [ ] **Step 3: Commit**
```bash
git add docs/extending-druckform.md .changeset/authoring-dx-loader.md
git commit -m "docs(druckform): document in-process component loading + renderComponent helper"
```

---

## Final verification
```bash
pnpm --filter druckform exec vitest run && pnpm --filter druckform-mcp exec vitest run
pnpm lint && pnpm turbo typecheck && pnpm turbo build && pnpm turbo test
node packages/druckform/dist/cli.js render --template base --in packages/druckform/tests/fixtures/documents/gfm-kitchensink.md --out /tmp/adx-p1.pdf && ls /tmp/adx-p1.pdf
```

## Self-Review

**Spec coverage (§3 Phase 1):** in-process loader (Task 1) · `renderComponent` helper (Task 2) · restore coverage / drop workaround exclude (Task 3) · docs (Task 4). The bundling/coverage risks have explicit verification **Gates** in Task 1 Steps 5 and the documented fallback.

**Placeholder scan:** every code step shows complete code; verification gates state expected output.

**Type consistency:** `loadTypeScriptComponent` return shape and the `render` wrapper signature (`params, children, ctx, element`) match `ComponentDef` in `src/sdk/types.ts`; `renderComponent` uses `RenderCtx` with the `frontmatter` field added in the extensibility Phase 3.

**Honest scope note:** the loader swap removes the temp-file/race and fixes coverage; it does **not** remove the need to build `druckform` for components that import *runtime* values from the package (`tokenRef`, `Tex`, `raw`) — those still resolve to the built package. Type-only-import components need no build. This is stated in the docs (Task 4).
