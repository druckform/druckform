# Extensibility Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the four Phase 1 "quick wins" from the extensibility roadmap: vocabulary cleanup, a `null` tombstone to remove inherited components, schema-derived `requiredTokens` for TS components (`tokenRef`), and ephemeral-port-by-default for the MCP HTTP server.

**Design source:** `docs/superpowers/specs/2026-06-29-extensibility-roadmap-design.md` (§3).

**Tech Stack:** TypeScript (ESM), `zod`, `markdown-it`, `fastify` (MCP HTTP), `vitest`, `tsup`, pnpm workspace.

## Global Constraints

- Node.js ≥ 22; package manager pnpm; tests via `vitest`.
- Run all commands from the repo root: `/Users/torbenhartmann/Documents/customers/private/druckform`.
- The four tasks are independent; do them in order, **commit after each task** with `git add` of exactly the files that task touched.
- Existing tests must keep passing. All contract changes here are additive or default-value changes.
- Two packages are involved: `packages/druckform` (core/CLI) and `packages/druckform-mcp` (MCP server).
- Task 5 (docs sync) runs last, after all behavior is in place.

---

### Task 1: Remove Satz/Letter vocabulary

**Files:**
- Modify: `packages/druckform-mcp/src/tools/list-templates.ts` (description string)
- Modify: `packages/druckform-mcp/src/tools/list-components.ts` (description string)
- Modify: `packages/druckform/src/cli.ts` (the `templates` and `components` command descriptions)
- Test: `packages/druckform-mcp/tests/tool-descriptions.test.ts`

**Interfaces:** none changed — copy only.

- [ ] **Step 1: Write the failing test**

