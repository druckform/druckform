# Authoring DX Phase 4 — Scaffolding & Auto-discovery

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the per-component boilerplate-and-wiring tax: auto-register components dropped into a template's `components/` directory, and add `druck new component` / `druck new template` generators that emit correct, doctor-passing boilerplate.

**Architecture:** Today every component must be hand-written and explicitly listed in `template.yaml`'s `components:` map; `resolveTemplate` only ever loads what that map references. Phase 4 makes `resolveTemplate` additionally scan each chain entry's `components/` directory and auto-register files not already declared, with explicit `template.yaml` entries always winning (so `defaults`/partial-overrides/tombstones keep working). Generators then just write a file into `components/` — auto-discovery wires it.

**Tech Stack:** TypeScript (ESM), `js-yaml`, `zod`, `yargs`, `vitest`, pnpm workspace.

## Global Constraints

- Node.js ≥ 22; pnpm; tests via `vitest`. Run all commands from repo root: `/Users/torbenhartmann/Documents/customers/private/druckform`.
- **Commit after each task** with `git add` of exactly the files that task touched.
- Existing tests must keep passing. Reserved-namespace (`block:`) and block-null tombstone rules in `loader.ts` must still fire.
- Depends on **Phase 1** (in-process loader + `renderComponent` test helper) and **Phase 2** (`druck doctor`) for the scaffold-passes-doctor gate.
- Design source: `docs/superpowers/specs/2026-06-29-authoring-dx-design.md` §3 Phase 4.

### Design decisions (locked)

- **Name derivation for auto-discovery (no pre-load):** transpiling every `.ts` just to read `meta.name` would be wasteful at resolve time. So auto-discovery derives the registered name from the **filename stem** for `.ts`/`.js` (e.g. `callout.ts` → `callout`), and from the parsed `name:` field for `.component.yaml`/`.yaml` (a cheap YAML read). Convention for TS: **filename stem must equal `meta.name`**; Phase-2 `druck doctor` flags mismatches. Because a filename stem can never contain `:`, auto-discovery can never synthesise a reserved `block:*` name — those stay explicit-only (declared in `base`), and their source files (`block-heading.ts`, …) are skipped because an explicit entry's `source` already points at them.
- **Explicit always wins:** within a template, a file is auto-registered only if (a) its derived name is not an explicit key in that template's `components:` and (b) it is not already the `source:` target of any explicit entry. Across the chain, the existing leaf-wins / `null`-tombstone merge is unchanged.
- **Generator target directory:** `druck new` writes into the **user** templates dir — `process.env.DRUCKFORM_TEMPLATES_DIR` if set, else `./templates` under the cwd (created if missing). Never into the installed package. When the resolved target is inside this repo's `packages/druckform/templates/`, the component generator also emits a colocated unit test under `packages/druckform/tests/unit/`; otherwise it prints guidance instead of a test (a user project may have no vitest).

---

### Task 1: Auto-discover components from `components/`

**Files:**
- Create: `packages/druckform/src/template/discover.ts`
- Modify: `packages/druckform/src/template/resolver.ts`
- Test: `packages/druckform/tests/unit/auto-discovery.test.ts`

**Interfaces:**
- Consumes: `TemplateEntry` (`{ config, dir, origin }`) from `./loader.js`; `loadComponent(sourcePath, "")` from `../component/loader.js`.
- Produces: `discoverComponents(entry: TemplateEntry): Map<string, string>` — derived component name → absolute source path, for files in `entry.dir/components/` not already referenced by `entry.config.components`.

