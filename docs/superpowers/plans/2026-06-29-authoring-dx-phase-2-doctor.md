# Authoring DX Phase 2 — Authoring Validation (`druck doctor`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `druck doctor --template <name> [--json]` command that resolves a template and validates the **authoring contract** of its components and config, emitting actionable `Finding[]` (human or JSON) — complementing `druck lint`, which validates a *document*.

**Architecture:** `doctor` mirrors `lint.ts` (bundled-templates resolution, `Finding[]` accumulation, JSON/human emit, non-zero exit on errors). It needs each component's resolved **source path** to inspect declarative `emits` text and scan TS source — so we first thread `sourcePath` through `ResolvedComponentEntry` (the resolver already computes it). Checks run over the loaded `ComponentDef` (meta, schema, `requiredTokens`), the raw source file, and one render-based probe for the `document` shell.

**Tech Stack:** TypeScript (ESM), `js-yaml`, `zod`, `yargs`, `vitest`, pnpm workspace.

## Global Constraints

- Node.js ≥ 22; pnpm; tests via `vitest`. Run all commands from repo root: `/Users/torbenhartmann/Documents/customers/private/druckform`.
- **Commit after each task** with `git add` of exactly the files that task touched.
- Existing tests must keep passing. Findings reuse the existing `Finding` type; `doctor` reuses the `LintContract` output shape (`{ schemaVersion, ok, findings }`).
- Depends on **Phase 1**: in-process component loader and the `renderComponent` test helper (`tests/helpers/render-component.ts`) exist.
- Design source: `docs/superpowers/specs/2026-06-29-authoring-dx-design.md` §3 Phase 2.

---

### Task 1: `sourcePath` plumbing + `druck doctor` skeleton (load + meta checks)

**Files:**
- Modify: `packages/druckform/src/sdk/types.ts` (`ResolvedComponentEntry` gains `sourcePath`)
- Modify: `packages/druckform/src/template/resolver.ts` (set `sourcePath`)
- Create: `packages/druckform/src/commands/doctor.ts`
- Modify: `packages/druckform/src/cli.ts` (register `doctor`)
- Test: `packages/druckform/tests/integration/doctor.test.ts`

**Interfaces:**
- Consumes: `loadAllTemplates`, `resolveTemplate`, `Finding`, `LintContract`, `ResolvedTemplate`.
- Produces: `doctorCommand(template: string, json: boolean): Promise<void>`; `ResolvedComponentEntry.sourcePath: string`.

- [ ] **Step 1: Write the failing test** — `tests/integration/doctor.test.ts`:
```ts
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { doctorCommand } from "../../src/commands/doctor.js";

function capture(): { writes: string[]; exits: number[]; restore: () => void } {
  const writes: string[] = [];
  const exits: number[] = [];
  const w = vi.spyOn(process.stdout, "write").mockImplementation((s) => {
    writes.push(String(s));
    return true;
  });
  const e = vi.spyOn(process, "exit").mockImplementation((n) => {
    exits.push(n ?? 0);
    throw new Error("exit");
  });
  return { writes, exits, restore: () => { w.mockRestore(); e.mockRestore(); } };
}

describe("druck doctor", () => {
  it("reports ok for the bundled base template", async () => {
    const { writes, restore } = capture();
    await doctorCommand("base", true);
    const out = JSON.parse(writes.join(""));
    expect(out.schemaVersion).toBe("1");
    expect(out.ok).toBe(true);
    expect(out.findings).toEqual([]);
    restore();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter druckform exec vitest run tests/integration/doctor.test.ts` → FAIL (module missing).

- [ ] **Step 3: Add `sourcePath` to `ResolvedComponentEntry`** — in `src/sdk/types.ts`:
```ts
export interface ResolvedComponentEntry {
  def: ComponentDef;
  defaults: Record<string, string>; // merged param defaults from inheritance chain
  sourcePath: string; // absolute path to the component's source file
}
```

- [ ] **Step 4: Set `sourcePath` in the resolver** — in `src/template/resolver.ts`, the `Promise.all` over `mergedComponents` already destructures `{ sourcePath, defaults }`; include it in the entry:
```ts
  await Promise.all(
    [...mergedComponents.entries()].map(async ([compName, { sourcePath, defaults }]) => {
      const def = await loadComponent(sourcePath, "");
      components[compName] = { def, defaults, sourcePath };
    }),
  );
```