Create `packages/druckform-mcp/tests/tool-descriptions.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { listTemplatesTool } from "../src/tools/list-templates.js";
import { listComponentsTool } from "../src/tools/list-components.js";

describe("tool descriptions are free of German flavour vocabulary", () => {
  it("list_templates description has no 'Sätze'", () => {
    expect(listTemplatesTool.description).not.toMatch(/Sätze|Satz/);
  });
  it("list_components description has no 'Lettern'", () => {
    expect(listComponentsTool.description).not.toMatch(/Lettern|Letter/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**
```bash
pnpm --filter druckform-mcp exec vitest run tests/tool-descriptions.test.ts
```
Expected: FAIL — current descriptions contain "(Sätze)" / "(Lettern)".

- [ ] **Step 3: Edit the MCP tool descriptions**

In `packages/druckform-mcp/src/tools/list-templates.ts`, change the `description` to:
`"List all available document templates."`

In `packages/druckform-mcp/src/tools/list-components.ts`, change the `description` to:
`"List the resolved components for a template."`

- [ ] **Step 4: Edit the CLI command descriptions**

In `packages/druckform/src/cli.ts`, change the two command descriptions:
- `"List available templates (Sätze)"` → `"List available templates"`
- `"List resolved components for a template (Lettern)"` → `"List resolved components for a template"`

- [ ] **Step 5: Verify no remaining occurrences in code**
```bash
grep -rniE "Sätze|Satz|Lettern" packages/*/src && echo "FOUND — remove them" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 6: Run the test to verify it passes**
```bash
pnpm --filter druckform-mcp exec vitest run tests/tool-descriptions.test.ts
```
Expected: PASS.

- [ ] **Step 7: Commit**
```bash
git add packages/druckform-mcp/src/tools/list-templates.ts packages/druckform-mcp/src/tools/list-components.ts packages/druckform/src/cli.ts packages/druckform-mcp/tests/tool-descriptions.test.ts
git commit -m "refactor(druckform): drop Satz/Letter vocabulary from tool and CLI descriptions"
```

---

### Task 2: `null` tombstone to remove an inherited component

**Files:**
- Modify: `packages/druckform/src/sdk/types.ts` (`TemplateConfig.components` value type)
- Modify: `packages/druckform/src/template/resolver.ts` (handle `null` → delete)
- Modify: `packages/druckform/src/template/loader.ts` (reject nulling a `block:*` component)
- Test: `packages/druckform/tests/unit/component-tombstone.test.ts`

**Interfaces:**
- `TemplateConfig.components: Record<string, ComponentOverrideSpec | null>` (was `Record<string, ComponentOverrideSpec>`).

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/component-tombstone.test.ts`:
```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
let userDir: string | null = null;

afterEach(() => {
  if (userDir) fs.rmSync(userDir, { recursive: true, force: true });
  userDir = null;
});

function writeUserTemplate(yaml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-tomb-"));
  const tdir = path.join(dir, "mytpl");
  fs.mkdirSync(tdir);
  fs.writeFileSync(path.join(tdir, "template.yaml"), yaml, "utf8");
  return dir;
}

describe("component tombstone (null removes an inherited component)", () => {
  it("removes an inherited component set to null", async () => {
    userDir = writeUserTemplate("name: mytpl\nextends: base\ncomponents:\n  infobox: null\n");
    const all = loadAllTemplates(BUNDLED, userDir);
    const resolved = await resolveTemplate("mytpl", all);
    expect(resolved.components.infobox).toBeUndefined();
    // sibling built-ins remain
    expect(resolved.components["block:table"]).toBeDefined();
  });

  it("rejects nulling a built-in block: component at load time", () => {
    userDir = writeUserTemplate('name: mytpl\nextends: base\ncomponents:\n  "block:table": null\n');
    expect(() => loadAllTemplates(BUNDLED, userDir!)).toThrow(/cannot remove built-in block component/);
  });

  it("still inherits unmentioned components as-is", async () => {
    userDir = writeUserTemplate("name: mytpl\nextends: base\ncomponents: {}\n");
    const resolved = await resolveTemplate("mytpl", loadAllTemplates(BUNDLED, userDir));
    expect(resolved.components.infobox).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**
```bash
pnpm --filter druckform exec vitest run tests/unit/component-tombstone.test.ts
```
Expected: FAIL — `null` currently throws (`override.source` on null) or isn't handled; no block-null rejection.

- [ ] **Step 3: Widen the `TemplateConfig.components` type**

In `packages/druckform/src/sdk/types.ts`, change the `components` field of `TemplateConfig`:
```ts
export interface TemplateConfig {
  name: string;
  description?: string;
  extends?: string;
  style_defaults?: string;
  components: Record<string, ComponentOverrideSpec | null>;
}
```

- [ ] **Step 4: Handle `null` in the resolver**

In `packages/druckform/src/template/resolver.ts`, inside the chain-merge loop, make `null` delete the entry. Change the loop body so it begins:
```ts
    for (const [compName, override] of Object.entries(entry.config.components ?? {})) {
      if (override === null) {
        mergedComponents.delete(compName);
        continue;
      }
      if (override.source) {
        // ... unchanged
```
(The rest of the loop is unchanged.)

- [ ] **Step 5: Reject nulling a `block:*` component in the loader**

In `packages/druckform/src/template/loader.ts`, inside `loadAllTemplates`, after `const config = yaml.load(raw) as TemplateConfig;` and before the existing user-only reserved-namespace check, add an all-origins guard:
```ts
      for (const [compName, spec] of Object.entries(config.components ?? {})) {
        if (compName.startsWith("block:") && spec === null) {
          throw new Error(
            `Template '${config.name}' cannot remove built-in block component '${compName}' ` +
              `(set to null). 'block:' components are required by the Markdown renderer.`,
          );
        }
      }
```

- [ ] **Step 6: Run the test and typecheck to verify they pass**
```bash
pnpm --filter druckform exec vitest run tests/unit/component-tombstone.test.ts
pnpm --filter druckform typecheck
```
Expected: test PASS (3 cases); `tsc --noEmit` clean.

- [ ] **Step 7: Run the resolver/loader-adjacent suites for regressions**
```bash
pnpm --filter druckform exec vitest run tests/unit/template-resolver.test.ts tests/unit/reserved-namespace.test.ts
```
Expected: PASS.

- [ ] **Step 8: Commit**
```bash
git add packages/druckform/src/sdk/types.ts packages/druckform/src/template/resolver.ts packages/druckform/src/template/loader.ts packages/druckform/tests/unit/component-tombstone.test.ts
git commit -m "feat(druckform): allow templates to remove an inherited component with null (reject for block:*)"
```

---

### Task 3: `tokenRef` schema helper — derive `requiredTokens` for TS components

**Files:**
- Create: `packages/druckform/src/sdk/token-ref.ts`
- Modify: `packages/druckform/src/index.ts` (export `tokenRef`)
- Modify: `packages/druckform/src/component/typescript.ts` (union schema-derived tokens into `requiredTokens`)
- Test fixture: `packages/druckform/tests/fixtures/components/token-ref-comp.ts`
- Test: `packages/druckform/tests/unit/token-ref.test.ts`

**Interfaces:**
- Produces: `tokenRef(name: string): z.ZodString` — a string param schema that also records the style-token name it requires. The TS component loader derives `requiredTokens` from these markers (unioned with the legacy `meta.requiredTokens`).

- [ ] **Step 1: Create the helper**

`packages/druckform/src/sdk/token-ref.ts`:
```ts
import { z } from "zod";

// Non-enumerable marker carried on a zod string schema produced by tokenRef().
// Read back by the TS component loader to derive requiredTokens. Property-based
// (not module-identity-based) so it survives esbuild bundling + the src/dist split.
const TOKEN_MARK = "__druckToken";

/**
 * A string parameter that also declares the style token it resolves, e.g.
 *   schema = z.object({ accent: tokenRef("accent") })
 * Validates as a string at runtime; the loader derives `requiredTokens` from it,
 * so a TS component no longer needs to hand-maintain `meta.requiredTokens`.
 */
