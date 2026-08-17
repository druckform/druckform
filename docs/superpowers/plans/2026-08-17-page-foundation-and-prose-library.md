# Page Foundation & Shared Prose Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give druckform a real page foundation (A4-by-default paper setup, opt-in cover/title block and table of contents) and a ten-component shared prose library in `base`, fixing six defects found while designing it.

**Architecture:** Page setup becomes a new `tokens.page` style group compiled to a `\geometry{…}` call, with a bare `\usepackage{geometry}` in the engine core so custom shells cannot cause an option clash. The prose library lands in `base` so it is inherited by every template; the admonition family is one `callout` implementation behind friendly names (`note`/`tip`/`warning`/`danger`/`infobox`) registered via cross-name `extends` + `defaults`. Two engine prerequisites (Task 1) unblock that aliasing.

**Tech Stack:** TypeScript (ESM, Node ≥ 22), pnpm workspaces + turbo, vitest, ajv (style schema), zod (component schemas), esbuild (TS component loader), Tectonic (LaTeX), biome (lint/format).

**Spec:** `docs/superpowers/specs/2026-08-17-page-foundation-and-prose-library-design.md`

## Global Constraints

- **Zero new LaTeX packages.** Everything must use the engine core (`fontspec`, `xcolor`, `graphicx`, `hyperref`, `ulem`, and the `geometry` added in Task 3) plus `tabularx`/`booktabs`/`array`/`adjustbox`, which existing components already pull. Adding any other package deepens the offline gap this plan closes. No `tcolorbox`, no `fancyhdr`, no `enumitem`.
- **Node ≥ 22, pnpm 9.13.2.** Do not change these floors.
- **Default paper size is `a4`.** Never `letter`.
- **Colour tokens are `#RRGGBB`** — exactly six hex digits, `#` prefixed. The style schema rejects anything else.
- **Frontmatter values are always strings.** `parse/parser.ts` coerces with `String(v)`, so a YAML `toc: true` arrives as the string `"true"`. Compare against `"true"`; never add a boolean frontmatter type.
- **After editing `STYLE_SCHEMA`,** run `pnpm --filter @druckform/core schema:sync`. `tests/unit/style-schema-sync.test.ts` fails until you do.
- **Run `pnpm -w build` (not a single package build)** before running the CLI by hand — the repo has been bitten by tsc regressions that only a workspace build catches.
- **Every bundled template must stay `doctor`-clean:** `druck doctor --template <name> --json` returns `ok: true` for `base`, `report` and `examples`.
- **Test command:** `pnpm --filter @druckform/core test` (vitest with 80% line-coverage thresholds). Single file: `cd packages/druckform && npx vitest run <path> --coverage=false`.

---

### Task 1: Engine prerequisites — cross-name `extends` and key-based discovery

Two engine defects block every alias in this plan. Verified by running them, not by reading code:
`note: { extends: base.callout }` fails with `Error: Component note extends unknown parent`, and `druck components` reports every alias as `callout`.

**Files:**
- Modify: `packages/druckform/src/template/resolver.ts` (the `override.extends` branch, ~lines 62-71)
- Modify: `packages/druckform/src/commands/components.ts` (~lines 21-23)
- Test: `packages/druckform/tests/unit/template-resolver.test.ts` (existing file — append)
- Test: `packages/druckform/tests/integration/components-contract.test.ts` (create)
- Test fixture: `packages/druckform/tests/fixtures/templates/aliasing/template.yaml` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `extends: <template>.<component>` resolves the component named after the dot, enabling `alias: { extends: base.callout, defaults: {...} }`. `druck components --json` emits the *registration key* as `name`. Tasks 7 and 14 depend on both.

- [ ] **Step 1: Create the two aliasing fixtures**

`packages/druckform/tests/fixtures/templates/aliasing/template.yaml` — `infobox` comes from bundled `base`; `restated` aliases it under a new name:

```yaml
name: aliasing
description: "Fixture: cross-name component aliasing via extends."
extends: base
components:
  restated:
    extends: base.infobox
    defaults:
      accent: accent
```

`packages/druckform/tests/fixtures/templates/aliasbad/template.yaml` — names a target that does not exist:

```yaml
name: aliasbad
description: "Fixture: extends target that does not exist."
extends: base
components:
  thing:
    extends: base.doesNotExist
```

- [ ] **Step 2: Write the failing resolver tests**

Append to `packages/druckform/tests/unit/template-resolver.test.ts`. That file builds throwaway templates with its own `makeTempTemplates()` helper and does **not** define shared path constants, so declare the two paths inside this new block. `loadAllTemplates(bundledDir, userDir)` is the two-argument form.

```ts
describe("cross-name component extends", () => {
  const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
  const FIXTURES = path.resolve(import.meta.dirname, "../fixtures/templates");

  it("aliases a differently-named parent component", async () => {
    const all = loadAllTemplates(BUNDLED, FIXTURES);
    const resolved = await resolveTemplate("aliasing", all);

    // Registered under the new key...
    expect(resolved.components.restated).toBeDefined();
    // ...but backed by base's infobox implementation.
    expect(resolved.components.restated?.sourcePath).toBe(
      resolved.components.infobox?.sourcePath,
    );
    // toMatchObject, not toEqual: once Task 7 registers infobox as an alias of
    // callout, the inherited defaults also carry `variant`.
    expect(resolved.components.restated?.defaults).toMatchObject({ accent: "accent" });
  });

  it("still supports same-name extends (report's infobox override)", async () => {
    const all = loadAllTemplates(BUNDLED, FIXTURES);
    const resolved = await resolveTemplate("report", all);
    expect(resolved.components.infobox?.defaults).toMatchObject({ accent: "warning" });
  });

  it("errors on an extends target that does not exist", async () => {
    const all = loadAllTemplates(BUNDLED, FIXTURES);
    // Previously the extends value was never parsed, so this silently resolved
    // to the same-named component instead of failing.
    await expect(resolveTemplate("aliasbad", all)).rejects.toThrow(
      /extends unknown parent 'base\.doesNotExist'/,
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/druckform && npx vitest run tests/unit/template-resolver.test.ts --coverage=false`
Expected: FAIL — `Component restated extends unknown parent`.

- [ ] **Step 4: Implement cross-name extends in the resolver**

In `packages/druckform/src/template/resolver.ts`, replace the `else if (override.extends)` branch:

```ts
      } else if (override.extends) {
        // `extends: <template>.<component>` names the parent being extended. The
        // component after the dot MAY differ from this entry's key — that is how a
        // friendly alias is declared (`note: { extends: base.callout }`). A value
        // with no dot is read as a bare component name. Previously the value was
        // never parsed and the key was used instead, so aliasing was impossible and
        // a typo'd target silently resolved to the same-named component.
        const dot = override.extends.lastIndexOf(".");
        const parentName = dot >= 0 ? override.extends.slice(dot + 1) : override.extends;
        const existing = mergedComponents.get(parentName);
        if (!existing) {
          throw new Error(
            `Component '${compName}' extends unknown parent '${override.extends}'`,
          );
        }
        mergedComponents.set(compName, {
          sourcePath: existing.sourcePath,
          templateDir: existing.templateDir,
          defaults: { ...existing.defaults, ...(override.defaults ?? {}) },
        });
      }
```

Note for the implementer: entries within one `template.yaml` are processed in declaration order, so a component being aliased must be declared **before** its aliases in the same file.

- [ ] **Step 5: Run the resolver tests to verify they pass**

Run: `cd packages/druckform && npx vitest run tests/unit/template-resolver.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 6: Write the failing components-contract test**

Create `packages/druckform/tests/integration/components-contract.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { componentsCommand } from "../../src/commands/components.js";

const FIXTURES = path.resolve(import.meta.dirname, "../fixtures/templates");

async function runComponents(template: string) {
  const writes: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((s) => {
    writes.push(String(s));
    return true;
  });
  process.env.DRUCKFORM_TEMPLATES_DIR = FIXTURES;
  try {
    await componentsCommand(template, true);
    return JSON.parse(writes.join(""));
  } finally {
    process.env.DRUCKFORM_TEMPLATES_DIR = undefined;
    vi.restoreAllMocks();
  }
}

