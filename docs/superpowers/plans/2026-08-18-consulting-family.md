# Consulting Template Family Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `consulting` template whose findings carry severity, impact, evidence and recommendation, and which generates its own findings index.

**Architecture:** A new template extending `base`. `finding` is a TypeScript component holding three declarative sub-components in its single content slot; it writes one line per finding to a LaTeX auxiliary file, and `findings-summary` reads that file back as a generated table. The mechanism is plain LaTeX internals — the machinery behind `\listoffigures` — so the family adds no LaTeX packages, and Tectonic's existing auto-rerun resolves the page numbers.

**Tech Stack:** TypeScript (ESM, Node ≥ 22), pnpm workspaces + turbo, vitest, zod (component schemas), esbuild (TS component loader), Tectonic (LaTeX), biome.

**Spec:** `docs/superpowers/specs/2026-08-18-consulting-family-design.md`

## Global Constraints

- **Zero new LaTeX packages.** Verified achievable: the findings index uses `\@starttoc`, `\addcontentsline` and an `\l@finding` formatter, all plain LaTeX. If you find yourself adding `\usepackage`, stop — `tests/integration/prewarm-sync.test.ts` will fail, and the prewarm document would need updating too.
- **`consulting` must declare a default for every token its components require**, in its own `style.tokens`. `tests/integration/bundled-template-tokens.test.ts` enforces this; without it a hand-written style hits `Missing required style token`, which is what made `report` unusable before v0.3.0.
- **`ref`'s `kind` is an enum, never a free string.** A typo'd kind produces a dangling `\ref`, which LaTeX renders as `??` with only a warning — a silent failure. An enum makes it a zod error at lint time.
- **Both sides of a label go through `sanitizeLabelId`** from `@druckform/core`. `figure`/`ref` disagreeing on this shipped a silent `??` bug once already.
- **User input must be escaped** with `escapeTeX` before entering LaTeX.
- **Every component ships `meta.example`** (TS) or `example:` (YAML) — `preview-component` and `list_components` depend on it, and the examples gallery asserts the docs match it verbatim.
- **Every bundled template stays `doctor`-clean:** `base`, `report`, `examples` and the new `consulting`.
- Node ≥ 22; biome governs lint/format (`pnpm lint` must be clean); run `pnpm -w build` (workspace build) before invoking the CLI by hand.
- Test commands: `pnpm turbo test` (349 passing at plan time). Single file: `cd packages/druckform && npx vitest run <path> --coverage=false`.

---

### Task 1: `ref` gains a `kind` enum

**Files:**
- Modify: `packages/druckform/templates/base/components/ref.ts`
- Test: `packages/druckform/tests/unit/figure-component.test.ts` (existing — it already covers `ref`)

**Interfaces:**
- Consumes: `sanitizeLabelId` from `@druckform/core` (already imported).
- Produces: `ref` accepts `kind: "fig" | "finding"`, defaulting to `"fig"`. Task 3's `finding` emits `\label{finding:<id>}` against it.

- [ ] **Step 1: Write the failing tests**

Append to `packages/druckform/tests/unit/figure-component.test.ts`:

```ts
describe("ref kind", () => {
  it("defaults to the figure namespace", async () => {
    const out = await renderComponent(REF, {}, { children: "arch" });
    expect(out).toContain("\\ref{fig:arch}");
  });

  it("references a finding when kind=finding", async () => {
    const out = await renderComponent(REF, { kind: "finding" }, { children: "F-01" });
    expect(out).toContain("\\ref{finding:F-01}");
  });

  // An unknown kind must fail loudly at validation time. A free-form string
  // would instead emit \ref{typo:F-01}, which LaTeX renders as "??" with only
  // a warning — the silent failure this enum exists to prevent.
  it("rejects an unknown kind", async () => {
    await expect(
      renderComponent(REF, { kind: "sektion" }, { children: "F-01" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/druckform && npx vitest run tests/unit/figure-component.test.ts --coverage=false`
Expected: the `kind=finding` test FAILS (emits `\ref{fig:F-01}`); the reject test FAILS (zod strips the unknown key rather than throwing).

- [ ] **Step 3: Add the enum**

In `packages/druckform/templates/base/components/ref.ts`, replace the schema and the emitted string:

```ts
export const schema = z.object({
  /** Label namespace. Each template family that introduces a referenceable
   *  thing extends this enum. It is an enum rather than a free string on
   *  purpose: a typo'd kind would emit a dangling \ref, which LaTeX renders
   *  as "??" with a warning rather than an error. */
  kind: z.enum(["fig", "finding"]).default("fig"),
});
```

and in `render`, change the returned string to:

```ts
  return `\\ref{${params.kind}:${sanitizeLabelId(children)}}`;
```

Update `meta.description` to `"Inline cross-reference, e.g. :ref[arch] or :ref[F-01]{kind=finding}."` and leave `meta.example` unchanged — the default keeps every existing document working.

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/druckform && npx vitest run tests/unit/figure-component.test.ts --coverage=false`
Expected: PASS, including the pre-existing figure/ref label-agreement tests.

- [ ] **Step 5: Full suite, lint, commit**

```bash
pnpm -w build && pnpm turbo test && pnpm lint
git add packages/druckform/templates/base/components/ref.ts \
        packages/druckform/tests/unit/figure-component.test.ts
git commit -m "feat(core): ref gains a kind enum for non-figure cross-references"
```

---

### Task 2: The `consulting` template and its severity tokens

**Files:**
- Create: `packages/druckform/templates/consulting/template.yaml`
- Modify: `packages/druckform/tests/integration/bundled-template-tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a `consulting` template extending `base`, declaring the four severity colour tokens Task 3's `finding` requires.

- [ ] **Step 1: Add consulting to the token invariant test**

In `packages/druckform/tests/integration/bundled-template-tokens.test.ts`, add `"consulting"` to the `describe.each` array so it reads:

```ts
describe.each(["base", "report", "examples", "consulting"])(
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/druckform && npx vitest run tests/integration/bundled-template-tokens.test.ts --coverage=false`
Expected: FAIL — `Template not found: 'consulting'`.

- [ ] **Step 3: Create the template**

Create `packages/druckform/templates/consulting/template.yaml`:

```yaml
name: consulting
description: "Consulting deliverables — findings with severity, evidence and recommendations."
extends: base
style:
  tokens:
    # Every token this template's components declare as required must have a
    # default here, so a hand-written style that omits one gets a sensible
    # colour instead of a "Missing required style token" error. Users still
    # override freely via --style, which merges on top of this.
    colors:
      severityCritical: "#7A0012"
      severityHigh: "#B00020"
      severityMedium: "#B26A00"
      severityLow: "#2E5AAC"
components: {}
```

`components: {}` is required — `TemplateConfig.components` is not optional — and empty is correct here: everything comes from `base` until Task 3.

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/druckform && npx vitest run tests/integration/bundled-template-tokens.test.ts --coverage=false`
Expected: PASS for all four templates.

- [ ] **Step 5: Verify the template is discoverable and clean**

```bash
pnpm -w build
node packages/druckform/dist/cli.js templates --json | grep -c consulting   # expect 1
node packages/druckform/dist/cli.js doctor --template consulting --json     # expect ok: true
```

- [ ] **Step 6: Commit**

```bash
pnpm turbo test && pnpm lint
git add packages/druckform/templates/consulting/template.yaml \
        packages/druckform/tests/integration/bundled-template-tokens.test.ts
git commit -m "feat(core): add the consulting template with severity colour tokens"
```

---

### Task 3: `finding` and its three sub-components

**Files:**
- Create: `packages/druckform/templates/consulting/components/finding.ts`
- Create: `packages/druckform/templates/consulting/components/impact.component.yaml`
- Create: `packages/druckform/templates/consulting/components/evidence.component.yaml`
- Create: `packages/druckform/templates/consulting/components/recommendation.component.yaml`
- Modify: `packages/druckform/templates/consulting/template.yaml`
- Test: `packages/druckform/tests/unit/finding-component.test.ts` (create)

**Interfaces:**
- Consumes: `ref`'s `kind: "finding"` (Task 1); the severity tokens (Task 2).
- Produces: `finding` emits `\label{finding:<sanitised id>}` and one `\addcontentsline{fnd}{finding}{\protect\findingentry{id}{severity}{title}}` per finding. Task 4's `findings-summary` defines `\findingentry`, `\l@finding` and `\listoffindings`.

- [ ] **Step 1: Write the failing tests**

Create `packages/druckform/tests/unit/finding-component.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const dir = path.resolve(import.meta.dirname, "../../templates/consulting/components");
const at = (f: string) => path.join(dir, f);
const REF = path.resolve(import.meta.dirname, "../../templates/base/components/ref.ts");