- [ ] **Step 1: Write the failing test** — `tests/unit/auto-discovery.test.ts` (mirrors the temp-dir pattern in `tests/unit/template-resolver.test.ts`):
```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

let dir: string | null = null;
afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function writeTemplate(name: string, yaml: string, files: Record<string, string>): void {
  const tdir = path.join(dir as string, name);
  fs.mkdirSync(path.join(tdir, "components"), { recursive: true });
  fs.writeFileSync(path.join(tdir, "template.yaml"), yaml, "utf8");
  for (const [rel, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(tdir, "components", rel), content, "utf8");
  }
}

describe("component auto-discovery", () => {
  it("registers a components/*.ts file with no explicit template.yaml entry", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-disc-"));
    writeTemplate("auto", "name: auto\ncomponents: {}\n", {
      "widget.ts":
        'import { z } from "zod";\nexport const schema = z.object({});\n' +
        'export const meta = { name: "widget", description: "x", acceptsChildren: false };\n' +
        "export function render() { return \"\\\\widget\"; }\n",
    });
    const resolved = await resolveTemplate("auto", loadAllTemplates(dir));
    expect(resolved.components.widget).toBeDefined();
  });

  it("registers a *.component.yaml by its yaml name field", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-disc-"));
    writeTemplate("auto", "name: auto\ncomponents: {}\n", {
      "box.component.yaml": "name: box\ndescription: x\nparams: {}\nslots: { children: true }\nemits: |\n  {{children}}\n",
    });
    const resolved = await resolveTemplate("auto", loadAllTemplates(dir));
    expect(resolved.components.box).toBeDefined();
  });

  it("lets an explicit template.yaml entry win over an auto-discovered file", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-disc-"));
    writeTemplate(
      "auto",
      'name: auto\ncomponents:\n  widget:\n    source: components/widget.ts\n    defaults: { tone: "loud" }\n',
      {
        "widget.ts":
          'import { z } from "zod";\nexport const schema = z.object({ tone: z.string().optional() });\n' +
          'export const meta = { name: "widget", description: "x", acceptsChildren: false };\n' +
          "export function render() { return \"\\\\widget\"; }\n",
      },
    );
    const resolved = await resolveTemplate("auto", loadAllTemplates(dir));
    expect(resolved.components.widget?.defaults.tone).toBe("loud"); // explicit defaults applied
  });
});
```

- [ ] **Step 2: Run to verify it fails**
```bash
pnpm --filter druckform exec vitest run tests/unit/auto-discovery.test.ts
```
Expected: FAIL — `discover.ts` missing / `resolved.components.widget` undefined.

- [ ] **Step 3: Implement `discover.ts`**
```ts
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { TemplateEntry } from "./loader.js";

// Derived component name → absolute source path, for files under `<dir>/components/`
// that the template.yaml does not already declare (by name) or reference (by source).
export function discoverComponents(entry: TemplateEntry): Map<string, string> {
  const found = new Map<string, string>();
  const compDir = path.join(entry.dir, "components");
  if (!fs.existsSync(compDir)) return found;

  const explicitNames = new Set(Object.keys(entry.config.components ?? {}));
  const explicitSources = new Set(
    Object.values(entry.config.components ?? {})
      .map((o) => (o && o.source ? path.resolve(entry.dir, o.source) : null))
      .filter((p): p is string => p !== null),
  );

  for (const file of fs.readdirSync(compDir)) {
    const abs = path.join(compDir, file);
    if (!fs.statSync(abs).isFile()) continue;
    if (explicitSources.has(abs)) continue; // already wired explicitly

    let name: string | null = null;
    if (file.endsWith(".component.yaml") || file.endsWith(".yaml") || file.endsWith(".yml")) {
      const parsed = yaml.load(fs.readFileSync(abs, "utf8")) as { name?: string } | null;
      name = parsed?.name ?? null;
    } else if (file.endsWith(".ts") || file.endsWith(".js") || file.endsWith(".mjs")) {
      name = file.replace(/\.[^.]+$/, ""); // filename stem (convention: stem === meta.name)
    }
    if (!name || explicitNames.has(name)) continue;
    found.set(name, abs);
  }
  return found;
}
```

- [ ] **Step 4: Fold auto-discovery into `resolveTemplate`**

In `src/template/resolver.ts`, import the helper and, **inside the chain loop, before** processing `entry.config.components`, seed `mergedComponents` with discovered files (so explicit entries processed afterward override them):
```ts
import { discoverComponents } from "./discover.js";
// …inside `for (const tplName of chain)` after resolving `entry`:
    for (const [name, sourcePath] of discoverComponents(entry)) {
      mergedComponents.set(name, { sourcePath, defaults: {} });
    }
    // …then the existing `for (const [compName, override] of Object.entries(entry.config.components ?? {}))` block runs,
    //    overriding/extending/deleting as today.
```
(Existing `style`/`frontmatter` merge and the explicit-component loop are unchanged.)

- [ ] **Step 5: Run the test + the resolver regression + typecheck**
```bash
pnpm --filter druckform exec vitest run tests/unit/auto-discovery.test.ts tests/unit/template-resolver.test.ts tests/unit/reserved-namespace.test.ts tests/unit/component-tombstone.test.ts
pnpm --filter druckform typecheck
```
Expected: PASS. Bundled `base`/`report` still resolve (their `block:*` files are skipped via `explicitSources`).

- [ ] **Step 6: Guard against bundled-template drift**
```bash
pnpm --filter druckform exec vitest run tests/integration/gfm-render.test.ts tests/integration/document-override.test.ts
```
Expected: PASS — auto-discovery must not double-register or rename `base`'s `block:*`/`document`/`infobox` (all explicitly sourced).