- [ ] **Step 5: Create `src/commands/doctor.ts`** (skeleton + load-failure + meta checks):
```ts
import fs from "node:fs";
import path from "node:path";
import type { Finding, LintContract, ResolvedTemplate } from "../sdk/types.js";
import { loadAllTemplates } from "../template/loader.js";
import { resolveTemplate } from "../template/resolver.js";

const _t1 = path.resolve(new URL("../../templates", import.meta.url).pathname);
const BUNDLED_TEMPLATES = fs.existsSync(_t1)
  ? _t1
  : path.resolve(new URL("../templates", import.meta.url).pathname);

function checkMeta(resolved: ResolvedTemplate, findings: Finding[]): void {
  for (const [name, entry] of Object.entries(resolved.components)) {
    if (!entry.def.meta?.name) {
      findings.push({ severity: "error", component: name, message: "Component meta.name is missing" });
    }
    if (typeof entry.def.meta?.acceptsChildren !== "boolean") {
      findings.push({
        severity: "warning",
        component: name,
        message: "meta.acceptsChildren should be a boolean",
      });
    }
  }
}

export async function doctorCommand(template: string, json: boolean): Promise<void> {
  const all = (() => {
    try {
      return loadAllTemplates(BUNDLED_TEMPLATES, process.env.DRUCKFORM_TEMPLATES_DIR);
    } catch (err) {
      return err instanceof Error ? err : new Error(String(err));
    }
  })();

  const findings: Finding[] = [];
  let resolved: ResolvedTemplate | null = null;

  if (all instanceof Error) {
    findings.push({ severity: "error", component: "template", message: all.message });
  } else {
    try {
      resolved = await resolveTemplate(template, all);
    } catch (err) {
      findings.push({
        severity: "error",
        component: "template",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (resolved) {
    checkMeta(resolved, findings);
    // further checks added in later tasks
  }

  const contract: LintContract = { schemaVersion: "1", ok: findings.length === 0, findings };
  if (json) {
    process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
  } else if (contract.ok) {
    console.log(`✓ Template '${template}' looks healthy.`);
  } else {
    for (const f of findings) console.error(`[${f.severity}] ${f.component}: ${f.message}`);
  }
  if (!contract.ok) process.exit(1);
}
```

- [ ] **Step 6: Register `doctor` in `src/cli.ts`** — add a command block after `lint` (mirror its option style):
```ts
  .command(
    "doctor",
    "Validate a template's components and config (authoring lint)",
    (y) => y.option("template", { alias: "t", type: "string", demandOption: true }).option("json", { type: "boolean", default: false }),
    async (argv) => {
      await doctorCommand(argv.template, argv.json);
    },
  )
```
and `import { doctorCommand } from "./commands/doctor.js";` at the top.

- [ ] **Step 7: Run the test + typecheck**
```bash
pnpm --filter druckform exec vitest run tests/integration/doctor.test.ts
pnpm --filter druckform typecheck
```
Expected: PASS; `tsc` clean. (Adding `sourcePath` is additive; existing `{ def, defaults }` consumers still compile because they read named fields.)

- [ ] **Step 8: Run the resolver/lint suites for regressions**
```bash
pnpm --filter druckform exec vitest run tests/unit/template-resolver.test.ts tests/integration/lint.test.ts
```
Expected: PASS.

- [ ] **Step 9: Commit**
```bash
git add packages/druckform/src/sdk/types.ts packages/druckform/src/template/resolver.ts packages/druckform/src/commands/doctor.ts packages/druckform/src/cli.ts packages/druckform/tests/integration/doctor.test.ts
git commit -m "feat(druckform): add druck doctor with sourcePath plumbing and meta checks"
```

---

### Task 2: Declarative `emits` slot/param validation

**Files:**
- Modify: `packages/druckform/src/commands/doctor.ts`
- Test fixtures: `packages/druckform/tests/fixtures/templates/badslot/template.yaml`, `.../badslot/components/typo.component.yaml`
- Test: extend `packages/druckform/tests/integration/doctor.test.ts`

**Interfaces:**
- Consumes: `ResolvedComponentEntry.sourcePath` (Task 1).
- Produces: `checkDeclarativeSlots(resolved, findings)`.

- [ ] **Step 1: Write the failing test + fixtures**

