# Authoring contract honesty + docs (B-group) — design

**Date:** 2026-07-01
**Author:** torben (with Claude)
**Status:** Approved design, awaiting implementation plan
**Relates to:** [[druckform-theme-feedback-followups]] (B1–B8). Follows Part A (template-bundled assets, merged). Builds on [[druckform-authoring-dx-roadmap]] (complete).

## Problem

Building the `gradion` corporate theme surfaced eight gaps (B1–B8) where the documented/authoring contract diverges from reality or is missing, plus the fact that Part A's new `ctx.asset`/`ctx.templateDir` API is currently undocumented. Each cost real authoring time. This spec closes the code gaps that make the contract *false* and rewrites the docs/skill so they are *true and complete*.

## Goal

Make the authoring surface honest: fix the code where the docs describe behavior that doesn't exist, then update the `druckform-authoring` skill and `docs/extending-druckform.md` to match the real, final surface (including Part A).

## Non-goals (YAGNI)

- `\setsansfont` / a `fonts.sans` token — documented as absent, not added.
- Automatic scanning of declarative `preamble`/`emits` for hardcoded `druck<Name>` token references — replaced by opt-in `requiredTokens`.
- Making arbitrary third-party npm deps resolvable in external templates — only `zod` and `druckform` are blessed.

## Design

### Part 1 — Code fixes

#### B1. Re-export `z` from `druckform`
Add `export { z } from "zod";` to `src/index.ts`. Components may then `import { z } from "druckform"` (which the skill already documents). The existing `import { z } from "zod"` continues to work. `zod` is already a runtime dependency of the package.

#### B2. Make `zod` and `druckform` resolvable from external-template TS components
Today `component/typescript.ts` bundles with `packages: "external"`, so bare `import`s of `zod`/`druckform` remain external in the emitted temp `.mjs`. Node then resolves them upward from the (possibly external) template directory and fails — the onboarding blocker.

Fix: in the loader, resolve the absolute paths of `zod` and `druckform` against *this* package's install location (using `createRequire(import.meta.url)` / `import.meta.resolve`), and configure esbuild to **alias and inline** those two modules (via `alias` and/or `nodePaths` pointing at the druckform package's `node_modules`), rather than leaving them external. All other bare imports stay external (unchanged). The compiled temp module becomes self-contained for `zod`+`druckform`, so it loads from any directory with no symlink.

- In-repo (bundled) templates: behavior is unchanged in effect (they resolved before); the two deps are now inlined instead of external. Larger temp files; duplication of pure SDK helpers is harmless (no shared singleton state).
- Because B1 re-exports `z`, a component that imports everything from `druckform` needs only `druckform` resolvable — which this fix guarantees.

#### B4. Let style `fonts` carry fontspec options
Widen the font token type:

```ts
type FontSpec = string | { name: string; options?: string };
fonts: { main?: FontSpec; mono?: FontSpec };
```

`compileStyle` emits, per font:
- string form → `\setmainfont{<name>}` (unchanged),
- object form → `\setmainfont{<name>}[<options>]` (e.g. `\setmainfont{Noto Sans}[AutoFakeBold=2.2]`).

Same for `\setmonofont`. This covers the variable-font `\bfseries`-renders-Regular failure without enumerating fontspec keys. `StyleTokens.fonts`, `extractTokens`, and `compileStyle` are updated. `checkTokenCoverage` keys on `fonts.main`/`fonts.mono` truthiness, which holds for both forms. `mergeStyle` already spreads `fonts` field-by-field (`{ ...base.fonts, ...over.fonts }`), so an override of `main` replaces the whole value (string or object) as a unit — no `mergeStyle` change needed.

#### B8 (code). Declarative `requiredTokens`
`*.component.yaml` gains an optional `requiredTokens: string[]`. The declarative loader merges it into `meta.requiredTokens` and the `ComponentDef.requiredTokens` set — the same channel TS components use via `meta.requiredTokens`. This lets a declarative component that hardcodes `druck<Name>` in `preamble`/`emits` declare its token dependency so `checkTokenCoverage` catches a style that omits it.

### Part 2 — Docs & skill