- [ ] **Step 7: Commit**
```bash
git add packages/druckform/src/template/discover.ts packages/druckform/src/template/resolver.ts packages/druckform/tests/unit/auto-discovery.test.ts
git commit -m "feat(druckform): auto-discover components from a template's components/ dir"
```

---

### Task 2: The scaffolding generators (`new component` / `new template`)

**Files:**
- Create: `packages/druckform/src/commands/scaffold.ts`
- Test: `packages/druckform/tests/unit/scaffold.test.ts`

**Interfaces:**
- Produces:
  - `resolveUserTemplatesDir(): string` — `DRUCKFORM_TEMPLATES_DIR` or `./templates` (created if missing).
  - `newComponent(opts: { template: string; name: string; kind: "ts" | "yaml"; acceptsChildren: boolean }): { file: string; test?: string }`.
  - `newTemplate(opts: { name: string; extends?: string }): { dir: string; file: string }`.

- [ ] **Step 1: Write the failing test** — `tests/unit/scaffold.test.ts`:
```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newComponent, newTemplate } from "../../src/commands/scaffold.js";
import { renderComponent } from "../helpers/render-component.js";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "df-scaffold-"));
  process.env.DRUCKFORM_TEMPLATES_DIR = root;
});
afterEach(() => {
  process.env.DRUCKFORM_TEMPLATES_DIR = undefined;
  fs.rmSync(root, { recursive: true, force: true });
});

describe("scaffolding", () => {
  it("new template creates template.yaml + components dir", () => {
    const { dir, file } = newTemplate({ name: "acme", extends: "base" });
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.existsSync(path.join(dir, "components"))).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toContain("extends: base");
  });

  it("new component (ts) emits a loadable, renderable component", async () => {
    newTemplate({ name: "acme", extends: "base" });
    const { file } = newComponent({ template: "acme", name: "banner", kind: "ts", acceptsChildren: true });
    expect(fs.existsSync(file)).toBe(true);
    // the emitted file loads and renders (children passthrough by default)
    const out = await renderComponent(file, {}, { children: "BODY" });
    expect(out).toContain("BODY");
  });

  it("new component (yaml) emits a parseable declarative component", async () => {
    newTemplate({ name: "acme" });
    const { file } = newComponent({ template: "acme", name: "note", kind: "yaml", acceptsChildren: true });
    const out = await renderComponent(file, {}, { children: "X" });
    expect(out).toContain("X");
  });
});
```

- [ ] **Step 2: Run to verify it fails** (module missing).

- [ ] **Step 3: Implement `scaffold.ts`**
```ts
import fs from "node:fs";
import path from "node:path";

export function resolveUserTemplatesDir(): string {
  const dir = process.env.DRUCKFORM_TEMPLATES_DIR ?? path.resolve(process.cwd(), "templates");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function newTemplate(opts: { name: string; extends?: string }): { dir: string; file: string } {
  const dir = path.join(resolveUserTemplatesDir(), opts.name);
  fs.mkdirSync(path.join(dir, "components"), { recursive: true });
  const file = path.join(dir, "template.yaml");
  if (fs.existsSync(file)) throw new Error(`Template already exists: ${file}`);
  const ext = opts.extends ? `extends: ${opts.extends}\n` : "";
  fs.writeFileSync(
    file,
    `name: ${opts.name}\ndescription: "TODO: describe ${opts.name}"\n${ext}components: {}\n`,
    "utf8",
  );
  return { dir, file };
}

const TS_TEMPLATE = (name: string, acceptsChildren: boolean) =>
  `import { z } from "zod";
import type { Component, RenderCtx } from "druckform";

export const schema = z.object({});
export const meta = {
  name: "${name}",
  description: "TODO: describe ${name}",
  acceptsChildren: ${acceptsChildren},
  example: "::: ${name}\\n${acceptsChildren ? "body\\n" : ""}:::",
};

export const render: Component<typeof schema> = (_params, children, _ctx: RenderCtx) => {
  // TODO: emit LaTeX. \`children\` is pre-rendered (raw); escapeTeX any user strings.
  return ${acceptsChildren ? "children" : '""'};
};
`;

const YAML_TEMPLATE = (name: string, acceptsChildren: boolean) =>
  `name: ${name}
description: "TODO: describe ${name}"
params: {}
slots:
  children: ${acceptsChildren}
emits: |
  ${acceptsChildren ? "{{children}}" : "% TODO: emit LaTeX"}