export function tokenRef(name: string): z.ZodString {
  const schema = z.string();
  Object.defineProperty(schema, TOKEN_MARK, { value: name, enumerable: false });
  return schema;
}

/** Returns the token name a tokenRef() schema carries, or undefined. */
export function tokenRefName(schema: unknown): string | undefined {
  return (schema as Record<string, unknown> | null)?.[TOKEN_MARK] as string | undefined;
}
```

- [ ] **Step 2: Export `tokenRef` from the package entry**

In `packages/druckform/src/index.ts`, add to the value exports (after the `tex` line):
```ts
export { tokenRef } from "./sdk/token-ref.js";
```

- [ ] **Step 3: Derive tokens in the TS component loader**

In `packages/druckform/src/component/typescript.ts`:
- Add the import: `import { tokenRefName } from "../sdk/token-ref.js";`
- Replace the line `const requiredTokens = new Set(mod.meta.requiredTokens ?? []);` with:
```ts
      const derivedTokens = new Set<string>();
      for (const field of Object.values(mod.schema.shape ?? {})) {
        const t = tokenRefName(field);
        if (t) derivedTokens.add(t);
      }
      const requiredTokens = new Set([...(mod.meta.requiredTokens ?? []), ...derivedTokens]);
```

- [ ] **Step 4: Write the test fixture component**

`packages/druckform/tests/fixtures/components/token-ref-comp.ts`:
```ts
import { z } from "zod";
import { tokenRef } from "druckform";
import type { RenderCtx } from "druckform";

export const schema = z.object({ accent: tokenRef("accent"), title: z.string() });
export const meta = { name: "tref", description: "token-ref test", acceptsChildren: false };

export function render(params: { accent: string; title: string }, _children: string, ctx: RenderCtx): string {
  return `${ctx.token(params.accent)}{${params.title}}`;
}
```

- [ ] **Step 5: Write the failing test**

`packages/druckform/tests/unit/token-ref.test.ts`:
```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { tokenRef } from "../../src/sdk/token-ref.js";
import { loadComponent } from "../../src/component/loader.js";

const FIX = path.resolve(import.meta.dirname, "../fixtures/components/token-ref-comp.ts");