const base = { severity: "high", id: "F-01", title: "Secrets in CI logs" };

describe("finding", () => {
  it("renders id, severity label and title", async () => {
    const out = await renderComponent(at("finding.ts"), base, { children: "body" });
    expect(out).toContain("F-01");
    expect(out).toContain("High");
    expect(out).toContain("Secrets in CI logs");
    expect(out).toContain("body");
  });

  // Each severity must reach a DISTINCT token. callout once mapped every
  // variant except one to the same colour, so `danger` rendered as `info`.
  it.each([
    ["critical", "\\druckSeverityCritical"],
    ["high", "\\druckSeverityHigh"],
    ["medium", "\\druckSeverityMedium"],
    ["low", "\\druckSeverityLow"],
  ])("severity %s uses %s", async (severity, token) => {
    const out = await renderComponent(at("finding.ts"), { ...base, severity });
    expect(out).toContain(token);
  });

  it("rejects an unknown severity", async () => {
    await expect(
      renderComponent(at("finding.ts"), { ...base, severity: "showstopper" }),
    ).rejects.toThrow();
  });

  it("escapes id and title", async () => {
    const out = await renderComponent(at("finding.ts"), {
      ...base,
      id: "F&1",
      title: "100% of tokens",
    });
    expect(out).toContain("F\\&1");
    expect(out).toContain("100\\% of tokens");
  });

  it("writes exactly one index entry, protected for the aux file", async () => {
    const out = await renderComponent(at("finding.ts"), base);
    expect(out.match(/\\addcontentsline\{fnd\}\{finding\}/g) ?? []).toHaveLength(1);
    expect(out).toContain("\\protect\\findingentry");
  });

  // The figure/ref bug: one side emitted the id raw while the other received it
  // escaped, so the label and the reference disagreed and the PDF said "??".
  it("produces a label byte-identical to what ref{kind=finding} references", async () => {
    const out = await renderComponent(at("finding.ts"), { ...base, id: "acme_prod_2026" });
    const ref = await renderComponent(REF, { kind: "finding" }, { children: "acme_prod_2026" });
    const label = out.match(/\\label\{(finding:[^}]*)\}/)?.[1];
    const target = ref.match(/\\ref\{(finding:[^}]*)\}/)?.[1];
    expect(label).toBeDefined();
    expect(target).toBe(label);
  });
});