describe("components contract reports the registration key", () => {
  it("lists an alias under its own name, not the implementation's meta.name", async () => {
    const out = await runComponents("aliasing");
    const names = out.components.map((c: { name: string }) => c.name);
    // `restated` is backed by infobox; discovery must advertise the invocable name.
    expect(names).toContain("restated");
    expect(names).toContain("infobox");
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd packages/druckform && npx vitest run tests/integration/components-contract.test.ts --coverage=false`
Expected: FAIL — `restated` missing; two entries named `infobox`.

- [ ] **Step 8: Emit the registration key from the components command**

In `packages/druckform/src/commands/components.ts`, change the map to iterate entries and use the key. The registration key is the name an author types in a directive, so it is the name discovery must report; `meta.name` is the implementation's own name and diverges for aliases.

```ts
    components: Object.entries(resolved.components).map(([name, { def, sourcePath }]) => {
```

and inside the returned object replace `name: def.meta.name,` with:

```ts
        name,
```

- [ ] **Step 9: Run the full core suite**

Run: `pnpm --filter @druckform/core test`
Expected: PASS, all tests.

- [ ] **Step 10: Commit**

```bash
git add packages/druckform/src/template/resolver.ts \
        packages/druckform/src/commands/components.ts \
        packages/druckform/tests/unit/template-resolver.test.ts \
        packages/druckform/tests/integration/components-contract.test.ts \
        packages/druckform/tests/fixtures/templates/aliasing/template.yaml
git commit -m "fix(core): resolve cross-name component extends and report registration keys

extends: <tpl>.<comp> never parsed its value, so aliasing one component
under another name was impossible and a typo'd target silently resolved
to the same-named component. druck components also reported meta.name,
hiding aliases from discovery."
```

---

### Task 2: Page tokens — types, schema, merge

**Files:**
- Modify: `packages/druckform/src/sdk/types.ts` (`StyleTokens`, `StyleConfig`)
- Modify: `packages/druckform/src/style/validate.ts` (`STYLE_SCHEMA`)
- Modify: `packages/druckform/src/style/merge.ts`
- Modify: `packages/druckform/schemas/style-v1.json` (regenerated, not hand-edited)
- Test: `packages/druckform/tests/unit/style-validate.test.ts` (append)
- Test: `packages/druckform/tests/unit/style-merge.test.ts` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: `PageSpec` (`{ size?: "a4" | "letter"; margin?: string; top?: string; bottom?: string; left?: string; right?: string }`), exported from `src/sdk/types.ts`; `StyleConfig.tokens.page?: PageSpec`; `StyleTokens.page: PageSpec`. Task 3 compiles it.

- [ ] **Step 1: Add the PageSpec type**

In `packages/druckform/src/sdk/types.ts`, after the `FontSpec` declaration:

```ts
/** Page geometry tokens. Compiled to a `\geometry{…}` call, not to a \druckX macro. */
export interface PageSpec {
  size?: "a4" | "letter";
  margin?: string;
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
}
```

Add `page: PageSpec;` to `StyleTokens`, and `page?: PageSpec;` to `StyleConfig["tokens"]`.

- [ ] **Step 2: Write the failing validation tests**

Append to `packages/druckform/tests/unit/style-validate.test.ts` (it already has a `writeStyle` helper and imports `loadStyle`):

```ts
describe("style schema: page tokens", () => {
  it("accepts a4 with a uniform margin", () => {
    const p = writeStyle({
      $schema: "style-v1",
      tokens: { page: { size: "a4", margin: "2.5cm" } },
    });
    expect(loadStyle(p).tokens.page).toEqual({ size: "a4", margin: "2.5cm" });
  });

  it("accepts letter and per-side margins", () => {
    const p = writeStyle({
      $schema: "style-v1",
      tokens: { page: { size: "letter", top: "3cm", bottom: "2cm" } },
    });
    expect(loadStyle(p).tokens.page?.size).toBe("letter");
  });

  it("rejects an unknown paper size rather than falling back", () => {
    const p = writeStyle({ $schema: "style-v1", tokens: { page: { size: "a5" } } });
    expect(() => loadStyle(p)).toThrow(/Invalid style\.yaml/);
  });

  it("rejects an unknown key inside page", () => {
    const p = writeStyle({ $schema: "style-v1", tokens: { page: { bleed: "3mm" } } });
    expect(() => loadStyle(p)).toThrow(/Invalid style\.yaml/);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd packages/druckform && npx vitest run tests/unit/style-validate.test.ts --coverage=false`
Expected: FAIL — `additionalProperties` rejects `page`.

- [ ] **Step 4: Add page to STYLE_SCHEMA**

In `packages/druckform/src/style/validate.ts`, inside `STYLE_SCHEMA.properties.tokens.properties`, after `spacing`:

```ts
        page: {
          type: "object",
          properties: {
            size: { enum: ["a4", "letter"] },
            margin: { type: "string" },
            top: { type: "string" },
            bottom: { type: "string" },
            left: { type: "string" },
            right: { type: "string" },
          },
          additionalProperties: false,
        },
```

- [ ] **Step 5: Regenerate the editor-facing schema**

Run: `pnpm --filter @druckform/core schema:sync`
Expected: `wrote schemas/style-v1.json`. This keeps `style-schema-sync.test.ts` green; never hand-edit that JSON.

- [ ] **Step 6: Write the failing merge test**

`mergeStyle` enumerates `colors`/`fonts`/`spacing` and silently drops every other key, so page tokens would vanish whenever a template style merges with `--style`. Append to `packages/druckform/tests/unit/style-merge.test.ts`:

```ts
describe("mergeStyle: page tokens", () => {
  it("keeps page tokens from the base style", () => {
    const base = { $schema: "style-v1", tokens: { page: { size: "a4" as const } } };
    expect(mergeStyle(base, undefined).tokens.page).toEqual({ size: "a4" });
  });

  it("keeps page tokens supplied only by the override", () => {
    const over = { $schema: "style-v1", tokens: { page: { margin: "3cm" } } };
    expect(mergeStyle(undefined, over).tokens.page).toEqual({ margin: "3cm" });
  });

  it("merges per key, override winning", () => {
    const base = { $schema: "style-v1", tokens: { page: { size: "a4" as const, margin: "2cm" } } };
    const over = { $schema: "style-v1", tokens: { page: { margin: "3cm" } } };
    expect(mergeStyle(base, over).tokens.page).toEqual({ size: "a4", margin: "3cm" });
  });
});
```

- [ ] **Step 7: Run to verify they fail**

Run: `cd packages/druckform && npx vitest run tests/unit/style-merge.test.ts --coverage=false`
Expected: FAIL — `tokens.page` is `undefined`.

- [ ] **Step 8: Merge page tokens**

In `packages/druckform/src/style/merge.ts`, add to the `tokens` object of `merged`:

```ts
      page: { ...(b.page ?? {}), ...(o.page ?? {}) },
```

- [ ] **Step 9: Run the full core suite**

Run: `pnpm -w build && pnpm --filter @druckform/core test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/druckform/src/sdk/types.ts \
        packages/druckform/src/style/validate.ts \
        packages/druckform/src/style/merge.ts \
        packages/druckform/schemas/style-v1.json \
        packages/druckform/tests/unit/style-validate.test.ts \
        packages/druckform/tests/unit/style-merge.test.ts
git commit -m "feat(core): add tokens.page style group (size, margin, per-side)"
```

---

### Task 3: Compile page tokens to `\geometry` and add geometry to the engine core

**Files:**
- Modify: `packages/druckform/src/style/compiler.ts`
- Modify: `packages/druckform/src/latex/composer.ts` (`ENGINE_CORE`)
- Test: `packages/druckform/tests/unit/style-compiler.test.ts` (append)

**Interfaces:**
- Consumes: `PageSpec`, `StyleConfig.tokens.page` (Task 2).
- Produces: `compileStyle` output now contains a `\geometry{…}` line; `ENGINE_CORE` contains `\usepackage{geometry}`. Task 4 lints against the clashing form; Task 13 asserts A4 in the PDF.

- [ ] **Step 1: Write the failing compiler tests**

Append to `packages/druckform/tests/unit/style-compiler.test.ts`:

```ts
describe("page geometry", () => {
  it("defaults to a4 when no page tokens are given", () => {
    const out = compileStyle({ $schema: "style-v1", tokens: {} });
    expect(out).toContain("\\geometry{a4paper}");
  });

  it("maps letter to letterpaper", () => {
    const out = compileStyle({
      $schema: "style-v1",
      tokens: { page: { size: "letter" } },
    });
    expect(out).toContain("\\geometry{letterpaper}");
  });

  it("appends a uniform margin", () => {
    const out = compileStyle({
      $schema: "style-v1",
      tokens: { page: { size: "a4", margin: "2.5cm" } },
    });
    expect(out).toContain("\\geometry{a4paper,margin=2.5cm}");
  });

  it("puts per-side margins after the uniform margin so they win", () => {
    const out = compileStyle({
      $schema: "style-v1",
      tokens: { page: { margin: "2cm", top: "4cm" } },
    });
    // geometry applies options left to right; top= must follow margin=.
    expect(out).toContain("\\geometry{a4paper,margin=2cm,top=4cm}");
  });

  it("never emits \\usepackage[...]{geometry} — the core loads it bare", () => {
    const out = compileStyle({ $schema: "style-v1", tokens: { page: { size: "a4" } } });
    expect(out).not.toMatch(/usepackage\[[^\]]*\]\{geometry\}/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/druckform && npx vitest run tests/unit/style-compiler.test.ts --coverage=false`
Expected: FAIL — no `\geometry` in the output.

- [ ] **Step 3: Emit the geometry call**

In `packages/druckform/src/style/compiler.ts`, add `PageSpec` to the existing type import from `../sdk/types.js`, then add the paper map and helper near the top:

```ts
const PAPER_OPTION: Record<NonNullable<PageSpec["size"]>, string> = {
  a4: "a4paper",
  letter: "letterpaper",
};

/**
 * Page tokens become a `\geometry{…}` call, not a `\usepackage[…]{geometry}`:
 * geometry raises "Option clash" if loaded twice with options, and document
 * shells are free to load it. The engine core loads it bare; this applies the
 * options afterwards. Per-side values are emitted after `margin` because
 * geometry honours the last option it sees.
 */
export function compilePageGeometry(page: PageSpec = {}): string {
  const opts: string[] = [PAPER_OPTION[page.size ?? "a4"]];
  if (page.margin) opts.push(`margin=${page.margin}`);
  for (const side of ["top", "bottom", "left", "right"] as const) {
    const value = page[side];
    if (value) opts.push(`${side}=${value}`);
  }
  return `\\geometry{${opts.join(",")}}`;
}
```

Then, inside `compileStyle`, after the colour loop and before the font handling:

```ts
  lines.push(compilePageGeometry(config.tokens.page));
```

Also add `page: config.tokens.page ?? {},` to the object returned by `extractTokens`.

**Do not touch `src/style/tokens.ts`.** `checkTokenCoverage` builds its `available` set from colours/spacing/fonts because those become `\druckX` macros a component can reference. Page tokens are not component-referenceable, so adding them there would let a component declare a bogus required dependency on `size`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/druckform && npx vitest run tests/unit/style-compiler.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 5: Add bare geometry to the engine core**

In `packages/druckform/src/latex/composer.ts`, add to the `ENGINE_CORE` array after `"\\usepackage{graphicx}",`:

```ts
  // Loaded bare, with no options: the style preamble applies page setup via
  // \geometry{…} afterwards, so a document shell can also call \geometry
  // without triggering "Option clash for package geometry".
  "\\usepackage{geometry}",
```

- [ ] **Step 6: Run the full core suite**

Run: `pnpm -w build && pnpm --filter @druckform/core test`
Expected: PASS. If a composer snapshot-style assertion counts preamble lines, update it to expect the extra `\usepackage{geometry}`.

- [ ] **Step 7: Verify a real render is A4**

```bash
mkdir -p /tmp/df-a4 && printf -- '---\ntemplate: base\n---\n\n# Hello\n\nBody.\n' > /tmp/df-a4/d.md
printf '$schema: "style-v1"\ntokens:\n  colors:\n    accent: "#2E5AAC"\n' > /tmp/df-a4/s.yaml
node packages/druckform/dist/cli.js render --engine docker --template base \
  --in /tmp/df-a4/d.md --style /tmp/df-a4/s.yaml --out /tmp/df-a4/o.pdf --json
pdfinfo /tmp/df-a4/o.pdf | grep 'Page size'
```

Expected: `595.28 x 841.89 pts (A4)`. Before this task it was `612 x 792 pts (letter)`.

- [ ] **Step 8: Commit**

```bash
git add packages/druckform/src/style/compiler.ts \
        packages/druckform/src/latex/composer.ts \
        packages/druckform/tests/unit/style-compiler.test.ts
git commit -m "feat(core): compile page tokens to \\geometry, default A4

Bundled templates silently produced US Letter because nothing emitted
geometry and \\documentclass{article} defaults to letterpaper."
```

---

### Task 4: `doctor` check for the geometry option clash

**Files:**
- Modify: `packages/druckform/src/commands/doctor.ts`
- Modify: `tests/e2e/fixtures/templates/acme/components/document.ts` (fix the clashing form)
- Test: `packages/druckform/tests/integration/doctor.test.ts` (existing — append)
- Test fixture: `packages/druckform/tests/fixtures/templates/geoclash/template.yaml` + `components/document.ts` (create)

**Interfaces:**
- Consumes: the engine-core geometry load (Task 3).
- Produces: a `severity: "error"` finding named `geometry-clash` semantics for shells using `\usepackage[…]{geometry}`.

- [ ] **Step 1: Create the offending fixture template**

Create `packages/druckform/tests/fixtures/templates/geoclash/template.yaml`:

```yaml
name: geoclash
description: "Fixture: document shell that clashes with the core geometry load."
extends: base
components:
  document:
    source: components/document.ts
```

Create `packages/druckform/tests/fixtures/templates/geoclash/components/document.ts`:

```ts
import type { BlockElement, DocumentLayout, RenderCtx } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "document", description: "clashing shell", acceptsChildren: true };

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement | DocumentLayout,
): string {
  if (!element || element.kind !== "document") return "DRUCKFORM_BODY";
  return [
    element.stylePreamble,
    element.componentPreamble,
    "\\usepackage[a4paper,margin=2cm]{geometry}",
    "\\begin{document}",
    "DRUCKFORM_BODY",
    "\\end{document}",
  ].join("\n");
}
```

- [ ] **Step 2: Write the failing doctor test**

Append to `packages/druckform/tests/integration/doctor.test.ts`. That file already defines a `capture()` helper returning `{ writes, exits, restore }`, and mocks `process.exit` to throw `"exit"` — so a *failing* doctor run must be awaited with `rejects.toThrow("exit")`. Reuse `capture()`; do not add a new helper.

```ts
describe("druck doctor: geometry option clash", () => {
  const USER = path.resolve(import.meta.dirname, "../fixtures/templates");

  it("flags a document shell that loads geometry with options", async () => {
    process.env.DRUCKFORM_TEMPLATES_DIR = USER;
    const { writes, restore } = capture();
    await expect(doctorCommand("geoclash", true)).rejects.toThrow("exit");
    const out = JSON.parse(writes.join(""));
    restore();
    process.env.DRUCKFORM_TEMPLATES_DIR = undefined;

    expect(out.ok).toBe(false);
    const finding = out.findings.find((f: { message: string }) => /geometry/.test(f.message));
    expect(finding).toBeDefined();
    expect(finding.severity).toBe("error");
    expect(finding.message).toMatch(/\\geometry\{/);
  });

  it("does not flag a shell that uses \\geometry{...}", async () => {
    process.env.DRUCKFORM_TEMPLATES_DIR = USER;
    const { writes, restore } = capture();
    await doctorCommand("customdoc", true);
    const out = JSON.parse(writes.join(""));
    restore();
    process.env.DRUCKFORM_TEMPLATES_DIR = undefined;

    expect(out.findings.some((f: { message: string }) => /geometry/.test(f.message))).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd packages/druckform && npx vitest run tests/integration/doctor.test.ts --coverage=false`
Expected: FAIL — no geometry finding produced.

- [ ] **Step 4: Add the check**

In `packages/druckform/src/commands/doctor.ts`, add the function next to the other `check*` helpers:

```ts
// The engine core loads geometry bare so styles can apply page setup via
// \geometry{…}. A component loading it again WITH options triggers LaTeX's
// "Option clash for package geometry", which surfaces as an opaque compile
// failure with no hint about the cause — so name it here instead.
// Matches both a .ts source (where the literal is escaped, \\usepackage) and a
// declarative `emits:` block (single backslash).
const GEOMETRY_CLASH = /\\{1,2}usepackage\[[^\]]*\]\{geometry\}/;

function checkGeometryClash(resolved: ResolvedTemplate, findings: Finding[]): void {
  for (const [name, entry] of Object.entries(resolved.components)) {
    let src: string;
    try {
      src = fs.readFileSync(entry.sourcePath, "utf8");
    } catch {
      continue;
    }
    if (GEOMETRY_CLASH.test(src)) {
      findings.push({
        severity: "error",
        component: name,
        message:
          "loads geometry with options (\\usepackage[...]{geometry}), which clashes " +
          "with the engine core's bare load — use \\geometry{...} instead, or set " +
          "tokens.page in the style",
      });
    }
  }
}
```

Call it from `doctorCommand` alongside the other checks:

```ts
  checkGeometryClash(resolved, findings);
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd packages/druckform && npx vitest run tests/integration/doctor.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 6: Fix the e2e acme fixture**

In `tests/e2e/fixtures/templates/acme/components/document.ts`, replace the clashing line:

```ts
    "\\usepackage[a4paper,margin=2.2cm]{geometry}",
```

with:

```ts
    // Bare \geometry, not \usepackage[...]{geometry}: the engine core already
    // loads the package, and loading it twice with options is an Option clash.
    "\\geometry{margin=2.2cm}",
```

- [ ] **Step 7: Verify all bundled templates and the e2e fixture are doctor-clean**

```bash
pnpm -w build
for t in base report examples; do
  node packages/druckform/dist/cli.js doctor --template "$t" --json
done
DRUCKFORM_TEMPLATES_DIR=tests/e2e/fixtures/templates \
  node packages/druckform/dist/cli.js doctor --template acme --json
```

Expected: `"ok": true` four times.

- [ ] **Step 8: Commit**

```bash
git add packages/druckform/src/commands/doctor.ts \
        packages/druckform/tests/integration/doctor.test.ts \
        packages/druckform/tests/fixtures/templates/geoclash \
        tests/e2e/fixtures/templates/acme/components/document.ts
git commit -m "feat(core): doctor flags geometry option clash in document shells"
```

---

### Task 5: `base` supplies defaults for every token it requires

Fixes defect 2: `druck lint --template report` against a style defining only `accent` fails with `Missing required style token 'warning'`. This must land **before** Task 6 adds a `danger` token, or every existing style file breaks the same way.

**Files:**
- Modify: `packages/druckform/templates/base/template.yaml`
- Test: `packages/druckform/tests/integration/bundled-template-tokens.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `base` declares `accent`, `warning` and `danger` colours. Task 6 relies on `danger` existing.

- [ ] **Step 1: Write the failing invariant test**

Create `packages/druckform/tests/integration/bundled-template-tokens.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeStyle } from "../../src/style/merge.js";
import { checkTokenCoverage, extractRequiredTokens } from "../../src/style/tokens.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");

// A bundled template must be usable with no external style at all. Otherwise the
// author has to divine which colours their chosen template needs — which is how
// `report` came to fail on any style that did not happen to define `warning`.
describe.each(["base", "report", "examples"])(
  "bundled template '%s' satisfies its own required tokens",
  (name) => {
    it("renders with no external style", async () => {
      const all = loadAllTemplates(BUNDLED, undefined);
      const resolved = await resolveTemplate(name, all);
      const style = mergeStyle(resolved.style, undefined);
      const findings = checkTokenCoverage(extractRequiredTokens(resolved), resolved, style);
      expect(findings).toEqual([]);
    });
  },
);
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/druckform && npx vitest run tests/integration/bundled-template-tokens.test.ts --coverage=false`
Expected: FAIL for `report` and `examples` — `Missing required style token 'warning'`.

- [ ] **Step 3: Declare the colours in base**

In `packages/druckform/templates/base/template.yaml`, replace the `style:` block:

```yaml
style:
  tokens:
    # Every token any bundled component declares as required must have a default
    # here, so a hand-written style that omits one gets a sensible colour instead
    # of a "Missing required style token" error. Users override freely via --style.
    colors:
      accent: "#2E5AAC"
      warning: "#B26A00"
      danger: "#B00020"
    page:
      size: a4
      margin: "2.5cm"
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/druckform && npx vitest run tests/integration/bundled-template-tokens.test.ts --coverage=false`
Expected: PASS for all three templates.

- [ ] **Step 5: Verify the original defect is gone**

```bash
pnpm -w build
printf '$schema: "style-v1"\ntokens:\n  colors:\n    accent: "#2E5AAC"\n' > /tmp/minimal.yaml
printf -- '---\ntemplate: report\n---\n\n# T\n\nBody.\n' > /tmp/min.md
node packages/druckform/dist/cli.js lint --in /tmp/min.md --style /tmp/minimal.yaml --json
```

Expected: `"ok": true`. Before this task: `Missing required style token 'warning'`.

- [ ] **Step 6: Run the full core suite and commit**

```bash
pnpm --filter @druckform/core test
git add packages/druckform/templates/base/template.yaml \
        packages/druckform/tests/integration/bundled-template-tokens.test.ts
git commit -m "fix(core): base declares defaults for every required token

report failed on any style that did not define 'warning'. Also sets the
default page tokens (a4, 2.5cm)."
```

---

### Task 6: `callout` — `tip` variant, real colour map, `accent` override

**Files:**
- Modify: `packages/druckform/templates/report/components/callout.ts` (still in `report` at this point; Task 7 moves it)
- Test: `packages/druckform/tests/unit/callout-component.test.ts` (create)

**Interfaces:**
- Consumes: the `danger` colour token from Task 5.
- Produces: `callout` schema `{ variant: "info"|"tip"|"warn"|"danger" (default "info"), title: string, accent?: string }`, `meta.requiredTokens = ["accent", "warning", "danger"]`. Task 7 aliases it.

- [ ] **Step 1: Write the failing tests**

Create `packages/druckform/tests/unit/callout-component.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const SRC = path.resolve(
  import.meta.dirname,
  "../../templates/report/components/callout.ts",
);

describe("callout variants map to distinct colour tokens", () => {
  it.each([
    ["info", "\\druckAccent"],
    ["tip", "\\druckAccent"],
    ["warn", "\\druckWarning"],
    ["danger", "\\druckDanger"],
  ])("variant %s uses %s", async (variant, expected) => {
    const out = await renderComponent(SRC, { variant, title: "T" }, { children: "body" });
    expect(out).toContain(expected);
  });

  // Regression: the old two-branch conditional sent everything except `warn` to
  // accent, so `danger` rendered identically to `info` and silently did nothing.
  it("danger is visually distinct from info", async () => {
    const danger = await renderComponent(SRC, { variant: "danger", title: "T" });
    const info = await renderComponent(SRC, { variant: "info", title: "T" });
    expect(danger).not.toBe(info);
  });
});

describe("callout accepts infobox's accent parameter", () => {
  it("an explicit accent overrides the variant colour", async () => {
    const out = await renderComponent(
      SRC,
      { variant: "info", title: "T", accent: "warning" },
      { children: "body" },
    );
    expect(out).toContain("\\druckWarning");
  });

  it("escapes the title", async () => {
    const out = await renderComponent(SRC, { title: "50% & rising" });
    expect(out).toContain("50\\% \\& rising");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/druckform && npx vitest run tests/unit/callout-component.test.ts --coverage=false`
Expected: FAIL — `danger` yields `\druckAccent`; `accent` param is stripped by zod.

- [ ] **Step 3: Rewrite the component**

Replace the schema, meta and render in `packages/druckform/templates/report/components/callout.ts` (keep the existing `preamble` export untouched):

```ts
export const schema = z.object({
  variant: z.enum(["info", "tip", "warn", "danger"]).default("info"),
  title: z.string(),
  /** Explicit style-token name, overriding the variant's colour. Absorbed from
   *  the former `infobox` component so `:::infobox{accent="warning"}` keeps
   *  working when infobox is registered as an alias of this component. */
  accent: z.string().optional(),
});

export const meta = {
  name: "callout",
  description: "Variant-styled callout box with a title.",
  acceptsChildren: true,
  example: ':::callout{variant="warn" title="Heads up"}\nBody\n:::',
  requiredTokens: ["accent", "warning", "danger"],
};

const VARIANT_TOKEN: Record<string, string> = {
  info: "accent",
  tip: "accent",
  warn: "warning",
  danger: "danger",
};

export const render: Component<typeof schema> = (params, children, ctx: RenderCtx) => {
  const tokenName = params.accent ?? VARIANT_TOKEN[params.variant] ?? "accent";
  const color = ctx.token(tokenName);
  return Tex`\begin{callout}{${raw(color)}}{${params.title}}
${raw(children)}
\end{callout}`;
};
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/druckform && npx vitest run tests/unit/callout-component.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 5: Run the full core suite and commit**

```bash
pnpm -w build && pnpm --filter @druckform/core test
git add packages/druckform/templates/report/components/callout.ts \
        packages/druckform/tests/unit/callout-component.test.ts
git commit -m "fix(core): callout danger variant renders distinctly; add tip and accent override

variant=danger previously rendered identically to info because the colour
logic only special-cased warn."
```

---

### Task 7: Move `callout` into `base` and register the friendly aliases

**Files:**
- Move: `packages/druckform/templates/report/components/callout.ts` → `packages/druckform/templates/base/components/callout.ts`
- Delete: `packages/druckform/templates/base/components/infobox.component.yaml`
- Modify: `packages/druckform/templates/base/template.yaml`
- Modify: `packages/druckform/templates/report/template.yaml`
- Modify: `packages/druckform/tests/unit/callout-component.test.ts` (path change)
- Test: `packages/druckform/tests/integration/admonitions.test.ts` (create)

**Interfaces:**
- Consumes: cross-name `extends` and key-based discovery (Task 1); the extended `callout` (Task 6); the `danger` colour (Task 5).
- Produces: `base` registers `callout`, `note`, `tip`, `warning`, `danger`, `infobox`. Every later template inherits all six.

- [ ] **Step 1: Move the component and update the unit test path**

```bash
git mv packages/druckform/templates/report/components/callout.ts \
       packages/druckform/templates/base/components/callout.ts
git rm packages/druckform/templates/base/components/infobox.component.yaml
```

In `packages/druckform/tests/unit/callout-component.test.ts`, change `SRC` to:

```ts
const SRC = path.resolve(import.meta.dirname, "../../templates/base/components/callout.ts");
```

- [ ] **Step 2: Write the failing admonition tests**

Create `packages/druckform/tests/integration/admonitions.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";
import { testCtx } from "../helpers/render-component.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");

async function renderNamed(template: string, name: string, params: Record<string, unknown>) {
  const all = loadAllTemplates(BUNDLED, undefined);
  const resolved = await resolveTemplate(template, all);
  const entry = resolved.components[name];
  if (!entry) throw new Error(`no component '${name}' in '${template}'`);
  return entry.def.render({ ...entry.defaults, ...params }, "body", testCtx());
}

describe("admonition family in base", () => {
  it.each([
    ["note", "\\druckAccent"],
    ["tip", "\\druckAccent"],
    ["warning", "\\druckWarning"],
    ["danger", "\\druckDanger"],
  ])("%s renders with %s", async (name, expected) => {
    expect(await renderNamed("base", name, { title: "T" })).toContain(expected);
  });

  it("all aliases share one implementation", async () => {
    const all = loadAllTemplates(BUNDLED, undefined);
    const resolved = await resolveTemplate("base", all);
    const paths = ["callout", "note", "tip", "warning", "danger", "infobox"].map(
      (n) => resolved.components[n]?.sourcePath,
    );
    expect(new Set(paths).size).toBe(1);
  });

  // Back-compat: zod strips unknown keys rather than erroring, so if callout did
  // not accept `accent` this would render in the WRONG COLOUR with no error.
  it("infobox still honours accent=", async () => {
    expect(await renderNamed("base", "infobox", { title: "T", accent: "warning" })).toContain(
      "\\druckWarning",
    );
  });

  it("report's infobox default of accent=warning survives", async () => {
    expect(await renderNamed("report", "infobox", { title: "T" })).toContain("\\druckWarning");
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd packages/druckform && npx vitest run tests/integration/admonitions.test.ts --coverage=false`
Expected: FAIL — no component `note` in `base`.

- [ ] **Step 4: Register the family in base**

In `packages/druckform/templates/base/template.yaml`, replace the `infobox` entry with the block below. **`callout` must be declared before its aliases** — entries in one file are processed in declaration order, and an alias resolves against components already merged.

```yaml
  callout:
    source: components/callout.ts
  # Friendly names over one implementation. `:::warning` matches the
  # MkDocs/Docusaurus convention, so it is guessable without reading docs.
  note:
    extends: base.callout
    defaults: { variant: info }
  tip:
    extends: base.callout
    defaults: { variant: tip }
  warning:
    extends: base.callout
    defaults: { variant: warn }
  danger:
    extends: base.callout
    defaults: { variant: danger }
  # Back-compat alias for the original component name.
  infobox:
    extends: base.callout
    defaults: { variant: info }
```

- [ ] **Step 5: Drop report's now-redundant callout source**

In `packages/druckform/templates/report/template.yaml`, remove the `callout:` entry (it is inherited from `base` now). Keep the `infobox` override exactly as it is — it still resolves, and `accent: warning` still applies:

```yaml
name: report
description: "Report template — extends base with a warning-accented infobox."
extends: base
components:
  infobox:
    extends: base.infobox
    defaults:
      accent: warning
```

- [ ] **Step 6: Run to verify they pass**

Run: `cd packages/druckform && npx vitest run tests/integration/admonitions.test.ts tests/unit/callout-component.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 7: Verify discovery advertises the friendly names**

```bash
pnpm -w build
node packages/druckform/dist/cli.js components --template base --json \
  | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
             const n=d.components.map(c=>c.name).sort();
             console.log(n.join(' '));
             for (const want of ['callout','note','tip','warning','danger','infobox'])
               if (!n.includes(want)) throw new Error('missing '+want);"
for t in base report examples; do node packages/druckform/dist/cli.js doctor --template "$t" --json; done
```

Expected: all six names listed; `"ok": true` three times.

- [ ] **Step 8: Run the full core suite and commit**

```bash
pnpm --filter @druckform/core test
git add -A packages/druckform/templates packages/druckform/tests
git commit -m "feat(core): admonition family (note/tip/warning/danger) in base

One callout implementation behind friendly names; infobox kept as an
alias that still honours accent=."
```

---

### Task 8: Frontmatter-driven title block, cover and table of contents

**Files:**
- Modify: `packages/druckform/templates/base/template.yaml` (add `frontmatter:`)
- Modify: `packages/druckform/templates/base/components/document.ts`
- Test: `packages/druckform/tests/integration/document-shell-frontmatter.test.ts` (create)

**Interfaces:**
- Consumes: nothing from Tasks 2-7 beyond a working `base`.
- Produces: `base` frontmatter fields `title`, `subtitle`, `author`, `date`, `cover`, `toc`. Task 13 uses them in the e2e fixture.

- [ ] **Step 1: Write the failing shell tests**

Create `packages/druckform/tests/integration/document-shell-frontmatter.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DocumentLayout } from "../../src/sdk/types.js";
import { renderComponent } from "../helpers/render-component.js";

const SHELL = path.resolve(import.meta.dirname, "../../templates/base/components/document.ts");

const layout: DocumentLayout = {
  kind: "document",
  documentclass: "article",
  stylePreamble: "%STYLE",
  componentPreamble: "%COMPONENTS",
  frontmatter: {},
};

const render = (frontmatter: Record<string, string>) =>
  renderComponent(SHELL, {}, { element: { ...layout, frontmatter }, ctx: { frontmatter } });

describe("base document shell", () => {
  it("emits no title block when there is no title", async () => {
    const out = await render({});
    expect(out).not.toContain("\\Huge");
    expect(out).toContain("DRUCKFORM_BODY");
  });

  it("renders a title block when title is present", async () => {
    const out = await render({ title: "Q3 Review" });
    expect(out).toContain("Q3 Review");
    expect(out).toContain("\\Huge");
  });

  it("includes subtitle, author and date when present", async () => {
    const out = await render({
      title: "T",
      subtitle: "Sub",
      author: "Ada",
      date: "2026-08-17",
    });
    for (const s of ["Sub", "Ada", "2026-08-17"]) expect(out).toContain(s);
  });

  it("escapes frontmatter values", async () => {
    expect(await render({ title: "R&D 50%" })).toContain("R\\&D 50\\%");
  });

  // Frontmatter arrives as strings: parser.ts coerces with String(v).
  it("puts the title on its own page when cover is \"true\"", async () => {
    expect(await render({ title: "T", cover: "true" })).toContain("\\clearpage");
  });

  it("does not clearpage when cover is absent", async () => {
    expect(await render({ title: "T" })).not.toContain("\\clearpage");
  });

  it("emits a TOC when toc is \"true\"", async () => {
    expect(await render({ title: "T", toc: "true" })).toContain("\\tableofcontents");
  });

  it("omits the TOC by default — a one-page memo must not sprout one", async () => {
    expect(await render({ title: "T" })).not.toContain("\\tableofcontents");
  });

  it("never emits documentclass or a geometry package load", async () => {
    const out = await render({ title: "T" });
    expect(out).not.toContain("\\documentclass");
    expect(out).not.toMatch(/usepackage\[[^\]]*\]\{geometry\}/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/druckform && npx vitest run tests/integration/document-shell-frontmatter.test.ts --coverage=false`
Expected: FAIL — no title block rendered.

- [ ] **Step 3: Declare the frontmatter fields**

Add to `packages/druckform/templates/base/template.yaml`, between `style:` and `components:`:

```yaml
frontmatter:
  # All optional and all strings — the parser coerces every YAML scalar with
  # String(v), so `toc: true` arrives as "true".
  title:    { type: string, required: false }
  subtitle: { type: string, required: false }
  author:   { type: string, required: false }
  date:     { type: string, required: false }
  cover:    { type: string, required: false, default: "false" }
  toc:      { type: string, required: false, default: "false" }
```

- [ ] **Step 4: Implement the shell**

Replace `packages/druckform/templates/base/components/document.ts`:

```ts
import { type BlockElement, type DocumentLayout, type RenderCtx, escapeTeX } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "document", description: "Document shell", acceptsChildren: true };

// The shell owns everything AFTER the engine-core packages: it places the style
// and component preambles, opens/closes the document, and marks where the body
// goes. It does NOT emit \documentclass or the engine packages (fontspec,
// xcolor, graphicx, geometry, hyperref, ulem) — the composer injects those and
// they are not overrideable. Page size/margins come from tokens.page via the
// style preamble; a shell that wants different geometry calls \geometry{...},
// never \usepackage[...]{geometry} (that clashes — doctor flags it).

/** Title block, rendered only when a `title` is supplied. */
function titleBlock(fm: Record<string, string>): string[] {
  if (!fm.title) return [];
  const cover = fm.cover === "true";
  const out: string[] = [];
  if (cover) out.push("\\thispagestyle{empty}", "\\vspace*{\\fill}");
  out.push("\\begin{center}", `{\\Huge\\bfseries ${escapeTeX(fm.title)}\\par}`);
  if (fm.subtitle) out.push("\\vspace{0.5em}", `{\\Large ${escapeTeX(fm.subtitle)}\\par}`);
  if (fm.author) out.push("\\vspace{1.2em}", `{\\large ${escapeTeX(fm.author)}\\par}`);
  if (fm.date) out.push("\\vspace{0.3em}", `{\\large ${escapeTeX(fm.date)}\\par}`);
  out.push("\\end{center}");
  out.push(cover ? "\\vspace*{\\fill}" : "\\vspace{2em}");
  if (cover) out.push("\\clearpage");
  return out;
}

export function render(
  _params: unknown,
  _children: string,
  ctx: RenderCtx,
  element?: BlockElement | DocumentLayout,
): string {
  if (!element || element.kind !== "document") return "DRUCKFORM_BODY";
  const fm = ctx.frontmatter ?? {};
  const toc = fm.toc === "true" ? ["\\tableofcontents", "\\clearpage"] : [];
  return [
    element.stylePreamble,
    element.componentPreamble,
    "\\begin{document}",
    ...titleBlock(fm),
    ...toc,
    "DRUCKFORM_BODY",
    "\\end{document}",
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd packages/druckform && npx vitest run tests/integration/document-shell-frontmatter.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 6: Verify a real TOC resolves page numbers**

Tectonic auto-reruns, so `\tableofcontents` resolves in one invocation — confirmed during design, but re-verify after the shell change:

```bash
pnpm -w build
mkdir -p /tmp/df-toc && cat > /tmp/df-toc/d.md <<'EOF'
---
template: base
title: TOC Check
toc: true
cover: true
---

# First Chapter

Body.

# Second Chapter

Body.
EOF
printf '$schema: "style-v1"\ntokens: {}\n' > /tmp/df-toc/s.yaml
node packages/druckform/dist/cli.js render --engine docker --template base \
  --in /tmp/df-toc/d.md --style /tmp/df-toc/s.yaml --out /tmp/df-toc/o.pdf --json
pdftotext /tmp/df-toc/o.pdf - | head -20
```

Expected: a cover page with "TOC Check", then a "Contents" listing both chapters with page numbers.

- [ ] **Step 7: Run the full core suite and commit**

```bash
pnpm --filter @druckform/core test
git add packages/druckform/templates/base \
        packages/druckform/tests/integration/document-shell-frontmatter.test.ts
git commit -m "feat(core): opt-in cover page, title block and TOC in the base shell"
```

---

### Task 9: `figure` and `ref` components

**Files:**
- Create: `packages/druckform/templates/base/components/figure.ts`
- Create: `packages/druckform/templates/base/components/ref.component.yaml`
- Modify: `packages/druckform/templates/base/template.yaml`
- Test: `packages/druckform/tests/unit/figure-component.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `figure` (container, params `caption: string`, `id?: string`) and `ref` (inline, `[content]` is the target id).

- [ ] **Step 1: Write the failing tests**

Create `packages/druckform/tests/unit/figure-component.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const FIGURE = path.resolve(import.meta.dirname, "../../templates/base/components/figure.ts");
const REF = path.resolve(import.meta.dirname, "../../templates/base/components/ref.component.yaml");

describe("figure", () => {
  it("wraps children in a figure environment with a caption", async () => {
    const out = await renderComponent(FIGURE, { caption: "System overview" }, {
      children: "\\includegraphics{x.pdf}",
    });
    expect(out).toContain("\\begin{figure}");
    expect(out).toContain("\\caption{System overview}");
    expect(out).toContain("\\includegraphics{x.pdf}");
    expect(out).toContain("\\end{figure}");
  });

  it("emits a label only when an id is given", async () => {
    const withId = await renderComponent(FIGURE, { caption: "C", id: "arch" });
    expect(withId).toContain("\\label{fig:arch}");
    const without = await renderComponent(FIGURE, { caption: "C" });
    expect(without).not.toContain("\\label");
  });

  it("escapes the caption", async () => {
    const out = await renderComponent(FIGURE, { caption: "100% & more" });
    expect(out).toContain("100\\% \\& more");
  });
});

describe("ref", () => {
  it("references a figure label", async () => {
    const out = await renderComponent(REF, {}, { children: "arch" });
    expect(out).toContain("\\ref{fig:arch}");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/druckform && npx vitest run tests/unit/figure-component.test.ts --coverage=false`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Create the figure component**

Create `packages/druckform/templates/base/components/figure.ts`:

```ts
import { type Component, type RenderCtx, escapeTeX, raw } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({
  caption: z.string(),
  /** Optional anchor; referenced as :ref[<id>]. Namespaced to fig: in the label. */
  id: z.string().optional(),
});

export const meta = {
  name: "figure",
  description: "Captioned, numbered figure wrapping any block content.",
  acceptsChildren: true,
  example:
    ':::figure{caption="System overview" id="arch"}\n![](diagram.png)\n:::',
};

// No preamble: `figure` and `\caption` are LaTeX built-ins and graphicx is
// already in the engine core.
export const render: Component<typeof schema> = (params, children, _ctx: RenderCtx) => {
  const label = params.id ? `\n\\label{fig:${params.id}}` : "";
  return [
    "\\begin{figure}[htbp]",
    "\\centering",
    children,
    `\\caption{${escapeTeX(params.caption)}}${label}`,
    "\\end{figure}",
  ].join("\n");
};
```

Create `packages/druckform/templates/base/components/ref.component.yaml`:

```yaml
name: ref
description: "Inline cross-reference to a figure id, e.g. :ref[arch]."
form: inline
params: {}
slots:
  children: true
emits: "\\ref{fig:{{children}}}"
example: |
  See :ref[arch] for the layout.
```

- [ ] **Step 4: Register both in base**

Add to the `components:` map in `packages/druckform/templates/base/template.yaml`:

```yaml
  figure:
    source: components/figure.ts
  ref:
    source: components/ref.component.yaml
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd packages/druckform && npx vitest run tests/unit/figure-component.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 6: Verify doctor stays clean and commit**

```bash
pnpm -w build && pnpm --filter @druckform/core test
node packages/druckform/dist/cli.js doctor --template base --json
git add packages/druckform/templates/base packages/druckform/tests/unit/figure-component.test.ts
git commit -m "feat(core): figure and ref components"
```

---

### Task 10: `pagebreak`, `pullquote` and `deflist`

**Files:**
- Create: `packages/druckform/templates/base/components/pagebreak.component.yaml`
- Create: `packages/druckform/templates/base/components/pullquote.component.yaml`
- Create: `packages/druckform/templates/base/components/deflist.ts`
- Modify: `packages/druckform/templates/base/template.yaml`
- Test: `packages/druckform/tests/unit/prose-blocks.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `pagebreak` (leaf, no params), `pullquote` (container, `attribution?`), `deflist` (leaf, `pairs: string`).

- [ ] **Step 1: Write the failing tests**

Create `packages/druckform/tests/unit/prose-blocks.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const dir = path.resolve(import.meta.dirname, "../../templates/base/components");
const at = (f: string) => path.join(dir, f);

describe("pagebreak", () => {
  it("emits a clearpage", async () => {
    expect(await renderComponent(at("pagebreak.component.yaml"))).toContain("\\clearpage");
  });
});

describe("pullquote", () => {
  it("wraps children in a quote environment", async () => {
    const out = await renderComponent(at("pullquote.component.yaml"), {}, {
      children: "Ship it.",
    });
    expect(out).toContain("\\begin{druckpullquote}");
    expect(out).toContain("Ship it.");
  });

  it("renders an attribution when given", async () => {
    const out = await renderComponent(
      at("pullquote.component.yaml"),
      { attribution: "Ada L." },
      { children: "Ship it." },
    );
    expect(out).toContain("Ada L.");
  });
});

describe("deflist", () => {
  it("renders each pair as a description item", async () => {
    const out = await renderComponent(at("deflist.ts"), {
      pairs: "Token=A named style value; Template=A named set of components",
    });
    expect(out).toContain("\\begin{description}");
    expect(out).toContain("\\item[Token] A named style value.");
    expect(out).toContain("\\item[Template] A named set of components");
    expect(out).toContain("\\end{description}");
  });

  // A description environment whose body is not a sequence of \item commands is
  // a LaTeX error ("Something's wrong--perhaps a missing \\item"), which is why
  // this takes structured pairs rather than free Markdown children.
  it("emits no empty items for a trailing separator", async () => {
    const out = await renderComponent(at("deflist.ts"), { pairs: "A=1;" });
    expect(out.match(/\\item\[/g) ?? []).toHaveLength(1);
  });

  it("escapes terms and definitions", async () => {
    const out = await renderComponent(at("deflist.ts"), { pairs: "R&D=50% faster" });
    expect(out).toContain("R\\&D");
    expect(out).toContain("50\\% faster");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/druckform && npx vitest run tests/unit/prose-blocks.test.ts --coverage=false`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Create the three components**

`packages/druckform/templates/base/components/pagebreak.component.yaml`:

```yaml
name: pagebreak
description: "Force a page break. Replaces the commonest use of the raw escape hatch."
form: leaf
params: {}
slots:
  children: false
emits: |
  \clearpage
example: |
  ::pagebreak
```

`packages/druckform/templates/base/components/pullquote.component.yaml`:

```yaml
name: pullquote
description: "Emphasised quotation, optionally attributed."
form: container
params:
  attribution: { type: string, required: false, default: "" }
  accent: { type: token, required: false, default: accent }
slots:
  children: true
# `quote` is a LaTeX built-in; this only adds an accent rule and larger text, so
# no extra package is needed.
preamble: |
  \newenvironment{druckpullquote}[1]{%
    \par\vspace{0.8em}%
    \noindent{#1\rule{2pt}{1.1em}}\hspace{0.6em}%
    \begin{minipage}{0.92\linewidth}\itshape\large\ignorespaces
  }{%
    \end{minipage}\par\vspace{0.8em}%
  }
emits: |
  \begin{druckpullquote}{{{accent}}}
  {{children}}

  \hfill\normalsize\upshape{{attribution}}
  \end{druckpullquote}
example: |
  :::pullquote{attribution="Ada Lovelace"}
  The Analytical Engine weaves algebraic patterns.
  :::
```

`packages/druckform/templates/base/components/deflist.ts`. This is TypeScript, not
YAML, and takes structured pairs rather than Markdown children on purpose: a
`description` environment whose body is anything other than `\item[...]` commands
fails to compile with *"Something's wrong--perhaps a missing \item"*, and Markdown
children would arrive as an `itemize` block.

```ts
import { type Component, type RenderCtx, escapeTeX } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({
  /** Semicolon-separated `term=definition` pairs. */
  pairs: z.string(),
});

export const meta = {
  name: "deflist",
  description: "Definition list of term/definition pairs.",
  acceptsChildren: false,
  form: "leaf" as const,
  example: '::deflist{pairs="Token=A named style value; Template=A named set of components"}',
};

// `description` is a LaTeX built-in; no package needed.
export const render: Component<typeof schema> = (params, _children, _ctx: RenderCtx) => {
  const items = params.pairs
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const eq = pair.indexOf("=");
      const term = eq >= 0 ? pair.slice(0, eq) : pair;
      const definition = eq >= 0 ? pair.slice(eq + 1) : "";
      return `\\item[${escapeTeX(term.trim())}] ${escapeTeX(definition.trim())}`;
    });
  return ["\\begin{description}", ...items, "\\end{description}"].join("\n");
};
```

- [ ] **Step 4: Register all three in base**

Add to `components:` in `packages/druckform/templates/base/template.yaml`:

```yaml
  pagebreak:
    source: components/pagebreak.component.yaml
  pullquote:
    source: components/pullquote.component.yaml
  deflist:
    source: components/deflist.ts
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd packages/druckform && npx vitest run tests/unit/prose-blocks.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 6: Run the suite, check doctor, commit**

```bash
pnpm -w build && pnpm --filter @druckform/core test
node packages/druckform/dist/cli.js doctor --template base --json
git add packages/druckform/templates/base packages/druckform/tests/unit/prose-blocks.test.ts
git commit -m "feat(core): pagebreak, pullquote and deflist components"
```

---

### Task 11: `metadata`, `badge` and `footnote`

**Files:**
- Create: `packages/druckform/templates/base/components/metadata.ts`
- Create: `packages/druckform/templates/base/components/badge.component.yaml`
- Create: `packages/druckform/templates/base/components/footnote.component.yaml`
- Modify: `packages/druckform/templates/base/template.yaml`
- Test: `packages/druckform/tests/unit/metadata-badge-footnote.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `metadata` (container, params `pairs: string` — semicolon-separated `key=value`), `badge` (inline), `footnote` (inline).

- [ ] **Step 1: Write the failing tests**

Create `packages/druckform/tests/unit/metadata-badge-footnote.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const dir = path.resolve(import.meta.dirname, "../../templates/base/components");
const at = (f: string) => path.join(dir, f);

describe("metadata", () => {
  it("renders key/value pairs as a two-column table", async () => {
    const out = await renderComponent(at("metadata.ts"), {
      pairs: "Client=Acme GmbH; Date=2026-08-17",
    });
    expect(out).toContain("\\begin{tabular}");
    expect(out).toContain("Client");
    expect(out).toContain("Acme GmbH");
    expect(out).toContain("2026-08-17");
  });

  it("escapes both keys and values", async () => {
    const out = await renderComponent(at("metadata.ts"), { pairs: "R&D=50%" });
    expect(out).toContain("R\\&D");
    expect(out).toContain("50\\%");
  });

  it("ignores empty segments from a trailing separator", async () => {
    const out = await renderComponent(at("metadata.ts"), { pairs: "A=1;" });
    expect(out.match(/\\\\/g) ?? []).toHaveLength(1);
  });
});

describe("badge", () => {
  it("renders an inline coloured label", async () => {
    const out = await renderComponent(at("badge.component.yaml"), {}, { children: "DRAFT" });
    expect(out).toContain("DRAFT");
    expect(out).not.toContain("\\par");
  });
});

describe("footnote", () => {
  it("emits a LaTeX footnote", async () => {
    const out = await renderComponent(at("footnote.component.yaml"), {}, {
      children: "Measured on 2026-08-17.",
    });
    expect(out).toContain("\\footnote{Measured on 2026-08-17.}");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/druckform && npx vitest run tests/unit/metadata-badge-footnote.test.ts --coverage=false`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Create the three components**

`packages/druckform/templates/base/components/metadata.ts`:

```ts
import { type Component, type RenderCtx, escapeTeX } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({
  /** Semicolon-separated `key=value` pairs, e.g. "Client=Acme; Date=2026-08-17". */
  pairs: z.string(),
});

export const meta = {
  name: "metadata",
  description: "Two-column key/value block for document metadata.",
  acceptsChildren: false,
  example: '::metadata{pairs="Client=Acme GmbH; Date=2026-08-17; Status=Draft"}',
  form: "leaf" as const,
};

// booktabs is already pulled in by block:table; no new package.
export const preamble = "\\usepackage{booktabs}";

export const render: Component<typeof schema> = (params, _children, _ctx: RenderCtx) => {
  const rows = params.pairs
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const eq = pair.indexOf("=");
      const key = eq >= 0 ? pair.slice(0, eq) : pair;
      const value = eq >= 0 ? pair.slice(eq + 1) : "";
      return `\\textbf{${escapeTeX(key.trim())}} & ${escapeTeX(value.trim())} \\\\`;
    });
  return [
    "\\par\\vspace{0.5em}",
    "\\begin{tabular}{@{}ll@{}}",
    "\\toprule",
    ...rows,
    "\\bottomrule",
    "\\end{tabular}",
    "\\par\\vspace{0.5em}",
  ].join("\n");
};
```

`packages/druckform/templates/base/components/badge.component.yaml`:

```yaml
name: badge
description: "Inline coloured label, e.g. a status marker."
form: inline
params:
  accent: { type: token, required: false, default: accent }
slots:
  children: true
# `{}` terminates the colour macro's name so it does not run into the text.
emits: "\\textbf{[{{accent}}{}\\,{{children}}\\,]}"
example: |
  Status: :badge[DRAFT]
```

`packages/druckform/templates/base/components/footnote.component.yaml`:

```yaml
name: footnote
description: "Inline footnote; the bracketed content becomes the note text."
form: inline
params: {}
slots:
  children: true
emits: "\\footnote{{{children}}}"
example: |
  The figure is provisional:footnote[Measured on 2026-08-17.].
```

- [ ] **Step 4: Register all three in base**

Add to `components:` in `packages/druckform/templates/base/template.yaml`:

```yaml
  metadata:
    source: components/metadata.ts
  badge:
    source: components/badge.component.yaml
  footnote:
    source: components/footnote.component.yaml
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd packages/druckform && npx vitest run tests/unit/metadata-badge-footnote.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 6: Run the suite, check doctor, commit**

```bash
pnpm -w build && pnpm --filter @druckform/core test
node packages/druckform/dist/cli.js doctor --template base --json
git add packages/druckform/templates/base \
        packages/druckform/tests/unit/metadata-badge-footnote.test.ts
git commit -m "feat(core): metadata, badge and footnote components"
```

---

### Task 12: Fix the Tectonic prewarm so the image renders offline

Verified broken: `docker run --network none … render` fails with `LaTeX compilation failed`, because the prewarm document loads only four of the packages the bundled components need.

**Files:**
- Modify: `docker/tectonic-prewarm.tex`

**Interfaces:**
- Consumes: the final package list, now settled by Tasks 3 and 9-11.
- Produces: an image whose Tectonic cache is complete. Task 13 asserts it.

- [ ] **Step 1: Extend the prewarm document**

Replace `docker/tectonic-prewarm.tex`. Every package here must be one the bundled components actually load — the point is that the image's Tectonic cache covers a real render, so a document never needs the network.

```latex
% Pre-warms Tectonic's package cache at image build time. It must load every
% package a bundled render can pull in, or the first real render reaches out to
% the network — and fails outright in an offline/sandboxed environment.
% Keep in sync with ENGINE_CORE in src/latex/composer.ts and with the
% `preamble` exports of the bundled components.
\documentclass{article}
% Engine core (composer.ts ENGINE_CORE)
\usepackage{fontspec}
\usepackage{xcolor}
\usepackage{graphicx}
\usepackage{geometry}
\usepackage{hyperref}
\usepackage[normalem]{ulem}
% Component preambles
\usepackage{tabularx}   % block:table
\usepackage{booktabs}   % block:table, metadata
\usepackage{array}      % block:table
\usepackage[export]{adjustbox}  % block:image
\begin{document}
Druckform pre-warm.
% Exercise the float and sectioning machinery so their .aux/.toc handling is cached.
\section{Warm}
\begin{figure}[htbp]\centering\rule{1cm}{1cm}\caption{Warm}\label{fig:warm}\end{figure}
See \ref{fig:warm} and a footnote.\footnote{Warm.}
\begin{description}\item[Term] Definition.\end{description}
\end{document}
```

- [ ] **Step 2: Rebuild the image**

Run: `docker build -t druckform:e2e .`
Expected: builds cleanly; the prewarm `RUN tectonic …` layer downloads the added packages.

- [ ] **Step 3: Verify an offline render succeeds**

```bash
mkdir -p /tmp/df-offline
cp tests/e2e/fixtures/document.md tests/e2e/fixtures/style.yaml /tmp/df-offline/
cp -r tests/e2e/fixtures/assets /tmp/df-offline/
docker run --rm --network none -v /tmp/df-offline:/w druckform:e2e \
  render --template report --in /w/document.md --style /w/style.yaml \
  --assets /w/assets --out /w/out.pdf --json
```

Expected: `"status": "ok"`. Before this task the same command failed with `LaTeX compilation failed`.

- [ ] **Step 4: Commit**

```bash
git add docker/tectonic-prewarm.tex
git commit -m "fix(docker): prewarm every package bundled components use

The image could not render offline: the prewarm doc cached four packages
while components needed ten, so every render hit the network."
```

---

### Task 13: Extend the e2e suite — A4 assertion, new components, offline guard

**Files:**
- Modify: `tests/e2e/fixtures/document.md`
- Modify: `tests/e2e/in-container.sh`

**Interfaces:**
- Consumes: everything from Tasks 3-12.
- Produces: permanent regression cover for paper size, the prose library, and offline rendering.

- [ ] **Step 1: Exercise the new components in the fixture**

Add to `tests/e2e/fixtures/document.md`, before the `## Diagrams` heading, and add `title: E2E Bundled Template Report` / `toc: true` to its frontmatter:

```markdown
## Prose Library

:::note{title="A note"}
Note body.
:::

:::warning{title="A warning"}
Warning body.
:::

:::danger{title="A danger"}
Danger body.
:::

:::tip{title="A tip"}
Tip body.
:::

::metadata{pairs="Client=Acme GmbH; Date=2026-08-17; Status=Draft"}

:::pullquote{attribution="Ada Lovelace"}
The Analytical Engine weaves algebraic patterns.
:::

::deflist{pairs="Token=A named style value; Template=A named set of components"}

Status: :badge[DRAFT] with a footnote:footnote[Measured 2026-08-17.].

:::figure{caption="A framed box" id="boxfig"}
\rule{2cm}{1cm}
:::

See :ref[boxfig] for the box.

::pagebreak
```

- [ ] **Step 2: Assert page size in the e2e harness**

In `tests/e2e/in-container.sh`, inside `assert_pdf`, after the page-count assertion, add:

```bash
  # Paper size is a silent failure mode: the bundled templates emitted US Letter
  # for a long time because nothing set geometry and article defaults to
  # letterpaper. Nobody notices until it reaches a printer.
  local papersize
  papersize="$(pdfinfo "$pdf" | awk -F'[()]' '/^Page size:/ {print $2}')"
  [ "$papersize" = "A4" ] || fail "$(basename "$pdf"): page size is '$papersize', expected A4"
  echo "  ok  $(basename "$pdf"): A4"
```

- [ ] **Step 3: Assert the new components reached the PDF**

In `tests/e2e/in-container.sh`, extend the `assert_pdf` call for `report.pdf` with these required strings (insert before the `--` separator):

```bash
  "A note" "A warning" "A danger" "A tip" \
  "Acme GmbH" "Analytical Engine" "DRAFT" "A framed box" \
```

- [ ] **Step 4: Add the offline render check**

In `tests/e2e/in-container.sh`, after the bundled-template render section, add:

```bash
banner "The image renders with no network access"
# The prewarm doc must cache every package a bundled render pulls, or documents
# fail outright in an offline or sandboxed environment.
docker run --rm --network none \
  -v "$WORK:$WORK" -w "$WORK" "$IMAGE" \
  render --template report --in document.md --style style.yaml \
  --assets assets --out "$WORK/out/offline.pdf" --json \
  > "$OUT/render-offline.json" 2>&1 \
  || { cat "$OUT/render-offline.json" >&2; fail "offline render failed — prewarm cache incomplete"; }
assert_json "offline render contract" "$OUT/render-offline.json" \
  "d.status === 'ok'"
```

- [ ] **Step 5: Run the full e2e suite**

Run: `./tests/e2e/run-e2e.sh`
Expected: `=== E2E passed ===`, including the new A4, prose-library and offline assertions.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/fixtures/document.md tests/e2e/in-container.sh
git commit -m "test(e2e): assert A4 page size, prose library and offline rendering"
```

---

### Task 14: Documentation, examples and changesets

**Files:**
- Modify: `docs/authoring.md`
- Modify: `docs/extending-druckform.md`
- Modify: `docs/examples-gallery.md`
- Modify: `packages/druckform/templates/examples/template.yaml` and `components/document.ts`
- Modify: `packages/druckform/styles/example/style.yaml`
- Modify: `claude-plugin/skills/druckform/SKILL.md`
- Modify: `claude-plugin/.claude-plugin/plugin.json` (version bump)
- Create: `.changeset/page-foundation.md`, `.changeset/prose-library.md`

**Interfaces:**
- Consumes: everything.
- Produces: no code.

- [ ] **Step 1: Rebase the examples template on the new shell**

`packages/druckform/templates/examples/components/document.ts` overrides the shell , so `examples` would render *worse* than `base` — no title block, no TOC. Delete that file and remove the `document:` entry from `packages/druckform/templates/examples/template.yaml`, so `examples` inherits base's shell.

Also delete `packages/druckform/templates/examples/components/callout.ts` and its `callout:` entry: it now duplicates base's implementation, and `examples` exists to demonstrate what `base` does not already do. Keep the `block:table` override — that one still shows a real technique.

- [ ] **Step 2: Add page tokens to the example style**

In `packages/druckform/styles/example/style.yaml`, add under `tokens:`:

```yaml
  page:
    size: a4
    margin: "2.5cm"
```

- [ ] **Step 3: Document page tokens and the new components**

In `docs/authoring.md`, add a `page` block to the style-file example and its token rules, and add the ten new components to the "Built-in components" section with the syntax and parameter table for each (follow the existing `infobox` entry's format).

In `docs/extending-druckform.md`:
- §4.1: add `page` to the style anatomy.
- §4.2 ("What each token compiles to"): add the `page` → `\geometry{…}` row.
- §6.3: state that `extends: <template>.<component>` may name a *different* component, which is how aliases are declared, and that the target must be declared earlier in the same file.
- §10 (Common errors): add the geometry option clash and its `\geometry{…}` fix.

- [ ] **Step 4: Extend the examples gallery**

Add a section to `docs/examples-gallery.md` for each new component, using its `meta.example` verbatim so the gallery cannot drift from what `preview-component` renders.

- [ ] **Step 5: Update the skill**

In `claude-plugin/skills/druckform/SKILL.md`, document the admonition family (`:::note`, `:::tip`, `:::warning`, `:::danger`), the frontmatter fields (`title`, `subtitle`, `author`, `date`, `cover`, `toc`), and page tokens. Bump `version` in `claude-plugin/.claude-plugin/plugin.json` to `0.1.3`.

- [ ] **Step 6: Write the changesets**

Create `.changeset/page-foundation.md`:

```markdown
---
"@druckform/core": minor
---

**Breaking (visual): documents now render A4 by default.** Bundled templates previously produced US Letter — nothing emitted `geometry`, so `\documentclass{article}`'s `letterpaper` default leaked through. Paper size and margins are now style tokens:

```yaml
tokens:
  page:
    size: a4        # a4 | letter — default a4
    margin: "2.5cm"
```

To keep the old output, set `size: letter`.

`geometry` is now loaded (bare) by the engine core, and page setup is applied with `\geometry{…}`. A custom document shell that calls `\usepackage[…]{geometry}` will now hit LaTeX's "Option clash"; switch it to `\geometry{…}`. `druck doctor` reports this with the fix.

Also adds an opt-in cover page, title block and table of contents, driven by the frontmatter fields `title`, `subtitle`, `author`, `date`, `cover` and `toc`.
```

Create `.changeset/prose-library.md`:

```markdown
---
"@druckform/core": minor
---

Adds a shared prose component library to `base`, so every template inherits it: `callout` with the friendly aliases `note`/`tip`/`warning`/`danger` (and `infobox`, kept for compatibility), plus `figure`, `ref`, `pagebreak`, `pullquote`, `deflist`, `metadata`, `badge` and `footnote`. No new LaTeX packages are required.

Fixes along the way:

- `variant="danger"` rendered identically to `info`; each variant now maps to its own colour token.
- `base` now declares `warning` and `danger` colours, so `report` no longer fails with `Missing required style token 'warning'` against a style that defines only `accent`.
- `extends: <template>.<component>` now resolves the named component instead of ignoring the value and using the entry's key, so a component can be aliased under another name — and a typo'd target is an error rather than being silently ignored.
- `druck components` reports the registration key rather than the implementation's `meta.name`, so aliases are discoverable.
```

- [ ] **Step 7: Full verification**

```bash
pnpm -w build
pnpm turbo test
pnpm lint
for t in base report examples; do node packages/druckform/dist/cli.js doctor --template "$t" --json; done
./tests/e2e/run-e2e.sh
```

Expected: build clean, all tests pass, biome clean, three `"ok": true`, `=== E2E passed ===`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs: page tokens, prose library, admonitions; changesets"
```

---

## Notes for the executor

- **Task order matters in three places.** Task 1 unblocks the aliases in Task 7. Task 5 must precede Task 6, or adding the `danger` required token breaks every style file that lacks it. Task 12 should follow Tasks 9-11 so the package list is final.
- **`base/template.yaml` is edited by six tasks** (5, 7, 8, 9, 10, 11). Expect to re-read it each time rather than working from memory, and keep `callout` declared before its aliases.
- **If coverage thresholds fail** (80% lines), check whether the new file belongs in the `templates/**` exclude already configured in `vitest.config.ts` — bundled template components are loaded through an esbuild temp file, so v8 cannot attribute coverage to them.
