# Authoring DX — Design

Make creating **templates** and **components** (human- and agent-assisted) fast, safe, and low-knowledge. druckform today is strong at *consuming* templates but has almost no tooling for *authoring* them: the authoring contract is tribal knowledge and there is no fast author→verify loop.

---

## 1. Problem

Two gaps, both felt directly while building the extensibility roadmap:

**A. The authoring contract is tribal knowledge.** To write a component you must just know: export `schema`/`meta`/`render`; the 4th render arg is `BlockElement | DocumentLayout`; `block:` is reserved; a `document` override must emit the `DRUCKFORM_BODY` marker and must *not* emit the engine-core packages; `escapeTeX` user strings but `raw()` children/tokens; declare token params with `tokenRef()`; then register the component in `template.yaml`. The `druckform` skill teaches *using* the MCP tools, not authoring.

**B. No author→verify loop.** To see a component render you author it → register it → write a doc that uses it → `druck render` (tectonic, seconds). Nothing renders one component with sample params in isolation; the loop is long and full of unrelated moving parts.

Supporting pain (evidence from this codebase):
- The component loader bundles each `.ts` via esbuild into a temp `.mjs` and imports that. This caused a filename-collision race (already patched with a counter), **requires building `druckform` before a TS component that imports package exports can be tested**, and makes **v8 coverage attribute 0%** to component source (worked around by excluding `templates/**` from coverage).
- Creating a component is two steps (write file + edit `template.yaml`); the second is easy to forget.
- Authoring mistakes (missing export, declarative slot typo `{{titel}}`, undeclared token, missing body marker, unescaped user input) surface late or silently.

## 2. Approach & roadmap

Five independently-shippable phases. Phase 1 is the structural foundation; later phases build the loop and the agent surface on top.

| Phase | Theme | Delivers |
|-------|-------|----------|
| **1** | Loader & test ergonomics | in-process TS component loader (no temp file, no pre-build, instrumentable); `renderComponent()` test helper; restore coverage |
| **2** | Authoring validation | `druck doctor` — validate the component/template authoring contract with JSON findings |
| **3** | Preview loop | `druck preview-component` (render one component with sample params, fast) + `--watch`; MCP `preview_component` |
| **4** | Scaffolding & auto-discovery | `druck new component\|template` generators; auto-discover components from `components/` |
| **5** | Agent surface | authoring skill; MCP authoring tools (`scaffold_component`, `validate_component`); examples gallery; richer `list_components` |

Dependencies: P1 underpins P3 (clean render path), P4 (testable scaffolds), and the coverage story for all. P5 exposes P2/P3/P4 to agents and ties them into a skill.

## 3. Phase designs (decisions the plans implement)

### Phase 1 — Loader & test ergonomics

> **Outcome (2026-06-29): partially descoped.** The loader swap was attempted with `tsx` and reverted — `tsImport` can't bootstrap inside the tsup-bundled CLI on Node 22 (worker-thread hook timing). Since the race was already fixed (extensibility Phase 1) and coverage is handled by the `templates/**` exclude, only the **`renderComponent` test helper shipped**. Revisiting the swap requires Node ≥24 (`module.registerHooks`). The text below is the original design.

- **Replace** the esbuild→temp-`.mjs`→`import()` loader (`src/component/typescript.ts`) with an **in-process runtime TS loader** via `tsx`'s programmatic `tsImport()` (or `jiti`): no temp file written beside the source, no race, no pre-build needed for tests, and the module is loaded through a path v8/vitest can instrument.
- It must work both at runtime in the bundled `dist/cli.js` (production loads user `.ts` components from `DRUCKFORM_TEMPLATES_DIR`) and under vitest. Verify the chosen loader bundles under tsup.
- Add a **test helper** `renderComponent(def, params, opts?)` (and/or a `loadAndRender` helper) exported from a test-utils module, so component TDD is one line and the standard `ctx` (token/style/frontmatter) is constructed for you.
- **Restore coverage:** once components are instrumentable, drop the `templates/**` coverage exclude added as a CI workaround (keep `tests/**` excluded). Re-confirm ≥80% lines; if a genuinely-untested component path appears, add the test rather than re-excluding.
- **Risk:** a new runtime dependency must bundle cleanly and not pull tectonic-incompatible native bits. If `tsImport` can't be bundled, fall back to keeping esbuild for production but routing test-time loads through vitest's importer.