describe("tokenRef", () => {
  it("validates as a string at runtime", () => {
    expect(z.object({ a: tokenRef("accent") }).parse({ a: "x" })).toEqual({ a: "x" });
  });

  it("a TS component derives requiredTokens from tokenRef params", async () => {
    const def = await loadComponent(FIX, "");
    expect(def.requiredTokens.has("accent")).toBe(true);
    expect(def.requiredTokens.has("title")).toBe(false);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**
```bash
pnpm --filter druckform exec vitest run tests/unit/token-ref.test.ts
```
Expected: FAIL — `tokenRef` not exported / `requiredTokens` does not contain "accent".

- [ ] **Step 7: Build the package, then run the test + typecheck**

The fixture imports `tokenRef` from `"druckform"` (the published surface), which resolves to `dist`; build so the new export is present:
```bash
pnpm --filter druckform build
pnpm --filter druckform exec vitest run tests/unit/token-ref.test.ts
pnpm --filter druckform typecheck
```
Expected: test PASS (2 cases); `tsc` clean.

- [ ] **Step 8: Confirm no regression in the existing TS-component path**

`callout` declares `requiredTokens: ["accent", "warning"]` the legacy way; confirm it still resolves:
```bash
pnpm --filter druckform exec vitest run tests/unit/template-resolver.test.ts tests/unit/style-tokens.test.ts
```
Expected: PASS.

- [ ] **Step 9: Commit**
```bash
git add packages/druckform/src/sdk/token-ref.ts packages/druckform/src/index.ts packages/druckform/src/component/typescript.ts packages/druckform/tests/fixtures/components/token-ref-comp.ts packages/druckform/tests/unit/token-ref.test.ts
git commit -m "feat(druckform): derive TS component requiredTokens from a tokenRef() schema helper"
```

---

### Task 4: Ephemeral HTTP port by default

**Files:**
- Modify: `packages/druckform-mcp/src/http-server.ts` (`port = 0`; report the actual bound port)
- Modify: `packages/druckform-mcp/src/index.ts` (default `DRUCKFORM_HTTP_PORT` to `0`)
- Test: `packages/druckform-mcp/tests/http-server.test.ts` (extend)

**Interfaces:**
- `startHttpServer(store, port = 0)` now also returns `port: number` (the actual bound port) and its `url` reflects the actual bound port, not the requested one.

- [ ] **Step 1: Write the failing tests (extend the existing file)**

In `packages/druckform-mcp/tests/http-server.test.ts`, add two cases inside the `describe("HTTP server", …)` block:
```ts
  it("binds an ephemeral port when port 0 is requested", async () => {
    const s = new JobStore();
    const a = await startHttpServer(s, 0);
    try {
      expect(a.port).toBeGreaterThan(0);
      expect(a.url).toBe(`http://127.0.0.1:${a.port}`);
    } finally {
      await a.close();
      await s.destroy();
    }
  });

  it("two instances on port 0 get distinct ports (no clash)", async () => {
    const s1 = new JobStore();
    const s2 = new JobStore();
    const a = await startHttpServer(s1, 0);
    const b = await startHttpServer(s2, 0);
    try {
      expect(a.port).not.toBe(b.port);
    } finally {
      await a.close();
      await b.close();
      await s1.destroy();
      await s2.destroy();
    }
  });
```
(The existing case that requests port `7399` and asserts `url === "http://127.0.0.1:7399"` must continue to pass — an explicit non-zero port is still reported verbatim.)

- [ ] **Step 2: Run to verify the new cases fail**
```bash
pnpm --filter druckform-mcp exec vitest run tests/http-server.test.ts
```
Expected: FAIL — `a.port` is `undefined` (not yet returned) and the port-0 url would read `:0`.

- [ ] **Step 3: Report the actual bound port in `startHttpServer`**

In `packages/druckform-mcp/src/http-server.ts`, change `startHttpServer`:
```ts
export async function startHttpServer(
  store: JobStore,
  port = 0,
): Promise<{ url: string; close: () => Promise<void>; boundHost: string; port: number }> {
  const app = createHttpServer(store);
  const host = process.env.DRUCKFORM_HTTP_BIND ?? "0.0.0.0";
  await app.listen({ port, host });
  const addr = app.server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;
  return {
    url: `http://127.0.0.1:${actualPort}`,
    close: () => app.close(),
    boundHost: host,
    port: actualPort,
  };
}
```

- [ ] **Step 4: Default the env var to ephemeral**

In `packages/druckform-mcp/src/index.ts`, change:
```ts
const HTTP_PORT = Number.parseInt(process.env.DRUCKFORM_HTTP_PORT ?? "0", 10);
```

- [ ] **Step 5: Run the test + typecheck to verify they pass**
```bash
pnpm --filter druckform-mcp exec vitest run tests/http-server.test.ts
pnpm --filter druckform-mcp typecheck
```
Expected: all HTTP-server cases PASS (including the existing `7399` case); `tsc` clean.

- [ ] **Step 6: Commit**
```bash
git add packages/druckform-mcp/src/http-server.ts packages/druckform-mcp/src/index.ts packages/druckform-mcp/tests/http-server.test.ts
git commit -m "feat(druckform-mcp): bind an ephemeral HTTP port by default to avoid multi-instance clashes"
```

---

### Task 5: Sync documentation, README, and skill

**Files:**
- Modify: `docs/extending-druckform.md`
- Modify: `README.md` (repo root)
- Modify: `claude-plugin/skills/druckform/SKILL.md`

**Interfaces:** docs only.

- [ ] **Step 1: Update the developer guide (`docs/extending-druckform.md`)**

- Remove the "Vocabulary (Satz/Letter)" lines in §0 and every inline "(Sätze)"/"(Lettern)" mention.
- §5.2 (TS component): show `tokenRef` as the preferred way to declare token params; note `meta.requiredTokens` is now legacy/optional and is derived from the schema.
- §6.4 (overriding): document `<component>: null` to remove an inherited component, and that nulling a `block:*` component is rejected at load time.
- §10 env table: change `DRUCKFORM_HTTP_PORT` semantics — default is now `0` (OS-assigned ephemeral port; each MCP instance gets its own), set a fixed value only when you need determinism. Add it to the env table if not present.

- [ ] **Step 2: Update `README.md`**

- Reflect the ephemeral-port default for the MCP server (no fixed `7331` unless `DRUCKFORM_HTTP_PORT` is set).
- Mention `tokenRef` for TS component authors and the `null` tombstone for templates, if the README documents authoring at that level.

- [ ] **Step 3: Update the skill (`claude-plugin/skills/druckform/SKILL.md`)**

- Drop Satz/Letter parentheticals if present.
- No workflow change for the MCP tool sequence; only update any hard-coded port/URL references to note the port is dynamic.

- [ ] **Step 4: Verify no stale vocabulary remains in docs**
```bash
grep -rniE "Sätze|Satz|Lettern" docs README.md claude-plugin/skills/druckform/SKILL.md && echo "FOUND" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 5: Commit**
```bash
git add docs/extending-druckform.md README.md claude-plugin/skills/druckform/SKILL.md
git commit -m "docs(druckform): document Phase 1 changes (tokenRef, null tombstone, ephemeral port; drop vocab)"
```

---

## Final verification

- [ ] **Run the full suites and builds for both packages**
```bash
pnpm --filter druckform exec vitest run
pnpm --filter druckform-mcp exec vitest run
pnpm --filter druckform build
pnpm --filter druckform-mcp build
pnpm --filter druckform typecheck
pnpm --filter druckform-mcp typecheck
```
Expected: all tests PASS; both builds succeed; both typechecks clean.

- [ ] **Add a changeset**

Create `.changeset/extensibility-phase-1.md`:
```markdown
---
"druckform": minor
"druckform-mcp": minor
---

Phase 1 extensibility: templates may remove an inherited component with `null`
(rejected for built-in `block:*`); TS components derive `requiredTokens` from a
`tokenRef()` schema helper (no separate `meta.requiredTokens` needed); the MCP
HTTP server binds an ephemeral port by default (`DRUCKFORM_HTTP_PORT=0`) to avoid
clashes between concurrent instances; removed internal Satz/Letter vocabulary from
tool and CLI descriptions.
```
```bash
git add .changeset/extensibility-phase-1.md
git commit -m "chore: changeset for extensibility phase 1"
```

---

## Self-Review

**Spec coverage (§3 of the design):**
- §3.1 vocab cleanup → Task 1 (+ docs in Task 5).
- §3.2 `null` tombstone, reject `block:*` → Task 2.
- §3.3 `tokenRef` derive requiredTokens → Task 3.
- §3.4 ephemeral port, report actual bound port, keep env override → Task 4.
- "update docs/README/skill" → Task 5.

**Backward compatibility:** `TemplateConfig.components` widens to allow `null` (additive); `meta.requiredTokens` still honored and unioned; `startHttpServer` gains a return field and a default-port change (explicit ports still reported verbatim — existing `7399` test passes); `DRUCKFORM_HTTP_PORT` still overrides.

**Cross-package note:** Task 3's fixture imports `tokenRef` from `"druckform"` (dist), so Step 7 builds the package before the load test. The marker is a non-enumerable instance property read by value, so it survives the esbuild bundle and the src/dist split (no module-identity dependency).

**Placeholder scan:** no TBD/TODO; every code step shows complete code; every test step shows the assertions.