`tests/fixtures/templates/badslot/template.yaml`:
```yaml
name: badslot
extends: base
components:
  card:
    source: components/typo.component.yaml
```
`tests/fixtures/templates/badslot/components/typo.component.yaml`:
```yaml
name: card
description: card with a typo slot
params:
  title: { type: string, required: true }
slots:
  children: true
emits: |
  \section{{{titel}}}
  {{children}}
```
Add to `doctor.test.ts`:
```ts
it("flags a declarative emits slot that matches no param", async () => {
  const USER = path.resolve(import.meta.dirname, "../fixtures/templates");
  process.env.DRUCKFORM_TEMPLATES_DIR = USER;
  const { writes, restore } = capture();
  await expect(doctorCommand("badslot", true)).rejects.toThrow("exit");
  const out = JSON.parse(writes.join(""));
  expect(out.ok).toBe(false);
  expect(out.findings.some((f: { message: string }) => /unknown slot '\{\{titel\}\}'/i.test(f.message))).toBe(true);
  process.env.DRUCKFORM_TEMPLATES_DIR = undefined;
  restore();
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement `checkDeclarativeSlots`** in `doctor.ts` (read `.yaml`/`.yml` sources, parse, validate slot names):
```ts
import yaml from "js-yaml";

interface DeclYaml {
  name: string;
  params?: Record<string, { type?: string }>;
  slots?: { children?: boolean };
  emits?: string;
}

const DOCUMENT_SLOTS = new Set(["stylePreamble", "componentPreamble", "documentclass", "body"]);

function checkDeclarativeSlots(resolved: ResolvedTemplate, findings: Finding[]): void {
  for (const [name, entry] of Object.entries(resolved.components)) {
    const ext = entry.sourcePath.toLowerCase();
    if (!ext.endsWith(".yaml") && !ext.endsWith(".yml")) continue;
    const spec = yaml.load(fs.readFileSync(entry.sourcePath, "utf8")) as DeclYaml;
    const emits = spec.emits ?? "";
    const params = new Set(Object.keys(spec.params ?? {}));
    const acceptsChildren = spec.slots?.children === true;
    for (const m of emits.matchAll(/\{\{([^}]+)\}\}/g)) {
      const slot = (m[1] ?? "").trim();
      const ok =
        params.has(slot) ||
        (slot === "children" && acceptsChildren) ||
        slot.startsWith("fm.") ||
        (name === "document" && DOCUMENT_SLOTS.has(slot));
      if (!ok) {
        findings.push({
          severity: "error",
          component: name,
          message: `emits references unknown slot '{{${slot}}}' (no matching param/children/fm.*/document slot)`,
        });
      }
    }
  }
}
```
Call `checkDeclarativeSlots(resolved, findings)` in `doctorCommand` after `checkMeta`.

- [ ] **Step 4: Run the test + typecheck** → PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/druckform/src/commands/doctor.ts packages/druckform/tests/fixtures/templates/badslot packages/druckform/tests/integration/doctor.test.ts
git commit -m "feat(druckform): doctor validates declarative emits slots against params"
```

---

### Task 3: Token-drift + unescaped-interpolation heuristics (TS source scan)

**Files:**
- Modify: `packages/druckform/src/commands/doctor.ts`
- Test fixtures: `packages/druckform/tests/fixtures/templates/tokendrift/template.yaml`, `.../tokendrift/components/drift.ts`
- Test: extend `doctor.test.ts`

**Interfaces:**
- Produces: `checkTsSource(resolved, findings)`.

- [ ] **Step 1: Write the failing test + fixtures**

