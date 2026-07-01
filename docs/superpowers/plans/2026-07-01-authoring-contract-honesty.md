# Authoring Contract Honesty (B-group) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four code gaps where druckform's documented authoring contract is false (re-export `z`; make `zod`/`druckform` resolvable in external-template TS components; let style fonts carry fontspec options; let declarative components declare `requiredTokens`), then rewrite the skill + docs to match the real, final surface (including Part A's `ctx.asset`/`ctx.templateDir`).

**Architecture:** Small, independent edits to the SDK barrel, the esbuild component loader, the style compiler, and the declarative loader — each with a focused test — followed by one documentation pass over the authoring skill and `docs/`.

**Tech Stack:** TypeScript (ESM, NodeNext), Node 22, vitest, esbuild component loader, biome.

## Global Constraints

- TypeScript ESM with `.js` import specifiers (NodeNext). Match existing import style in each file.
- Backward compatibility: the string form of `fonts.main`/`fonts.mono` must keep working; `import { z } from "zod"` must keep working alongside the new `import { z } from "druckform"`.
- Only `zod` and `druckform` are blessed for external-template resolution — do not make arbitrary third-party deps resolvable.
- YAGNI: do NOT add `\setsansfont`/`fonts.sans` (document its absence only); do NOT auto-scan `preamble`/`emits` for token names (use opt-in `requiredTokens`).
- Run tests with `pnpm --filter druckform test` (full) or `pnpm --filter druckform exec vitest run <path>` (focused). Tests must not require `rsvg-convert`.
- Before committing each code task, run `pnpm biome check .` and fix (or `pnpm biome check --write .`) — the branch must stay lint-clean (a prior effort skipped this and left violations).
- Docs live in `claude-plugin/skills/druckform-authoring/SKILL.md` and `docs/extending-druckform.md` (and `docs/authoring.md` where overlapping).

---

### Task 1: B1 — re-export `z` from `druckform`

**Files:**
- Modify: `packages/druckform/src/index.ts`
- Test: `packages/druckform/tests/unit/exports.test.ts` (create)

**Interfaces:**
- Produces: a runtime `z` export from the `druckform` barrel (the zod namespace object).

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/exports.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as druckform from "../../src/index.js";