`;

export function newComponent(opts: {
  template: string;
  name: string;
  kind: "ts" | "yaml";
  acceptsChildren: boolean;
}): { file: string; test?: string } {
  const tplDir = path.join(resolveUserTemplatesDir(), opts.template);
  if (!fs.existsSync(path.join(tplDir, "template.yaml"))) {
    throw new Error(`Template '${opts.template}' not found at ${tplDir} (run: druck new template --name ${opts.template})`);
  }
  const compDir = path.join(tplDir, "components");
  fs.mkdirSync(compDir, { recursive: true });
  const ext = opts.kind === "ts" ? "ts" : "component.yaml";
  const file = path.join(compDir, `${opts.name}.${ext}`);
  if (fs.existsSync(file)) throw new Error(`Component already exists: ${file}`);
  fs.writeFileSync(
    file,
    opts.kind === "ts"
      ? TS_TEMPLATE(opts.name, opts.acceptsChildren)
      : YAML_TEMPLATE(opts.name, opts.acceptsChildren),
    "utf8",
  );

  // Colocated starter test only when scaffolding inside this repo's bundled templates.
  const repoTemplates = path.resolve(import.meta.dirname, "../../templates");
  let test: string | undefined;
  if (path.resolve(tplDir).startsWith(repoTemplates + path.sep)) {
    test = path.resolve(import.meta.dirname, `../../tests/unit/scaffold-${opts.name}.test.ts`);
    fs.writeFileSync(
      test,
      `import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const FILE = path.resolve(import.meta.dirname, "../../templates/${opts.template}/components/${opts.name}.${ext}");

describe("${opts.name}", () => {
  it("renders", async () => {
    const out = await renderComponent(FILE, {}, { children: "BODY" });
    expect(typeof out).toBe("string");
  });
});
`,
      "utf8",
    );
  }
  return test ? { file, test } : { file };
}
```

- [ ] **Step 4: Run the test + typecheck**
```bash
pnpm --filter druckform exec vitest run tests/unit/scaffold.test.ts
pnpm --filter druckform typecheck
```
Expected: PASS (emitted TS + YAML components both load and render via `renderComponent`).

- [ ] **Step 5: Commit**
```bash
git add packages/druckform/src/commands/scaffold.ts packages/druckform/tests/unit/scaffold.test.ts
git commit -m "feat(druckform): add component/template scaffolding generators"
```

---

### Task 3: Wire `druck new` into the CLI

**Files:**
- Modify: `packages/druckform/src/cli.ts`
- Test: `packages/druckform/tests/integration/new-command.test.ts`

**Interfaces:**
- Consumes: `newComponent`, `newTemplate` from `../commands/scaffold.js`.

- [ ] **Step 1: Write the failing test** — `tests/integration/new-command.test.ts` invokes the command handlers directly (mirror how other command tests import the command function). Since `cli.ts` wires yargs inline, factor the handlers into `scaffold.ts` and test those (Task 2 already covers them); here add an integration check that a scaffolded component is then **auto-discovered** by `resolveTemplate`:
```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newComponent, newTemplate } from "../../src/commands/scaffold.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "df-new-"));
  process.env.DRUCKFORM_TEMPLATES_DIR = root;
});
afterEach(() => {
  process.env.DRUCKFORM_TEMPLATES_DIR = undefined;
  fs.rmSync(root, { recursive: true, force: true });
});

describe("druck new → auto-discovery", () => {
  it("a scaffolded component is registered without editing template.yaml", async () => {
    newTemplate({ name: "acme", extends: "base" });
    newComponent({ template: "acme", name: "banner", kind: "ts", acceptsChildren: true });
    const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
    const resolved = await resolveTemplate("acme", loadAllTemplates(BUNDLED, root));
    expect(resolved.components.banner).toBeDefined();
    expect(resolved.components.infobox).toBeDefined(); // still inherits base
  });
});
```

- [ ] **Step 2: Run to verify it fails / passes** — if Task 1+2 are done this may already pass; if so, treat it as the regression lock. If it fails because the env var/path wiring differs, fix in Step 3.

- [ ] **Step 3: Register the `new` command in `cli.ts`** — add a `new` command with two positionals/subflags:
```ts
import { newComponent, newTemplate } from "./commands/scaffold.js";
// …add before .demandCommand:
  .command(
    "new <kind>",
    "Scaffold a template or component",
    (y) =>
      y
        .positional("kind", { choices: ["template", "component"] as const, demandOption: true })
        .option("name", { type: "string", demandOption: true })
        .option("template", { type: "string", describe: "target template (for kind=component)" })
        .option("extends", { type: "string", describe: "parent template (for kind=template)" })
        .option("format", { choices: ["ts", "yaml"] as const, default: "ts" })
        .option("accepts-children", { type: "boolean", default: false }),
    (argv) => {
      if (argv.kind === "template") {
        const { file } = newTemplate({ name: argv.name, ...(argv.extends ? { extends: argv.extends } : {}) });
        console.log(`✓ Created template ${file}`);
      } else {
        if (!argv.template) throw new Error("--template is required for: druck new component");
        const { file, test } = newComponent({
          template: argv.template,
          name: argv.name,
          kind: argv.format,
          acceptsChildren: argv["accepts-children"],
        });
        console.log(`✓ Created component ${file}${test ? ` (+ test ${test})` : ""}`);
      }
    },
  )
```

