# Page foundation & shared prose library

**Date:** 2026-08-17
**Status:** Design approved, awaiting implementation plan

## Context

The druckform *machinery* is finished — the extensibility and authoring-DX roadmaps are both complete, giving us auto-discovery, `doctor`, `preview-component`, scaffolding, the three directive forms, template-bundled assets and GFM block handlers. What is missing is anything to put in it.

The package today ships:

- **One real content component.** `infobox` is the only general-purpose component. `callout` exists but is a near-duplicate of it, declared separately in both `report` and `examples`. The remaining seven components are GFM block handlers, plus the document shell.
- **No page design at all.** `base`'s document shell emits no geometry, no title block, no table of contents. Nothing in the package makes a document look typeset rather than merely converted.

Six defects surfaced while investigating. Each was found by running a claim rather than reading code, and each is fixed as part of this work because this design would otherwise make it worse — two of them (5 and 6) block the design outright:

1. **Bundled templates silently produce US Letter.** `\documentclass{article}` defaults to `letterpaper` and nothing overrides it. Confirmed by `pdfinfo`: a `report` render is `612 x 792 pts (letter)`. A German-named tool aimed at EU users has been emitting US paper, discoverable only at a printer.
2. **The bundled `report` template cannot render with a minimal style.** `base` declares only an `accent` colour, but `callout` declares `requiredTokens: ["accent", "warning"]`, so any style file that does not happen to define `warning` fails token coverage: `Missing required style token 'warning' (needed by component 'callout')`. Confirmed by linting `report` against a style containing only `accent`. Nothing tells an author that `warning` is required — the bundled example style defines it by convention, so the trap only springs on a hand-written style.
3. **The `danger` callout variant is invisible.** `callout.ts` maps `variant === "warn"` to the warning token and *everything else* to `accent`, so `:::callout{variant="danger"}` renders identically to `info`. The variant is accepted and silently does nothing.
4. **The Docker image cannot render offline.** `docker/tectonic-prewarm.tex` caches only `fontspec`, `xcolor`, `graphicx` and `geometry`, but bundled components already require `hyperref`, `ulem`, `tabularx`, `booktabs`, `array` and `adjustbox`. Confirmed: `docker run --network none … render` fails with `LaTeX compilation failed`. Every render therefore depends on network access to Tectonic's bundle — including renders inside an agent sandbox, which the Dockerfile explicitly anticipates.

This design covers the foundation that fixes all six and gives the package a usable component vocabulary. Four document families (consulting, technical documentation, correspondence, internal working docs) are the eventual target; they are explicitly **out of scope here** and get their own specs once this layer is real.

## Scope

**In:** page setup (paper size, margins, opt-in cover/title block and TOC), a shared prose component library, the prewarm fix.

**Out:** the four document families; running headers/footers; anything needing a LaTeX package not already in use.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Paper size lives in | Style tokens (`tokens.page`) | Paper size is brand/region-level, not per-document. A client's style file sets it once; `--style` already covers one-offs. Keeps size and margins together. |
| Default paper | **A4** | Fixes the latent Letter bug outright. Pre-1.0, `main` unpushed. |
| Admonition shape | Friendly names over one implementation | `:::warning` matches the MkDocs/Docusaurus convention Claude already knows, so it gets it right without reading docs. `extends:` + `defaults:` gives the names with no duplicated code — once cross-name `extends` actually works (defect 5). |
| Layering | Everything into `base` | Uses the `extends` chain as designed; makes the obvious template choice the right one. A `prose` intermediate would make `base` a template nobody selects. |
| Headers/footers | Deferred | Needs `fancyhdr`; `article` already numbers pages. Letterhead is a correspondence-family concern. |

A deliberate property of this phase: **it adds zero new LaTeX packages.** `geometry` is already prewarmed, and the component library stays within the engine core plus `tabularx`/`booktabs`, which `block:table` already pulls. Reaching for `tcolorbox` or similar would deepen the offline hole this design is meant to close.

## 1. Page tokens

New token group, parallel to `colors`/`fonts`/`spacing`:

```yaml
tokens:
  page:
    size: a4            # a4 | letter — default a4
    margin: "2.5cm"     # uniform; or any subset of:
    # top: "3cm"
    # bottom: "2.5cm"
    # left: "2.5cm"
    # right: "2.5cm"
```

`size` is an enum, not free text — a typo must be a validation error, not a silent fallback. Granular sides override `margin` when both are present.

### Touch points

Adding a token group is not a one-file change. All five of these are required:

- **`sdk/types.ts`** — `PageSpec` type; `StyleTokens.page` and `StyleConfig.tokens.page`.
- **`style/validate.ts`** — `STYLE_SCHEMA` gains `page` (with `size` as an `enum`). Then regenerate the editor-facing copy with `pnpm --filter @druckform/core schema:sync`; `style-schema-sync.test.ts` fails until you do.
- **`style/merge.ts`** — **easy to miss.** `mergeStyle` enumerates `colors`/`fonts`/`spacing` explicitly and drops every other key, so `page` tokens would be silently discarded when a template's style merges with `--style`. Needs an explicit merge plus a regression test.
- **`style/compiler.ts`** — emit `\geometry{…}` from the page tokens.
- **`style/tokens.ts`** — **no change, deliberately.** `checkTokenCoverage` builds its `available` set from colors/spacing/fonts because those become `\druckX` macros components can reference. Page tokens are not component-referenceable, so they must *not* be added; doing so would let a component declare a bogus dependency on `size`.

### The geometry option-clash trap

`geometry` raises `Option clash for package geometry` if loaded twice with options. Custom document shells already load it that way (`tests/e2e/fixtures/templates/acme/components/document.ts` does). So:

- **Engine core** (`latex/composer.ts` `ENGINE_CORE`) gains a bare `\usepackage{geometry}`.
- **Style preamble** emits `\geometry{a4paper,margin=2.5cm}` — options applied after the fact, no clash.
- **Custom shells must switch** from `\usepackage[…]{geometry}` to `\geometry{…}`.

Because the failure mode is an opaque LaTeX error, `druck doctor` gains a check: a document shell emitting `\usepackage[…]{geometry}` produces a named finding pointing at `\geometry{…}`. The `acme` e2e fixture is updated accordingly and becomes the regression case.

## 2. Cover, title block and TOC

All opt-in, driven by a `frontmatter:` spec on `base` (which currently declares none):

| Field | Effect |
|---|---|
| `title` | Renders a title block. Absent ⇒ no title block at all. |
| `subtitle`, `author`, `date` | Included in the block when present. |
| `cover` | `"true"` ⇒ title block on its own page followed by `\clearpage`; otherwise inline at the top. |
| `toc` | `"true"` ⇒ `\tableofcontents` after the title block. |

Opt-in is the point: a one-page memo must not sprout a table of contents.

**Frontmatter values are strings.** `parse/parser.ts` coerces with `String(v)`, so `toc: true` arrives as `"true"`. The shell compares against the string; the spec's `type` is `string`. Do not add a boolean type for this.

**TOC needs no engine change.** `\tableofcontents` requires a second LaTeX pass to resolve page numbers, and `runTectonic` invokes tectonic once with no `--reruns` flag. Verified empirically that Tectonic's automatic rerun handles it: a two-page test document produced a fully populated TOC with correct page numbers and a resolved `\ref`. Cross-references are therefore also safe.

## 3. Shared prose library

`callout` moves from `report` into `base` as the single admonition implementation; the named variants are thin registrations:

```yaml
# base/template.yaml
callout: { source: components/callout.ts }
note:    { extends: base.callout, defaults: { variant: info } }
tip:     { extends: base.callout, defaults: { variant: tip } }
warning: { extends: base.callout, defaults: { variant: warn } }
danger:  { extends: base.callout, defaults: { variant: danger } }
infobox: { extends: base.callout, defaults: { variant: info } }   # back-compat alias
```

### Two engine prerequisites (defects 5 and 6)

The registrations above do not work **at all** against the engine as it stands. Both were found by running them:

5. **`extends:` is same-name only.** `resolver.ts` handles `override.extends` by looking up `mergedComponents.get(compName)` — the entry's *key* — and never parses the `extends` value at all. So `note: { extends: base.callout }` fails with `Error: Component note extends unknown parent`, and, worse, `extends: total.nonsense` under key `infobox` silently succeeds because the value is ignored. `docs/extending-druckform.md` §6.3 documents `extends: parent.comp` as referencing a named parent, so the documentation already describes the intended behaviour. Fix: parse `<template>.<component>`, resolve the component after the dot, and error on an unknown target. The only two component-level `extends` in the repo are both same-name (`infobox: extends base.infobox`), so this is backwards-compatible.

6. **`druck components` reports `meta.name`, not the registration key.** `components.ts` maps over `Object.values(resolved.components)` and emits `def.meta.name`. Aliases therefore all appear as `callout`, so `list_components` would advertise five identical entries and Claude could never discover that `:::note` exists. The registration key is the name authors type, so it is the name discovery must report. Fix: iterate `Object.entries` and emit the key. (`lint` already uses the key correctly in its findings.)

Registering aliases with `source:` + `defaults:` instead is not a workaround: it renders correctly but hits defect 6 just the same, and duplicates the source path across five entries.

### Three changes `callout` needs first

Beyond the engine work, `callout` itself is not ready:

1. **`tip` is not a variant.** The enum is `["info", "warn", "danger"]`. It gains `tip`.
2. **The colour mapping is a two-branch conditional** (`warn` → warning token, everything else → accent), which is why `danger` is currently invisible. It becomes a full variant → token map: `info` → `accent`, `tip` → `accent`, `warn` → `warning`, `danger` → `danger`.
3. **`callout` must absorb `infobox`'s parameter surface, or the alias silently corrupts existing documents.** `infobox` takes a token-typed `accent` param; `callout` takes `variant`. Zod objects strip unknown keys rather than rejecting them, so `:::infobox{accent="warning"}` aliased onto `callout` would keep rendering — in the wrong colour, with no error. The docs use `accent=` in four places and `report` sets `defaults: { accent: warning }`. So `callout` gains an **optional `accent` token param that overrides the variant's colour when supplied**, making it a strict superset of both components. `infobox` then aliases losslessly.

Full library:

| Component | Form | Implementation | Notes |
|---|---|---|---|
| `callout` | container | TS | variant → colour token; existing implementation, relocated and extended |
| `note` `tip` `warning` `danger` `infobox` | container | — | `extends` + `defaults`, no code |
| `figure` | container | TS | `figure` env + `\caption` + optional `\label` |
| `pagebreak` | leaf | YAML | `\clearpage`; replaces the commonest use of the `raw` escape hatch |
| `deflist` | leaf | TS | `description` environment from `term=definition` pairs; free Markdown children would break it (`description` accepts only `\item`) |
| `pullquote` | container | YAML | styled `quote` |
| `metadata` | leaf | TS | two-column key/value block from `key=value` pairs (`booktabs`) |
| `badge` | inline | YAML | coloured inline label |
| `footnote` | inline | YAML | `\footnote{}` |
| `ref` | inline | YAML | `\ref{}` to a `figure` label |

### Templates must supply defaults for every token they require

Adding a `danger` colour would otherwise break every existing style file, exactly as `warning` breaks minimal styles today (defect 2). The rule, and the fix for that defect:

**A bundled template's `style.tokens` must define a default for every token its components declare as required.** `base` therefore declares `accent`, `warning` and `danger` colours, not just `accent`. Template style merges *underneath* `--style`, so users still override freely, but a style file that omits a colour gets a sensible one instead of a missing-token error.

A test asserts this invariant directly — for each bundled template, `extractRequiredTokens` must be satisfied by that template's own merged style with no external style supplied. That turns "we remembered" into a check, and catches the next component that adds a token.

Declarative YAML unless the component needs logic — YAML components need no esbuild pass and work in a read-only templates directory, which TS components cannot (they bundle to a temp file beside their source).

Every component ships `meta.example`, so `preview-component` and `list_components` work without extra effort, and `docs/examples-gallery.md` plus the `examples` template are extended to cover them. `examples` is rebased on the new shell so it does not render worse than `base`.

## 4. Prewarm and offline rendering

`docker/tectonic-prewarm.tex` is extended to load every package the bundled components use, so the image's Tectonic cache is complete and renders work with no network. This belongs in this phase because bundling more components is what makes the gap worse.

Guard it in the e2e suite: a render under `docker run --network none` must succeed. Without that assertion the cache silently rots the next time a component adds a package.

## 5. Migration and compatibility

- **Breaking (visual):** every existing document re-renders A4 instead of Letter. Changeset flags it explicitly and names `tokens.page.size: letter` as the one-line restoration.
- **Breaking (custom shells):** a shell loading `\usepackage[…]{geometry}` now clashes. `doctor` reports it with the fix.
- **Not breaking:** `report` inherits `callout` from `base` rather than declaring it; `examples` keeps its own override; `infobox` continues to work as an alias, `accent=` included, because `callout` absorbs its parameter surface.
- **Fixes, not breaks:** styles that omit `warning` start working instead of erroring, and `variant="danger"` starts rendering as danger rather than as info. Both are behaviour changes to previously broken or unusable cases, and the changeset says so.

## 6. Testing

- Unit tests per component via the existing `tests/helpers/render-component.ts`.
- Each `callout` variant maps to a *distinct* token — the test that would have caught `danger` rendering as `info`.
- `:::infobox{accent="warning"}` renders identically before and after the alias, guarding the silent-corruption path.
- Every bundled template satisfies its own required tokens with no external style (the invariant above).
- `mergeStyle` regression test for `page` token survival — the silent-drop failure mode above.
- Style validation tests: `size` enum rejects a typo; granular sides override `margin`.
- `style-schema-sync.test.ts` already guards the two schema copies.
- `doctor` test for the geometry clash finding.
- Every bundled template stays `doctor`-clean.
- **e2e additions** (`tests/e2e/`): assert rendered page size is A4 via `pdfinfo` — currently only page *count* is checked, so paper size would regress unnoticed; exercise the new components in the fixture corpus; add the offline (`--network none`) render check.

## Out of scope — later phases

Each gets its own spec, informed by what this layer turns out to need:

- **Consulting:** cover variants, exec summary, findings with severity, recommendations, appendices.
- **Technical documentation:** cross-reference vocabulary, parameter tables, glossary.
- **Correspondence:** letterhead (`fancyhdr` lands here), address blocks, subject lines, signatures, line-item totals.
- **Internal:** attendees, decision/ADR blocks, action tables with owners.