describe("finding sub-components", () => {
  it.each([
    ["impact.component.yaml", "Impact"],
    ["evidence.component.yaml", "Evidence"],
    ["recommendation.component.yaml", "Recommendation"],
  ])("%s renders its label and children", async (file, label) => {
    const out = await renderComponent(at(file), {}, { children: "the body" });
    expect(out).toContain(label);
    expect(out).toContain("the body");
  });

  // Containment is NOT enforced by the engine, so each part must render sanely
  // on its own rather than assuming a :::finding wrapper.
  it("renders standalone without a parent finding", async () => {
    const out = await renderComponent(at("impact.component.yaml"), {}, { children: "x" });
    expect(out.trim().length).toBeGreaterThan(0);
    expect(out).not.toContain("undefined");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/druckform && npx vitest run tests/unit/finding-component.test.ts --coverage=false`
Expected: FAIL — the component files do not exist.

- [ ] **Step 3: Create `finding.ts`**

Create `packages/druckform/templates/consulting/components/finding.ts`:

```ts
import { type Component, type RenderCtx, escapeTeX, sanitizeLabelId } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({
  severity: z.enum(["critical", "high", "medium", "low"]),
  /** Author-assigned identity, e.g. "F-01". Deliberately not a LaTeX counter:
   *  consulting ids are quoted in tickets and must not renumber when a finding
   *  is inserted. Referenced as :ref[F-01]{kind=finding}. */
  id: z.string(),
  title: z.string(),
});

export const meta = {
  name: "finding",
  description: "An audit finding: severity, id, title, and nested impact/evidence/recommendation.",
  acceptsChildren: true,
  example:
    ':::finding{severity="high" id="F-01" title="Secrets recoverable from CI logs"}\n' +
    ":::impact\nCredentials are recoverable by anyone with read access.\n:::\n:::",
  // Declared explicitly: the token name is resolved from a map at render time,
  // so doctor's literal ctx.token("…") scan cannot derive them.
  requiredTokens: ["severityCritical", "severityHigh", "severityMedium", "severityLow"],
};

const SEVERITY_TOKEN = {
  critical: "severityCritical",
  high: "severityHigh",
  medium: "severityMedium",
  low: "severityLow",
} as const;

const SEVERITY_LABEL = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
} as const;

export const render: Component<typeof schema> = (params, children, ctx: RenderCtx) => {
  const colour = ctx.token(SEVERITY_TOKEN[params.severity]);
  const id = escapeTeX(params.id);
  const title = escapeTeX(params.title);
  const severity = SEVERITY_LABEL[params.severity];
  // Sanitised through the same helper ref uses, so :ref[...]{kind=finding}
  // resolves to a byte-identical label argument. See sdk/tex.ts.
  const label = sanitizeLabelId(params.id);
  return [
    "\\par\\vspace{0.8em}",
    `{${colour}\\rule{\\linewidth}{1.2pt}}\\par`,
    `\\noindent{${colour}\\bfseries ${id}\\quad ${severity}}\\quad{\\bfseries ${title}}\\par`,
    `\\label{finding:${label}}`,
    // \protect because this is written verbatim into the .fnd auxiliary file
    // and re-read later; \findingentry is defined by findings-summary.
    `\\addcontentsline{fnd}{finding}{\\protect\\findingentry{${id}}{${severity}}{${title}}}`,
    "\\smallskip",
    children,
    "\\par\\vspace{0.8em}",
  ].join("\n");
};
```

- [ ] **Step 4: Create the three sub-components**

All three share one `preamble` string. It is **byte-identical** in each file on purpose: the composer deduplicates preambles with an exact-string `Set`, so identical text collapses to one definition. (Near-identical text would not — that is why `metadata`'s `booktabs` line is emitted twice today.)

Create `packages/druckform/templates/consulting/components/impact.component.yaml`:

```yaml
name: impact
description: "The consequence of a finding. Belongs inside :::finding; renders standalone too."
form: container
params: {}
slots:
  children: true
preamble: |
  \newcommand{\druckfindingpart}[1]{\par\smallskip\noindent{\bfseries #1}\par\nobreak\noindent\ignorespaces}
emits: |
  \druckfindingpart{Impact}
  {{children}}
example: |
  :::impact
  Credentials are recoverable by anyone with read access.
  :::
```

Create `packages/druckform/templates/consulting/components/evidence.component.yaml` — identical but for the name, description, label and example:

```yaml
name: evidence
description: "What demonstrates a finding. Belongs inside :::finding; renders standalone too."
form: container
params: {}
slots:
  children: true
preamble: |
  \newcommand{\druckfindingpart}[1]{\par\smallskip\noindent{\bfseries #1}\par\nobreak\noindent\ignorespaces}
emits: |
  \druckfindingpart{Evidence}
  {{children}}
example: |
  :::evidence
  - `.github/workflows/deploy.yml:42` echoes `$DEPLOY_TOKEN`
  :::
```

Create `packages/druckform/templates/consulting/components/recommendation.component.yaml`:

```yaml
name: recommendation
description: "What to do about a finding. Belongs inside :::finding; renders standalone too."
form: container
params: {}
slots:
  children: true
preamble: |
  \newcommand{\druckfindingpart}[1]{\par\smallskip\noindent{\bfseries #1}\par\nobreak\noindent\ignorespaces}
emits: |
  \druckfindingpart{Recommendation}
  {{children}}
example: |
  :::recommendation
  Mask the variable in CI and rotate the token.
  :::
```

- [ ] **Step 5: Register all four**

Replace `components: {}` in `packages/druckform/templates/consulting/template.yaml` with:

```yaml
components:
  finding:
    source: components/finding.ts
  impact:
    source: components/impact.component.yaml
  evidence:
    source: components/evidence.component.yaml
  recommendation:
    source: components/recommendation.component.yaml
```

- [ ] **Step 6: Run to verify they pass**

Run: `cd packages/druckform && npx vitest run tests/unit/finding-component.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 7: Verify doctor and the token invariant**

```bash
pnpm -w build
node packages/druckform/dist/cli.js doctor --template consulting --json   # expect ok: true
cd packages/druckform && npx vitest run tests/integration/bundled-template-tokens.test.ts --coverage=false
```

The invariant test is now meaningful: `finding` requires four tokens and `consulting` declares exactly those four.

- [ ] **Step 8: Full suite, lint, commit**

```bash
pnpm turbo test && pnpm lint
git add packages/druckform/templates/consulting packages/druckform/tests/unit/finding-component.test.ts
git commit -m "feat(core): finding component with severity, impact, evidence and recommendation"
```

---

### Task 4: `findings-summary` and the generated index

**Files:**
- Create: `packages/druckform/templates/consulting/components/findings-summary.component.yaml`
- Modify: `packages/druckform/templates/consulting/template.yaml`
- Test: `packages/druckform/tests/unit/findings-summary.test.ts` (create)

**Interfaces:**
- Consumes: `finding`'s `\addcontentsline{fnd}{finding}{\protect\findingentry{…}{…}{…}}` (Task 3).
- Produces: `\findingentry`, `\l@finding` and `\listoffindings`, defined in this component's preamble. Because the composer collects preambles from **every** component in a resolved template — not only those a document uses — these are always defined for any `consulting` document, including one that uses `finding` without a summary.

- [ ] **Step 1: Write the failing test**

Create `packages/druckform/tests/unit/findings-summary.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadComponent } from "../../src/component/loader.js";
import { renderComponent } from "../helpers/render-component.js";

const SRC = path.resolve(
  import.meta.dirname,
  "../../templates/consulting/components/findings-summary.component.yaml",
);

describe("findings-summary", () => {
  it("emits the list command", async () => {
    expect(await renderComponent(SRC)).toContain("\\listoffindings");
  });

  it("defines the machinery finding depends on", async () => {
    const def = await loadComponent(SRC, "");
    const preamble = def.preamble ?? "";
    // finding writes \protect\findingentry{...}; \@starttoc{fnd} reads entries
    // back through \l@finding. Both must exist or the index fails to compile.
    expect(preamble).toContain("\\findingentry");
    expect(preamble).toContain("\\l@finding");
    expect(preamble).toContain("\\listoffindings");
    // \@ names require the catcode change around them.
    expect(preamble).toContain("\\makeatletter");
    expect(preamble).toContain("\\makeatother");
  });

  it("adds no LaTeX package", async () => {
    const def = await loadComponent(SRC, "");
    expect(def.preamble ?? "").not.toContain("usepackage");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/druckform && npx vitest run tests/unit/findings-summary.test.ts --coverage=false`
Expected: FAIL — the file does not exist.

- [ ] **Step 3: Create the component**

Create `packages/druckform/templates/consulting/components/findings-summary.component.yaml`. The preamble is plain LaTeX internals — the same machinery behind `\listoffigures` — so this adds no package:

```yaml
name: findings-summary
description: "Generated index of every finding in the document, with page numbers."
form: leaf
params: {}
slots:
  children: false
# \@starttoc reads <jobname>.fnd, which `finding` fills via \addcontentsline.
# Tectonic reruns automatically when that file changes, so the page numbers
# resolve in a single `druck render` — the same way the table of contents does.
preamble: |
  \makeatletter
  \newcommand{\findingentry}[3]{\makebox[4.5em][l]{#1}\makebox[6em][l]{#2}#3}
  \newcommand{\l@finding}[2]{\par\noindent #1 \dotfill\ #2\par}
  \newcommand{\listoffindings}{\section*{Findings Summary}\@starttoc{fnd}}
  \makeatother
emits: |
  \listoffindings
example: |
  ::findings-summary
```

- [ ] **Step 4: Register it**

Add to `components:` in `packages/druckform/templates/consulting/template.yaml`:

```yaml
  findings-summary:
    source: components/findings-summary.component.yaml
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd packages/druckform && npx vitest run tests/unit/findings-summary.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 6: Prove the index end to end with a real render**

Unit tests cannot see LaTeX-level failures — that is how a `\upshape{{param}}` gluing bug reached a PDF during the previous plan. Render for real. This host has the full toolchain, so use `--engine local`; **do not** use `--engine docker`, which would run the container's older bundled CLI and prove nothing about your change.

```bash
pnpm -w build
mkdir -p /tmp/df-consulting && cat > /tmp/df-consulting/d.md <<'EOF'
---
template: consulting
title: Security Assessment
---

::findings-summary

::pagebreak

:::finding{severity="high" id="F-01" title="Secrets recoverable from CI logs"}
:::impact
Credentials are recoverable by anyone with read access.
:::
:::recommendation
Mask the variable and rotate the token.
:::
:::

::pagebreak

:::finding{severity="medium" id="F-02" title="No dependency pinning"}
:::evidence
- `package.json` uses floating ranges
:::
:::

See :ref[F-01]{kind=finding} for the credential issue.
EOF
printf '$schema: "style-v1"\ntokens: {}\n' > /tmp/df-consulting/s.yaml
node packages/druckform/dist/cli.js render --engine local --template consulting \
  --in /tmp/df-consulting/d.md --style /tmp/df-consulting/s.yaml \
  --out /tmp/df-consulting/o.pdf --json
pdftotext /tmp/df-consulting/o.pdf - | head -20
```

Expected: `"status": "ok"`, and page 1 lists **both** findings with page numbers. The cross-reference must render as a number, **not** `??`.

**Assert individual fields, not a joined row.** `\makebox` positions the columns, and `pdftotext` does not emit them in reading order — a real run produced `F-01`, `F-02`, then `High`, then the titles. So check for `F-01`, `High` and `Secrets recoverable from CI logs` separately; a single `"F-01 High Secrets…"` assertion will fail even when the PDF is correct.

If the index is empty, check that `\findingentry` is defined (the preamble reached the document) and that the `.fnd` write is `\protect`ed.

- [ ] **Step 7: Full suite, lint, commit**

```bash
pnpm turbo test && pnpm lint
node packages/druckform/dist/cli.js doctor --template consulting --json   # expect ok: true
git add packages/druckform/templates/consulting packages/druckform/tests/unit/findings-summary.test.ts
git commit -m "feat(core): generated findings index via a LaTeX auxiliary list"
```

---

### Task 5: `exec-summary` and `appendix`

**Files:**
- Create: `packages/druckform/templates/consulting/components/exec-summary.component.yaml`
- Create: `packages/druckform/templates/consulting/components/appendix.component.yaml`
- Modify: `packages/druckform/templates/consulting/template.yaml`
- Test: `packages/druckform/tests/unit/consulting-blocks.test.ts` (create)

**Interfaces:**
- Consumes: the `accent` colour token, which `base` already declares.
- Produces: `exec-summary` (container, optional `title` and `accent`), `appendix` (leaf, no params).

- [ ] **Step 1: Write the failing tests**

Create `packages/druckform/tests/unit/consulting-blocks.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const dir = path.resolve(import.meta.dirname, "../../templates/consulting/components");
const at = (f: string) => path.join(dir, f);

describe("exec-summary", () => {
  it("defaults its heading", async () => {
    const out = await renderComponent(at("exec-summary.component.yaml"), {}, {
      children: "The engagement found three issues.",
    });
    expect(out).toContain("Executive Summary");
    expect(out).toContain("The engagement found three issues.");
  });

  it("accepts a custom title and escapes it", async () => {
    const out = await renderComponent(at("exec-summary.component.yaml"), {
      title: "Summary & Scope",
    });
    expect(out).toContain("Summary \\& Scope");
  });

  // A colour macro immediately followed by a letter glues into one undefined
  // control word. This is the bug class that broke pullquote.
  it("terminates the colour macro before any letter", async () => {
    const out = await renderComponent(at("exec-summary.component.yaml"), {});
    expect(out).not.toMatch(/\\druckAccent[A-Za-z]/);
    expect(out).toContain("\\druckAccent\\rule");
  });
});

describe("appendix", () => {
  it("emits the appendix switch", async () => {
    expect(await renderComponent(at("appendix.component.yaml"))).toContain("\\appendix");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/druckform && npx vitest run tests/unit/consulting-blocks.test.ts --coverage=false`
Expected: FAIL — the files do not exist.

- [ ] **Step 3: Create the components**

Create `packages/druckform/templates/consulting/components/exec-summary.component.yaml`. Note the `{{{accent}}\rule…}` bracketing: the substitution yields `{\druckAccent\rule…}`, so the colour applies to the rule and the macro name is terminated by the following backslash.

```yaml
name: exec-summary
description: "Headed, full-width executive summary. Body prose, not a boxed aside."
form: container
params:
  title: { type: string, required: false, default: "Executive Summary" }
  accent: { type: token, required: false, default: accent }
slots:
  children: true
emits: |
  \par\vspace{0.5em}
  \noindent{{{accent}}\rule{\linewidth}{1.2pt}}\par
  \noindent{\Large\bfseries {{title}}}\par\smallskip
  \noindent\ignorespaces
  {{children}}
  \par\vspace{0.8em}
example: |
  :::exec-summary
  The engagement identified three issues, one of them high severity.
  :::
```

Create `packages/druckform/templates/consulting/components/appendix.component.yaml`:

```yaml
name: appendix
description: "Switch subsequent headings to lettered appendix sections."
form: leaf
params: {}
slots:
  children: false
emits: |
  \appendix
example: |
  ::appendix
```

- [ ] **Step 4: Register both**

Add to `components:` in `packages/druckform/templates/consulting/template.yaml`:

```yaml
  exec-summary:
    source: components/exec-summary.component.yaml
  appendix:
    source: components/appendix.component.yaml
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd packages/druckform && npx vitest run tests/unit/consulting-blocks.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 6: Full suite, lint, doctor, commit**

```bash
pnpm -w build && pnpm turbo test && pnpm lint
node packages/druckform/dist/cli.js doctor --template consulting --json   # expect ok: true
node packages/druckform/dist/cli.js components --template consulting --json \
  | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
             const n=d.components.map(c=>c.name);
             for (const w of ['finding','impact','evidence','recommendation','findings-summary','exec-summary','appendix'])
               if (!n.includes(w)) throw new Error('missing '+w);
             console.log('all seven registered');"
git add packages/druckform/templates/consulting packages/druckform/tests/unit/consulting-blocks.test.ts
git commit -m "feat(core): exec-summary and appendix components"
```

---

### Task 6: Exercise the family in the e2e suite

**Files:**
- Create: `tests/e2e/fixtures/consulting-document.md`
- Modify: `tests/e2e/in-container.sh`

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: permanent regression cover — the index is generated inside the image, and a dangling finding reference fails the suite.

- [ ] **Step 1: Create the fixture**

Create `tests/e2e/fixtures/consulting-document.md`. The id contains an underscore deliberately: that is the character that exposed the `figure`/`ref` label mismatch.

```markdown
---
template: consulting
title: E2E Consulting Assessment
---

:::exec-summary
Two findings, one high severity.
:::

::findings-summary

::pagebreak

:::finding{severity="high" id="F_01" title="Secrets recoverable from CI logs"}
:::impact
Credentials are recoverable by anyone with read access.
:::
:::evidence
- `deploy.yml` echoes the token
:::
:::recommendation
Mask the variable and rotate the token.
:::
:::

:::finding{severity="medium" id="F-02" title="No dependency pinning"}
:::evidence
Floating version ranges in the manifest.
:::
:::

Remediation for :ref[F_01]{kind=finding} is tracked separately.

::appendix

# Methodology

Interviews and a review of the deployment pipeline.
```

- [ ] **Step 2: Render it in the harness**

In `tests/e2e/in-container.sh`, after the existing custom-template render section, add:

```bash
banner "Consulting family renders, and generates its findings index"
druck render --template consulting --in consulting-document.md --style style.yaml \
  --assets assets --out "$WORK/out/consulting.pdf" --json \
  > "$OUT/render-consulting.json" 2> "$OUT/render-consulting.stderr" \
  || { cat "$OUT/render-consulting.stderr" >&2; cat "$OUT/render-consulting.json" >&2; \
       fail "consulting render failed"; }
assert_json "consulting render contract" "$OUT/render-consulting.json" \
  "d.schemaVersion === '1' && d.status === 'ok'"
cp "$WORK/out/consulting.pdf" "$OUT/consulting.pdf"
# Fields are asserted individually, never as one joined row: \makebox positions
# the index columns and pdftotext does not emit them in reading order.
assert_pdf "$OUT/consulting.pdf" 2 \
  "Findings Summary" \
  "F_01" "F-02" \
  "High" "Medium" \
  "Secrets recoverable from CI logs" "No dependency pinning" \
  "Executive Summary" "Impact" "Evidence" "Recommendation" \
  "Methodology" \
  -- "${UNIVERSAL_FORBIDDEN[@]}"
```

`UNIVERSAL_FORBIDDEN` already contains `"??"`, so a finding cross-reference that fails to resolve fails the suite — which is exactly the mechanism this family depends on.

- [ ] **Step 3: Run the full e2e suite**

Run: `./tests/e2e/run-e2e.sh`
Expected: `=== E2E passed ===`, with the new consulting banner and its assertions among the `ok` lines.

This takes roughly ten minutes and rebuilds the image. If an assertion fails, do **not** weaken it — an empty index or a `??` means the mechanism is genuinely broken in the container.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/fixtures/consulting-document.md tests/e2e/in-container.sh
git commit -m "test(e2e): render the consulting family and assert its findings index"
```

---

### Task 7: Documentation, gallery and changeset

**Files:**
- Modify: `docs/authoring.md`
- Modify: `docs/extending-druckform.md`
- Modify: `docs/examples-gallery.md`
- Modify: `claude-plugin/skills/druckform/SKILL.md`
- Modify: `claude-plugin/.claude-plugin/plugin.json`
- Create: `.changeset/consulting-family.md`

**Interfaces:**
- Consumes: everything. Produces: no code.

- [ ] **Step 1: Document the family in `docs/authoring.md`**

Add a `consulting` row to the templates table, and a section per component with its syntax and parameter table, following the format the existing `infobox` and `figure` entries use. Copy each snippet **verbatim from the component's own `example` field** — `tests/integration/examples-gallery-drift.test.ts` asserts the gallery matches, and the same discipline keeps `authoring.md` honest.

Document explicitly: findings keep the id the author assigns and are never renumbered; `::findings-summary` may be placed before or after the findings; the sub-components belong inside `:::finding` but are not enforced to be; and the index follows LaTeX's auxiliary-file contract, so a `.fnd` left over in a user's own build directory can show stale titles until the next run — the same property the table of contents has.

- [ ] **Step 2: Update `docs/extending-druckform.md`**

Add `finding` to the cross-reference discussion, documenting `:ref[F-01]{kind=finding}` and stating that `kind` is an enum each family extends. Add a line to the template list describing `consulting`.

- [ ] **Step 3: Extend the examples gallery**

Add a section per new component to `docs/examples-gallery.md`, each snippet copied verbatim from the component's `example`. Add the new headings to the `HEADINGS` map in `packages/druckform/tests/integration/examples-gallery-drift.test.ts` so the drift test covers them; the test fails if a snippet and its `example` diverge.

- [ ] **Step 4: Update the skill and bump the plugin**

In `claude-plugin/skills/druckform/SKILL.md`, document the `consulting` template and the finding structure, with the nested sub-component shape shown in full — that shape is what an agent needs to get right. Bump `version` in `claude-plugin/.claude-plugin/plugin.json` to `0.1.4`.

- [ ] **Step 5: Write the changeset**

Create `.changeset/consulting-family.md`:

```markdown
---
"@druckform/core": minor
---

Adds the `consulting` template for client-facing reports and assessments: `finding` (severity, id, title) with nested `impact` / `evidence` / `recommendation`, plus `exec-summary` and `appendix`.

`::findings-summary` generates an index of every finding in the document, with page numbers, from the findings themselves — so the summary cannot drift from the detail. It is built on LaTeX's own list machinery and adds no new package.

`ref` gains an optional `kind` (`fig` | `finding`, default `fig`), so `:ref[F-01]{kind=finding}` cross-references a finding. Existing `:ref[...]` calls are unchanged.
```

- [ ] **Step 6: Full verification**

```bash
pnpm -w build
pnpm turbo test
pnpm lint
for t in base report examples consulting; do
  node packages/druckform/dist/cli.js doctor --template "$t" --json
done
```

Expected: build clean, all tests pass, biome clean, four `"ok": true`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: consulting family, findings index and ref kinds; changeset"
```

---

## Notes for the executor

- **`consulting/template.yaml` is edited by four tasks** (2, 3, 4, 5). Re-read it each time rather than working from memory.
- **Task 1 must precede Task 3** — `finding`'s label-agreement test references `ref` with `kind: "finding"`.
- **The three sub-component preambles must stay byte-identical.** The composer deduplicates by exact string; near-identical text is emitted twice.
- **The only proof the index works is a real render.** Unit tests assert emitted strings, which cannot catch a LaTeX-level failure — that is precisely how a component-gluing bug reached a PDF in the previous plan.
- If a coverage threshold complains about a new file, check whether it belongs under the `templates/**` exclude already configured in `vitest.config.ts` — bundled template components are loaded through an esbuild temp file, so v8 cannot attribute coverage to them.