- [ ] **Step 4: Run the integration test + a manual smoke**
```bash
pnpm --filter druckform exec vitest run tests/integration/new-command.test.ts
pnpm --filter druckform build
DRUCKFORM_TEMPLATES_DIR=$(mktemp -d) sh -c 'node packages/druckform/dist/cli.js new template --name acme --extends base && node packages/druckform/dist/cli.js new component --template acme --name banner --accepts-children && node packages/druckform/dist/cli.js components --template acme | grep banner'
```
Expected: test PASS; smoke prints the created paths and `banner` appears in `druck components`.

- [ ] **Step 5: Commit**
```bash
git add packages/druckform/src/cli.ts packages/druckform/tests/integration/new-command.test.ts
git commit -m "feat(druckform): add 'druck new template|component' CLI"
```

---

### Task 4: Docs + changeset

**Files:**
- Modify: `docs/extending-druckform.md`
- Create: `.changeset/authoring-dx-scaffold.md`

- [ ] **Step 1: Docs** — in `docs/extending-druckform.md`:
  - CLI reference table (§1): add `druck new template` and `druck new component` rows.
  - §5 (Creating a component): add a "Scaffold it" lead-in showing `druck new component --template acme --name banner --accepts-children` and noting the file is **auto-registered** (no `template.yaml` edit needed).
  - §6 (templates): note auto-discovery — any file under `components/` is registered by its name (TS: filename stem must equal `meta.name`; YAML: the `name:` field); explicit `template.yaml` entries still override for `defaults`/partial overrides/tombstones.

- [ ] **Step 2: Changeset** — `.changeset/authoring-dx-scaffold.md`:
```markdown
---
"druckform": minor
---

Scaffold and auto-discover components. Drop a file in a template's `components/`
directory and it is registered automatically (TS by filename stem, YAML by its
`name:` field); explicit `template.yaml` entries still win. New `druck new
template` and `druck new component` generators emit ready-to-edit boilerplate
(and a starter test for in-repo templates).
```

- [ ] **Step 3: Commit**
```bash
git add docs/extending-druckform.md .changeset/authoring-dx-scaffold.md
git commit -m "docs(druckform): document scaffolding + auto-discovery"
```

---

## Final verification
```bash
pnpm --filter druckform exec vitest run
pnpm lint && pnpm turbo typecheck && pnpm turbo build && pnpm turbo test
# scaffold → doctor (Phase 2) → it passes:
DRUCKFORM_TEMPLATES_DIR=$(mktemp -d) sh -c 'node packages/druckform/dist/cli.js new template --name t1 --extends base && node packages/druckform/dist/cli.js new component --template t1 --name w1 --accepts-children && node packages/druckform/dist/cli.js doctor --template t1'
```

## Self-Review

**Spec coverage (§3 Phase 4):** auto-discovery folded into `resolveTemplate`, explicit-wins + reserved rules preserved (Task 1) · `druck new component` ts/yaml with starter test (Task 2) · `druck new template` (Task 2) · CLI wiring (Task 3) · docs + changeset (Task 4). Scaffold-passes-doctor and scaffold-is-auto-discovered are verified (Task 3 Step 4, Final verification).

**Placeholder scan:** the only "TODO" strings are inside the *generated boilerplate* (intended scaffold content), not plan steps; every plan step shows complete code and exact commands.

**Type consistency:** `discoverComponents` returns `Map<string,string>` (name→abspath) consumed by `resolveTemplate` to build the same `{ sourcePath, defaults }` shape the explicit loop uses; `newComponent`/`newTemplate` signatures match their `cli.ts` call sites; emitted TS uses `Component<typeof schema>` and `RenderCtx` (with the `frontmatter` field from extensibility Phase 3) and loads via the Phase-1 `renderComponent` helper.

**Dependency notes:** assumes Phase 1 (`renderComponent` helper, in-process loader) and Phase 2 (`druck doctor`) are merged; the auto-discovery name-derivation deliberately avoids loading `.ts` files at resolve time (filename-stem convention; doctor flags stem↔`meta.name` mismatches).