`tests/fixtures/templates/tokendrift/template.yaml`:
```yaml
name: tokendrift
extends: base
components:
  drift:
    source: components/drift.ts
```
`tests/fixtures/templates/tokendrift/components/drift.ts`:
```ts
import { z } from "zod";
import type { RenderCtx } from "druckform";

export const schema = z.object({ title: z.string() });
export const meta = { name: "drift", description: "uses warning token without declaring it", acceptsChildren: false };

export function render(params: { title: string }, _children: string, ctx: RenderCtx): string {
  return `${ctx.token("warning")}{${params.title}}`; // 'warning' not in requiredTokens
}
```
Add to `doctor.test.ts`:
```ts
it("warns when a TS component uses a token it does not declare", async () => {
  const USER = path.resolve(import.meta.dirname, "../fixtures/templates");
  process.env.DRUCKFORM_TEMPLATES_DIR = USER;
  const { writes, restore } = capture();
  await expect(doctorCommand("tokendrift", true)).rejects.toThrow("exit");
  const out = JSON.parse(writes.join(""));
  expect(out.findings.some((f: { message: string }) => /token 'warning'/.test(f.message))).toBe(true);
  process.env.DRUCKFORM_TEMPLATES_DIR = undefined;
  restore();
});
```
(Note: a `warning`-only finding keeps `ok` true unless another error exists; here the token-drift finding is a `warning` severity but `ok` is `findings.length === 0`, so it still flips `ok` to false and exits 1. Keep that behavior — any finding fails doctor. If softer behavior is wanted later, change `ok` to "no error-severity findings"; out of scope here.)

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement `checkTsSource`** in `doctor.ts`:
```ts
function checkTsSource(resolved: ResolvedTemplate, findings: Finding[]): void {
  for (const [name, entry] of Object.entries(resolved.components)) {
    if (!/\.(ts|js|mjs)$/i.test(entry.sourcePath)) continue;
    const src = fs.readFileSync(entry.sourcePath, "utf8");
    const used = new Set<string>();
    for (const m of src.matchAll(/(?:ctx\.token|tokenRef)\(\s*["']([^"']+)["']\s*\)/g)) {
      if (m[1]) used.add(m[1]);
    }
    for (const token of used) {
      if (!entry.def.requiredTokens.has(token)) {
        findings.push({
          severity: "warning",
          component: name,
          message: `uses token '${token}' but does not declare it (add tokenRef("${token}") or meta.requiredTokens)`,
        });
      }
    }
    // Heuristic: interpolating a param without escaping (only a hint; low confidence).
    if (/\$\{\s*params\.\w+\s*\}/.test(src) && !/escapeTeX|Tex`/.test(src)) {
      findings.push({
        severity: "warning",
        component: name,
        message: "interpolates params.* without escapeTeX/Tex — verify user input is escaped",
      });
    }
  }
}
```
Call it after `checkDeclarativeSlots`.

- [ ] **Step 4: Run the test + typecheck** → PASS.

- [ ] **Step 5: Confirm no false positive on bundled `callout`** — `callout.ts` uses `ctx.token("warning")`/`ctx.token("accent")` and declares both in `meta.requiredTokens`, so `druck doctor -t report` must stay clean of token-drift findings:
```bash
node packages/druckform/dist/cli.js doctor --template report --json 2>/dev/null || pnpm --filter druckform exec vitest run tests/integration/doctor.test.ts
```
Expected: report's callout produces no token-drift finding. (Build first if running the CLI.)

- [ ] **Step 6: Commit**
```bash
git add packages/druckform/src/commands/doctor.ts packages/druckform/tests/fixtures/templates/tokendrift packages/druckform/tests/integration/doctor.test.ts
git commit -m "feat(druckform): doctor warns on token drift and unescaped param interpolation"
```

---

### Task 4: `document` shell body-marker check (render probe) + config checks

**Files:**
- Modify: `packages/druckform/src/commands/doctor.ts`
- Test fixtures: `packages/druckform/tests/fixtures/templates/nomarker/template.yaml`, `.../nomarker/components/document.ts`
- Test: extend `doctor.test.ts`

**Interfaces:**
- Produces: `checkDocumentShell(resolved, findings)` — renders the `document` component with a probe `DocumentLayout` and checks the output contains `DRUCKFORM_BODY`.

- [ ] **Step 1: Write the failing test + fixtures**

`tests/fixtures/templates/nomarker/template.yaml`:
```yaml
name: nomarker
extends: base
components:
  document:
    source: components/document.ts