describe("druckform barrel exports", () => {
  it("re-exports z from zod as a runtime value", () => {
    expect(typeof druckform.z).toBe("object");
    expect(typeof druckform.z.object).toBe("function");
    expect(typeof druckform.z.string).toBe("function");
  });

  it("still exports the existing SDK helpers", () => {
    expect(typeof druckform.escapeTeX).toBe("function");
    expect(typeof druckform.raw).toBe("function");
    expect(typeof druckform.tokenRef).toBe("function");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/exports.test.ts`
Expected: FAIL — `druckform.z` is `undefined` (`expected undefined to be object`).

- [ ] **Step 3: Add the re-export**

In `packages/druckform/src/index.ts`, add this line after the existing `export { tokenRef } ...` line (line 3):

```ts
export { z } from "zod";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter druckform exec vitest run tests/unit/exports.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
pnpm biome check packages/druckform/src/index.ts packages/druckform/tests/unit/exports.test.ts
git add packages/druckform/src/index.ts packages/druckform/tests/unit/exports.test.ts
git commit -m "feat(druckform): re-export z from druckform barrel (B1)"
```

---

### Task 2: B2 — make `zod`/`druckform` resolvable in external-template TS components

**Files:**
- Modify: `packages/druckform/src/component/typescript.ts`
- Test: `packages/druckform/tests/integration/external-template-loader.test.ts` (create)

**Interfaces:**
- Consumes: `loadTypeScriptComponent(tsPath: string): Promise<ComponentDef>` (unchanged signature) and, indirectly, `loadComponent` from `component/loader.js`.
- Produces: no signature change — the emitted temp module now inlines `zod` and `druckform` so it loads from any directory.

**Background:** Today esbuild runs with `packages: "external"`, so bare `zod`/`druckform` imports stay external in the temp `.mjs`. When the template lives outside the package, Node cannot resolve them upward. Fix: alias `zod` and `druckform` to absolute paths resolved against *this* package, and externalize every *other* bare import via a plugin (so only the two blessed deps get bundled/inlined).

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/integration/external-template-loader.test.ts`. It writes a TS component into a temp dir OUTSIDE the repo (so upward Node resolution cannot reach the repo's `node_modules`) and loads it:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadComponent } from "../../src/component/loader.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-ext-tpl-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("external-template TS component loading", () => {
  it("resolves zod and druckform from an external dir with no local node_modules", async () => {
    const src = [
      'import { z, escapeTeX } from "druckform";',
      'export const schema = z.object({ label: z.string() });',
      'export const meta = { name: "ext", description: "external", acceptsChildren: false };',
      "export function render(params) {",
      "  return `\\\\textbf{${escapeTeX(params.label)}}`;",
      "}",
    ].join("\n");
    const tsPath = path.join(dir, "ext.ts");
    fs.writeFileSync(tsPath, src, "utf8");

    // No node_modules exists in `dir` or above it (it's under the OS temp root).
    const def = await loadComponent(tsPath, "");
    const out = def.render({ label: "A&B" }, "", { token: (n) => n } as never, undefined);
    expect(out).toBe("\\textbf{A\\&B}");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/integration/external-template-loader.test.ts`
Expected: FAIL — importing the temp module throws `Cannot find package 'zod'` (or `'druckform'`) resolved from the temp dir.

- [ ] **Step 3: Add resolution constants + esbuild alias/externalize to the loader**

In `packages/druckform/src/component/typescript.ts`, add these imports at the top (alongside the existing `import path from "node:path";` and `import esbuild from "esbuild";`):

```ts
import fsSync from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
```

Add these module-level constants after the imports (before `let tmpCounter = 0;`):

```ts
// Absolute entry paths for the two deps every component may import. They are
// resolved against THIS package so a component in an external
// DRUCKFORM_TEMPLATES_DIR (which cannot resolve upward to our node_modules)
// still bundles them. Everything else stays external (see the plugin below).
const require_ = createRequire(import.meta.url);
const ZOD_ENTRY = require_.resolve("zod");
const _loaderDir = path.dirname(fileURLToPath(import.meta.url));
// src layout: <pkg>/src/component → ../index.ts ; bundled dist: <pkg>/dist → ./index.js
const DRUCKFORM_ENTRY =
  [
    path.resolve(_loaderDir, "../index.ts"),
    path.resolve(_loaderDir, "../index.js"),
    path.resolve(_loaderDir, "index.js"),
  ].find((p) => fsSync.existsSync(p)) ?? path.resolve(_loaderDir, "../index.js");
```

Then change the `esbuild.build({...})` call: **remove** the `packages: "external",` line and add an `alias` plus a plugin that externalizes all *other* bare imports. The full call becomes:

```ts
  const result = await esbuild.build({
    entryPoints: [tsPath],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    target: "node22",
    // Inline zod + druckform (resolved from THIS package); leave all other
    // bare imports external so we don't bundle unrelated node_modules.
    alias: { zod: ZOD_ENTRY, druckform: DRUCKFORM_ENTRY },
    plugins: [
      {
        name: "externalize-non-blessed",
        setup(build) {
          build.onResolve({ filter: /^[^./]/ }, (args) => {
            if (args.kind === "entry-point") return undefined;
            if (
              args.path === "zod" ||
              args.path.startsWith("zod/") ||
              args.path === "druckform" ||
              args.path.startsWith("druckform/")
            ) {
              return undefined; // let alias + normal resolution bundle these
            }
            return { path: args.path, external: true };
          });
        },
      },
    ],
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter druckform exec vitest run tests/integration/external-template-loader.test.ts`
Expected: PASS — the component loads from the external temp dir and renders `\textbf{A\&B}`.

- [ ] **Step 5: Run the full suite (guard against loader regressions)**

Run: `pnpm --filter druckform test`
Expected: PASS — all existing component/template tests still pass (in-repo templates now inline the two deps instead of externalizing them; behavior is unchanged).

If the external test still fails with an unresolved `druckform`, the `DRUCKFORM_ENTRY` fallback picked the wrong path — log the three candidates and confirm which exists in the current run (src vs dist), and ensure the existing candidate is a real barrel exporting `escapeTeX`/`z`.

- [ ] **Step 6: Commit**

```bash
pnpm biome check packages/druckform/src/component/typescript.ts packages/druckform/tests/integration/external-template-loader.test.ts
git add packages/druckform/src/component/typescript.ts packages/druckform/tests/integration/external-template-loader.test.ts
git commit -m "fix(druckform): bundle zod+druckform for external-template TS components (B2)"
```

---

### Task 3: B4 — style fonts carry fontspec options

**Files:**
- Modify: `packages/druckform/src/sdk/types.ts` (`StyleTokens.fonts`, `StyleConfig.tokens.fonts`)
- Modify: `packages/druckform/src/style/compiler.ts` (`compileStyle`)
- Test: `packages/druckform/tests/unit/style-compiler.test.ts` (extend existing file)

**Interfaces:**
- Produces: `type FontSpec = string | { name: string; options?: string }` used for `fonts.main`/`fonts.mono`. `compileStyle` emits `\setmainfont{<name>}[<options>]` for the object form, `\setmainfont{<name>}` for the string form (and the same for `\setmonofont`).

- [ ] **Step 1: Write the failing tests**

Append the following `describe` block to `packages/druckform/tests/unit/style-compiler.test.ts`. **Do not add imports** — the file already imports `describe, expect, it` from `vitest`, `StyleConfig` from `../../src/sdk/types.js`, and `compileStyle` from `../../src/style/compiler.js`.

```ts
describe("compileStyle fonts", () => {
  it("emits a bare \\setmainfont for the string form", () => {
    const cfg: StyleConfig = { $schema: "style-v1", tokens: { fonts: { main: "Noto Sans" } } };
    const out = compileStyle(cfg);
    expect(out).toContain("\\setmainfont{Noto Sans}");
    expect(out).not.toContain("\\setmainfont{Noto Sans}[");
  });

  it("emits fontspec options for the object form", () => {
    const cfg: StyleConfig = {
      $schema: "style-v1",
      tokens: { fonts: { main: { name: "Noto Sans", options: "AutoFakeBold=2.2" } } },
    };
    const out = compileStyle(cfg);
    expect(out).toContain("\\setmainfont{Noto Sans}[AutoFakeBold=2.2]");
  });

  it("supports the object form for mono too", () => {
    const cfg: StyleConfig = {
      $schema: "style-v1",
      tokens: { fonts: { mono: { name: "JetBrains Mono", options: "Scale=0.9" } } },
    };
    const out = compileStyle(cfg);
    expect(out).toContain("\\setmonofont{JetBrains Mono}[Scale=0.9]");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter druckform exec vitest run tests/unit/style-compiler.test.ts`
Expected: FAIL — the object-form tests fail (TypeScript won't accept the object literal, or `compileStyle` emits `\setmainfont{[object Object]}`).

- [ ] **Step 3: Widen the font type**

In `packages/druckform/src/sdk/types.ts`, add a `FontSpec` type in the Style section (just above `StyleTokens`):

```ts
export type FontSpec = string | { name: string; options?: string };
```

Change `StyleTokens.fonts` from `{ main?: string; mono?: string }` to:

```ts
  fonts: { main?: FontSpec; mono?: FontSpec };
```

Change `StyleConfig.tokens.fonts` from `{ main?: string; mono?: string }` to:

```ts
    fonts?: { main?: FontSpec; mono?: FontSpec };
```

- [ ] **Step 4: Emit options in `compileStyle`**

In `packages/druckform/src/style/compiler.ts`, add a helper and replace the two font-emitting `if` blocks (lines 28–34).

Add this helper (near `capitalize`, e.g. at the bottom of the file):

```ts
function fontCommand(cmd: string, spec: import("../sdk/types.js").FontSpec): string {
  if (typeof spec === "string") return `\\${cmd}{${spec}}`;
  return spec.options ? `\\${cmd}{${spec.name}}[${spec.options}]` : `\\${cmd}{${spec.name}}`;
}
```

Replace:

```ts
  // Fonts (requires fontspec package in document preamble)
  if (tokens.fonts.main) {
    lines.push(`\\setmainfont{${tokens.fonts.main}}`);
  }
  if (tokens.fonts.mono) {
    lines.push(`\\setmonofont{${tokens.fonts.mono}}`);
  }
```

with:

```ts
  // Fonts (requires fontspec package in document preamble). A font token may be
  // a bare name or { name, options } — options are spliced as \setmainfont{n}[opts]
  // (e.g. AutoFakeBold for variable fonts that lack a selectable Bold instance).
  if (tokens.fonts.main) {
    lines.push(fontCommand("setmainfont", tokens.fonts.main));
  }
  if (tokens.fonts.mono) {
    lines.push(fontCommand("setmonofont", tokens.fonts.mono));
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter druckform exec vitest run tests/unit/style-compiler.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite (font type is used across style/coverage code)**

Run: `pnpm --filter druckform test`
Expected: PASS — `checkTokenCoverage` (keys on `fonts.main`/`fonts.mono` truthiness) and `mergeStyle` (field-level spread) are unaffected by the widened type.

- [ ] **Step 7: Commit**

```bash
pnpm biome check packages/druckform/src/sdk/types.ts packages/druckform/src/style/compiler.ts packages/druckform/tests/unit/style-compiler.test.ts
git add packages/druckform/src/sdk/types.ts packages/druckform/src/style/compiler.ts packages/druckform/tests/unit/style-compiler.test.ts
git commit -m "feat(druckform): style fonts accept fontspec options (B4)"
```

---

### Task 4: B8 — declarative components can declare `requiredTokens`

**Files:**
- Modify: `packages/druckform/src/component/declarative.ts`
- Test: `packages/druckform/tests/unit/component-declarative.test.ts` (extend existing file)

**Interfaces:**
- Produces: `*.component.yaml` accepts an optional top-level `requiredTokens: string[]`, merged into `ComponentDef.requiredTokens` and `meta.requiredTokens` (same channel TS components use).

- [ ] **Step 1: Write the failing test**

Add to `packages/druckform/tests/unit/component-declarative.test.ts` (it already has `loadDeclarativeComponent`, `makeTempYaml`, and a `ctx`). Add:

```ts
  it("merges declared requiredTokens into the component def", () => {
    const p = makeTempYaml(`
name: warnbox
description: A box that hardcodes a token color
requiredTokens: [warning]
params: {}
emits: |
  \\begin{tcolorbox}[colframe=druckWarning]{{children}}\\end{tcolorbox}
slots:
  children: true
`);
    const def = loadDeclarativeComponent(p);
    expect(def.requiredTokens.has("warning")).toBe(true);
    expect(def.meta.requiredTokens).toContain("warning");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter druckform exec vitest run tests/unit/component-declarative.test.ts`
Expected: FAIL — `def.requiredTokens.has("warning")` is `false` (declared tokens are ignored).

- [ ] **Step 3: Read and merge `requiredTokens` in the loader**

In `packages/druckform/src/component/declarative.ts`, add the field to the `DeclarativeComponentYaml` interface (after `preamble?: string;`):

```ts
  requiredTokens?: string[];
```

Then, after the existing param loop that builds `requiredTokens` (after line 47, before `const schema = z.object(shape);`), add:

```ts
  // Explicitly declared token dependencies (e.g. tokens hardcoded in emits/preamble
  // that the param-derived detection cannot see).
  for (const token of spec.requiredTokens ?? []) {
    requiredTokens.add(token);
  }
```

(The existing `meta.requiredTokens: [...requiredTokens]` and `requiredTokens` set on the returned `ComponentDef` then include the declared tokens automatically.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter druckform exec vitest run tests/unit/component-declarative.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm biome check packages/druckform/src/component/declarative.ts packages/druckform/tests/unit/component-declarative.test.ts
git add packages/druckform/src/component/declarative.ts packages/druckform/tests/unit/component-declarative.test.ts
git commit -m "feat(druckform): declarative components can declare requiredTokens (B8)"
```

---

### Task 5: Docs & skill — reflect the real, final authoring surface

Pure documentation. Update the authoring skill and the extending docs so every claim is true, and add the missing worked examples and the Part A asset API. No unit tests, but the deliverable must be internally consistent with the code from Tasks 1–4 and Part A.

**Files:**
- Modify: `claude-plugin/skills/druckform-authoring/SKILL.md`
- Modify: `docs/extending-druckform.md`
- Modify: `docs/authoring.md` (only where it repeats any of the below)

**Prerequisite:** Read all three files first, plus `packages/druckform/src/style/compiler.ts` (token → `druck<Name>` macro/name), `packages/druckform/src/sdk/asset-resolver.ts`, and `packages/druckform/src/latex/composer.ts` (`ctxFor`) so the prose matches the code.

- [ ] **Step 1: B1 — correct/confirm the `z` import guidance**

Ensure the skill's contract shows `import { z, tokenRef } from "druckform";` as valid (now true after Task 1), and add one line noting `import { z } from "zod";` also works. Remove any text implying `z` must come from `zod`.

- [ ] **Step 2: B3 — token name vs macro**

Add a subsection "Tokens: color name vs. switch macro" containing exactly this guidance and example:

```markdown
A style color token `accent` compiles to **both**:
- a color **named** `druckAccent` (use in color-key arguments, no backslash), and
- a switch **macro** `\druckAccent` (use in running text to switch color).

`ctx.token("accent")` returns the **macro** form (`\druckAccent`). Use the **name**
(`druckAccent`) in color arguments:

    % tcolorbox
    \begin{tcolorbox}[colframe=druckAccent, colback=druckAccent!6, coltitle=druckAccent]
    ...
    \end{tcolorbox}

    % colortbl
    \rowcolor{druckAccent}  \arrayrulecolor{druckAccent}

    % xcolor mix
    \color{druckMuted!30}

Splicing `ctx.token("accent")` (→ `\druckAccent`) into a `colframe=`/`\rowcolor{}`
argument breaks — those need the bare **name**.
```

- [ ] **Step 3: B5 — document `ctx.style`**

Add a line to the `RenderCtx` documentation: `ctx.style` exposes the raw token values as `{ colors: Record<string,string>, fonts: { main?, mono? }, spacing: Record<string,string> }` — use it when a shell needs a raw value (e.g. `ctx.style.fonts.main`), as distinct from `ctx.token(name)` which returns the `\druck<Name>` macro.

- [ ] **Step 4: B6 — worked frontmatter → title-block example**

Add a subsection "Reading frontmatter in the document shell" with this worked example:

```markdown
The document shell receives frontmatter twice: on the `DocumentLayout` payload
(`element.frontmatter`) and mirrored on `ctx.frontmatter`. A typical title block:

    import { escapeTeX, type DocumentLayout, type RenderCtx } from "druckform";
    export function render(_p, _c, ctx: RenderCtx, el?: DocumentLayout) {
      const fm = (el as DocumentLayout).frontmatter; // === ctx.frontmatter
      const title = escapeTeX(fm.title ?? "");
      const subtitle = escapeTeX(fm.subtitle ?? "");
      return [
        (el as DocumentLayout).stylePreamble,
        "\\begin{document}",
        `{\\Huge\\bfseries ${title}\\par}`,
        subtitle ? `{\\Large ${subtitle}\\par}` : "",
        "DRUCKFORM_BODY",
        "\\end{document}",
      ].join("\n");
    }
```

- [ ] **Step 5: B7 — preview-component limitation**

Add one line where `preview-component`/`preview_component` is documented: it previews only `:::`-invoked components; the `document` shell and `block:*` overrides cannot be previewed in isolation — iterate on them with a full `render`.

- [ ] **Step 6: B8 docs — requiredTokens, coverage blind spot, --assets, no sans**

Add these notes:
- Declarative components may declare `requiredTokens: [tokenA, tokenB]` at the top level of `*.component.yaml`; this is required when a token is used only in hardcoded `emits`/`preamble` LaTeX (e.g. `colframe=druckWarning`), because doctor's token-coverage check does **not** scan `emits`/`preamble` for `druck<Name>` references — only param-derived tokens and declared `requiredTokens` are tracked.
- The `--assets <dir>` CLI flag (default `"."`) sets the document assets root; `block:image` resolves each Markdown image `src` against it (to an absolute path).
- Only `\setmainfont` and `\setmonofont` are emitted from `fonts.main`/`fonts.mono` — there is no `\setsansfont`. If `main` is a sans font, body text inherits it; `\sffamily` is not separately configured.

- [ ] **Step 7: B4 docs — variable-font bold + font options**

Add a note documenting the failure mode and fix: variable fonts (e.g. Noto Sans on macOS ship as variable-only) can leave `\bfseries` rendering Regular because fontspec can't select a Bold instance. Set options via the token: `fonts: { main: { name: "Noto Sans", options: "AutoFakeBold=2.2" } }`, which compiles to `\setmainfont{Noto Sans}[AutoFakeBold=2.2]`.

- [ ] **Step 8: Part A — document `ctx.asset` and `ctx.templateDir`**

Add a "Template-bundled assets" subsection:

```markdown
Components and the document shell can reference files that ship inside the
template directory:

- `ctx.asset(ref)` — resolves `ref` against the template dir, returns an
  **absolute** path (safe to use directly in `\includegraphics`), and auto-converts
  `.svg` → PDF. Requires the `rsvg-convert` binary for SVG (the same tool the
  diagram pipeline uses); a missing binary is a hard error. Resolution is against
  the **defining** template's dir (across `extends`), and conversions are memoized.
- `ctx.templateDir` — the raw absolute template root, for `\input`, bundled `.sty`,
  or fontspec `Path=...`.

Logo in the running header (in the `document` shell):

    return raw(`\\includegraphics[height=8mm]{${ctx.asset("logo.svg")}}`);
```

- [ ] **Step 9: Verify docs consistency**

- Grep the skill and docs for stale claims: `grep -n "setsansfont\|import { z }" claude-plugin/skills/druckform-authoring/SKILL.md docs/extending-druckform.md` — confirm no remaining incorrect guidance.
- If any example component file was added under `templates/examples/`, run `pnpm --filter druckform exec druck doctor --template examples` (or the repo's doctor invocation) and confirm it is clean. (If no example file was added, skip.)
- Run `pnpm biome check .` — must be clean (biome checks `docs/**`? confirm from biome.json `includes`; if docs are excluded, this is a no-op).

- [ ] **Step 10: Commit**

```bash
git add claude-plugin/skills/druckform-authoring/SKILL.md docs/extending-druckform.md docs/authoring.md
git commit -m "docs(druckform): honest authoring contract — z, tokens, ctx.style, fonts, assets (B1,B3-B8)"
```

---

## Notes for the implementer

- **Task order:** 1 → 2 → 3 → 4 → 5. Tasks 1–4 are independent code edits; do them in order for clean commits. Task 5 (docs) must be last so it describes the final code.
- **B2 is the riskiest task.** Its integration test is the arbiter: a component in an OS-temp dir (no reachable `node_modules`) must load. If `DRUCKFORM_ENTRY` resolves wrong, the fix is to correct the candidate list, not to weaken the test.
- **No `mergeStyle` change** for B4 — it already spreads `fonts` field-by-field, so an override of `main` replaces the whole value (string or object).
- **Keep the branch biome-clean** — run `pnpm biome check .` before each commit (a prior effort left violations by skipping this).