Update `claude-plugin/skills/druckform-authoring/SKILL.md` and `docs/extending-druckform.md` (and `docs/authoring.md` where it overlaps) to reflect the real, final surface:

- **B1:** confirm `import { z } from "druckform"` is now correct; keep `import { z } from "zod"` as an accepted alternative.
- **B3:** a style token compiles to a color **named** `druck<Name>` *and* a switch macro `\druck<Name>`. Use the **name** (no backslash) in color-key arguments — `tcolorbox` (`colframe=druckAccent`, `colback=druckAccent!6`), `colortbl` (`\rowcolor{druckAccent}`, `\arrayrulecolor{druckAccent}`), `xcolor` mixes (`druckMuted!30`); use the **macro** `\druck<Name>` as a color switch in text. Include one worked tcolorbox/table snippet. Note `ctx.token(name)` returns the **macro** form.
- **B4:** document the variable-font failure mode and the `fonts.main: { name, options }` form (with `AutoFakeBold` as the worked example).
- **B5:** document `ctx.style` and its `{ colors, fonts, spacing }` shape (raw token values), distinct from `ctx.token(name)` (macro).
- **B6:** a worked frontmatter→document-shell title-block example — read `element.frontmatter.title/subtitle` (the `DocumentLayout` payload), `escapeTeX` it, typeset a styled title block; note the shell also sees it via `ctx.frontmatter`.
- **B7:** state that `preview-component` / `preview_component` only preview `:::`-invoked components; the `document` shell and `block:*` overrides require a full `render`.
- **B8 (docs):** declarative `requiredTokens` usage; a **warning** that hardcoded `druck<Name>` names in `preamble`/`emits` are otherwise not tracked by doctor's coverage check; the `--assets` CLI flag (default `"."`) and how `block:image` resolves `src` against it; a one-liner that only `\setmainfont`/`\setmonofont` are emitted (no `\setsansfont` — if `main` is a sans, the body inherits it).
- **Part A:** document `ctx.asset(ref)` (absolute path, SVG→PDF auto-conversion, memoized, hard-errors if `rsvg-convert` is missing) and `ctx.templateDir` (raw template root, for `\input`/`.sty`/fontspec `Path=`); note assets resolve against the *defining* template's dir; note `rsvg-convert` is required for SVG assets (same tool as diagrams). Include the logo-in-header example (mirrors the `logotheme` fixture).

## Testing

- **B1:** unit — the `druckform` ESM barrel exports a defined `z` (`typeof z.object === "function"`).
- **B2:** integration — create a TS component in a temp dir **outside** the package that imports both `zod` and `druckform`, load it via `loadComponent`, and assert it loads and renders — with no symlink/`node_modules` setup in the temp dir. This is the real onboarding-blocker regression test.
- **B4:** unit on `compileStyle` — string `main` → `\setmainfont{Name}` (no brackets); object `main` → `\setmainfont{Name}[AutoFakeBold=2.2]`; same for mono; `mergeStyle` override of `main` replaces the whole value.
- **B8:** unit — a declarative component declaring `requiredTokens: ["warning"]` surfaces `warning` in `def.requiredTokens`, and `checkTokenCoverage` reports a finding when the style omits it.
- **Docs:** no unit tests, but any new/edited example component must pass `druck doctor` (the examples gallery is doctor-checked in CI). Verify skill code snippets against the actual exports.

## Affected files (anticipated)

- `src/index.ts` — B1 re-export.
- `src/component/typescript.ts` — B2 esbuild alias/resolve + bundle of zod/druckform.
- `src/sdk/types.ts` — B4 `FontSpec` on `StyleTokens.fonts` and `StyleConfig.tokens.fonts`; B8 declarative spec `requiredTokens`.
- `src/style/compiler.ts` (`compileStyle`/`extractTokens`) — B4 options emission.
- `src/style/merge.ts` — no change (already spreads `fonts` field-by-field; confirmed).
- `src/component/declarative.ts` — B8 `requiredTokens` merge.
- `claude-plugin/skills/druckform-authoring/SKILL.md`, `docs/extending-druckform.md`, `docs/authoring.md` — Part 2 docs.
- Tests under `packages/druckform/tests/` per the Testing section.