```
`tests/fixtures/templates/nomarker/components/document.ts`:
```ts
import { z } from "zod";
import type { BlockElement, DocumentLayout, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = { name: "document", description: "broken shell — forgets the body marker", acceptsChildren: true };

export function render(_p: unknown, _c: string, _ctx: RenderCtx, el?: BlockElement | DocumentLayout): string {
  if (!el || el.kind !== "document") return "";
  return `${el.stylePreamble}\n\\begin{document}\n\\end{document}`; // no DRUCKFORM_BODY
}
```
Add to `doctor.test.ts`:
```ts
it("errors when a document override omits the body marker", async () => {
  const USER = path.resolve(import.meta.dirname, "../fixtures/templates");
  process.env.DRUCKFORM_TEMPLATES_DIR = USER;
  const { writes, restore } = capture();
  await expect(doctorCommand("nomarker", true)).rejects.toThrow("exit");
  const out = JSON.parse(writes.join(""));
  expect(out.findings.some((f: { message: string }) => /body marker|DRUCKFORM_BODY/.test(f.message))).toBe(true);
  process.env.DRUCKFORM_TEMPLATES_DIR = undefined;
  restore();
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement `checkDocumentShell`** in `doctor.ts` (render probe; build the same minimal ctx the composer uses):
```ts
import type { DocumentLayout, RenderCtx } from "../sdk/types.js";

function checkDocumentShell(resolved: ResolvedTemplate, findings: Finding[]): void {
  const entry = resolved.components.document;
  if (!entry) return;
  const ctx: RenderCtx = {
    token: (n) => `\\druck${n.charAt(0).toUpperCase()}${n.slice(1)}`,
    style: { colors: {}, fonts: {}, spacing: {} },
    frontmatter: {},
  };
  const layout: DocumentLayout = {
    kind: "document",
    documentclass: "article",
    stylePreamble: "%STYLE",
    componentPreamble: "%COMPONENTS",
    frontmatter: {},
  };
  const out = entry.def.render({}, "", ctx, layout);
  if (!out.includes("DRUCKFORM_BODY")) {
    findings.push({
      severity: "error",
      component: "document",
      message: "document shell must emit the body marker DRUCKFORM_BODY (declarative: {{body}}); the composer substitutes the rendered body there",
    });
  }
}
```
Call it after `checkTsSource`. (`Finding`, `ResolvedTemplate` are already imported; add `DocumentLayout`, `RenderCtx`.)

- [ ] **Step 4: Run the test + the full suite + typecheck**
```bash
pnpm --filter druckform exec vitest run tests/integration/doctor.test.ts
pnpm --filter druckform exec vitest run
pnpm --filter druckform typecheck
```
Expected: PASS; bundled `base` (whose default `document` emits the marker) stays healthy.

- [ ] **Step 5: Commit**
```bash
git add packages/druckform/src/commands/doctor.ts packages/druckform/tests/fixtures/templates/nomarker packages/druckform/tests/integration/doctor.test.ts
git commit -m "feat(druckform): doctor verifies the document shell emits the body marker"
```

---

### Task 5: Docs + changeset

**Files:**
- Modify: `docs/extending-druckform.md` (CLI reference table + a "validate your template" note)
- Modify: `README.md` (CLI usage list)
- Create: `.changeset/authoring-dx-doctor.md`

- [ ] **Step 1: Document** — in `docs/extending-druckform.md`, add `druck doctor` to the §1 CLI reference table (`required: --template/-t`, `optional: --json`, output `LintContract`) and a short subsection in §6 ("Validate a template you're authoring with `druck doctor -t <name>` — it checks component exports, declarative slot/param mismatches, token drift, and that any `document` shell emits the body marker."). Add the command to `README.md`'s CLI list.

- [ ] **Step 2: Changeset** — `.changeset/authoring-dx-doctor.md`:
```markdown
---
"druckform": minor
---

Add `druck doctor --template <name>` — an authoring linter that validates a
template's components and config: missing exports, declarative `emits` slots that
match no param, style-token drift, unescaped param interpolation, and a `document`
shell that forgets the body marker. JSON output via `--json`.
```

- [ ] **Step 3: Verify lint/build and commit**
```bash
pnpm lint && pnpm --filter druckform build
git add docs/extending-druckform.md README.md .changeset/authoring-dx-doctor.md
git commit -m "docs(druckform): document druck doctor (authoring validation)"
```

---

## Final verification
```bash
pnpm --filter druckform exec vitest run
pnpm lint && pnpm turbo typecheck && pnpm turbo build && pnpm turbo test
node packages/druckform/dist/cli.js doctor --template base --json     # → ok:true
node packages/druckform/dist/cli.js doctor --template report --json    # → ok:true (callout declares its tokens)
```

## Self-Review

**Spec coverage (§3 Phase 2):** required-export/load failures + meta checks (Task 1, via resolve catch + `checkMeta`) · declarative slot/param typo guard (Task 2) · token drift + unescaped-interpolation heuristic (Task 3) · document-override body-marker (Task 4) · reserved `block:`/`document` + bad `extends` surface as findings via the resolve-catch in Task 1 (`loadAllTemplates`/`linearize` throw those) · docs (Task 5).

**Placeholder scan:** every code step shows complete code; each test step has assertions; commands list expected output.

**Type consistency:** `doctorCommand(template, json)` matches the cli registration; `ResolvedComponentEntry.sourcePath` is added in Task 1 and consumed in Tasks 2–3; `checkDocumentShell` builds a `RenderCtx` with the `frontmatter` field (extensibility Phase 3) and a `DocumentLayout` matching `src/sdk/types.ts`; findings use `Finding`/`LintContract`.

**Note on `ok` semantics:** `ok = findings.length === 0`, so any warning also fails `doctor` (exit 1). This is intentional for an authoring gate; relaxing to error-only is a deliberate future change, called out in Task 3 Step 1.