### Phase 2 — Authoring validation (`druck doctor`)
- New command `druck doctor --template <name> [--json]` that resolves the template and validates the **authoring contract**, emitting `Finding[]` (reuse the existing type; JSON via `--json`, like `lint`).
- **Component checks:** required exports present (`schema`, `meta`, `render`); `meta.name`/`acceptsChildren` present; declarative `emits` slots all resolve to a declared param / `{{children}}` / `{{fm.*}}` (typo guard); token drift — a `tokenRef`/`ctx.token` use not reflected in `requiredTokens` (warn) and vice-versa; a `document`-named override that omits the `DRUCKFORM_BODY` marker (error); a heuristic warning for interpolating an un-escaped string param into `emits`.
- **Template checks:** `extends` target exists; reserved `block:`/`document` rules (today only enforced at load — surface as findings); `style`/`frontmatter` schema shapes are well-formed.
- Complements `druck lint` (which validates a *document*); `doctor` validates the *template/components*.

### Phase 3 — Preview loop
- `druck preview-component --template <t> --name <n> [--params <json>] [--children <md>] [--style <file>] --out <pdf> [--json] [--watch]`: wrap the named component in a minimal document (using `meta.example` as the default params/children when omitted), render via the existing compose→tectonic path, and report the PDF path or compile findings (source-mapped). `--watch` re-renders on file change.
- Targets `:::`-invoked components. Block-level (`block:*`) behavior is previewed by rendering a small Markdown snippet through the normal pipeline (that is already `druck render`), so `preview-component` focuses on the param/children components authors most often write.
- MCP `preview_component({ template, name, params?, children? })` → `{ download_url }` (reuses the Phase-4A inline render + download token machinery).

### Phase 4 — Scaffolding & auto-discovery
- `druck new component --template <t> --name <n> --kind ts|yaml [--accepts-children]` emits a correct boilerplate component (schema/meta/render or YAML `params/slots/emits`), a **starter test** using the Phase-1 `renderComponent` helper, and wires it up.
- `druck new template --name <n> [--extends base]` emits a `template.yaml` + `components/` dir.
- **Auto-discovery:** the resolver/loader auto-registers any `components/*.{ts,component.yaml}` under a template dir by its `meta.name` (TS) / `name` (YAML); explicit `template.yaml` entries still win (for `defaults`/partial overrides/tombstones). Reserved-namespace validation still applies. This removes the manual register step (the thing humans and agents forget).

### Phase 5 — Agent surface
- An **authoring skill** (built with `superpowers:writing-skills`) encoding the contract + the author→doctor→preview loop + the canonical patterns.
- **MCP authoring tools** writing into `DRUCKFORM_TEMPLATES_DIR`: `scaffold_component`, `validate_component` (wraps `doctor`), reusing `preview_component` (P3) — so a remote agent can author and verify in a loop without reading source.
- **Examples gallery:** a curated set of canonical components (styled table, callout, titled document shell) under `templates/examples/` + a docs page, for pattern-matching.
- **Richer `list_components`:** add the component `source`, an `acceptsElement` flag, and a contract-version marker so agents know the exact shape they must produce.

## 4. Out of scope
- A visual/GUI builder.
- Hot-reload of components inside a long-running MCP server (preview re-render is per-invocation).
- Overrideable inline marks / new `block:*` kinds (covered by the GFM/extensibility specs, not here).

## 5. Cross-cutting risks
- **Loader swap (P1)** is the structural keystone; if the runtime TS loader can't be bundled, the fallback (test-time-only routing) still unlocks coverage/no-build tests but keeps esbuild in production.
- **Auto-discovery (P4)** changes resolution behavior; explicit entries must always win and reserved-namespace rules must still fire — covered by tests.
- **Agent tools writing to disk (P5)** widen the MCP surface beyond render-only; scope writes to `DRUCKFORM_TEMPLATES_DIR` and validate names.

## 6. Documentation
Every phase updates `docs/extending-druckform.md`, and P5 adds the authoring skill + gallery. Update `README.md` and the `druckform` skill where commands/tools change.
