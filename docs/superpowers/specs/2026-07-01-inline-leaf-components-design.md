# Inline & leaf components (generic directives) — design

**Date:** 2026-07-01
**Author:** torben (with Claude)
**Status:** Approved design, awaiting implementation plan
**Research:** backed by the deep-research report on markdown inline-component dialects (generic-directives convention; markdown-it vs micromark; Obsidian renderer capability). Primary sources: talk.commonmark.org/t/…/444, micromark-extension-directive, remark-directive, hilookas/markdown-it-directive, @diplodoc/directive, pandoc#5880, obsidian-dataview, obsidian-emera.

## Problem

druckform has only block **container** components (`::: name key="value" … :::`). It needs **inline-span** components (mid-sentence, e.g. a badge/ref/icon) and **leaf-block** components (single-line, attributes-only, no body). The syntax should be portable: the same markdown source should be renderable both by druckform (→LaTeX→PDF) and, in the future, by an Obsidian plugin (→live preview / reading mode), without locking druckform into a proprietary dialect.

## Decisions (locked in brainstorming)

1. **Adopt the CommonMark "generic directives" convention for all three forms** and **migrate the existing container** to it. The current bespoke syntax (`::: name key="value"`, space after the colons, space-separated quoted attributes) is replaced by the standard tight form with brace attributes.
2. **Write druckform's own parser** (a markdown-it inline rule + an extension of druckform's block parser) matching **micromark's** tight grammar exactly, rather than depending on `hilookas/markdown-it-directive` (its leaf form `:: name … ::` diverges from micromark) or `@diplodoc/directive` (divergent `[]/()/{}` attribute model). This guarantees the same source parses identically on a future micromark/remark (Obsidian) side.
3. **Registry-based resolution with a raw escape hatch:** an unregistered directive name is a clear doctor/render **error** (never an undefined-LaTeX crash); a reserved `raw` directive with `{format=latex|html}` emits verbatim content for the matching renderer.
4. **Inline firing rule:** an inline `:name` fires only when immediately followed by `[` or `{`, the name is letter-initial, and it resolves to a registered inline component — eliminating prose false-positives (`10:30`, `localhost:8080`, `John 15:13`, `:smile:`).

## Non-goals (YAGNI)

- The **Obsidian plugin** itself — future, separate. This spec only ensures the *syntax + attribute model* are micromark-compatible so that plugin can reuse a standard parser.
- A user-facing **migration command** (`druck migrate`). The project is used privately for a couple of documents; the author migrates those by hand. Only in-repo docs/examples/tests are migrated as part of this work.
- **Anonymous spans/divs** (`[text]{.class}`, `:::{.class}`) — the directives convention requires a name (use `:span[text]{.class}`); this matches micromark, which closed that request as "not planned".
- MDX/JSX components.

## Syntax

One grammar, three forms distinguished by colon count; identical attribute model throughout.

- **Inline** (mid-sentence): `:name[content]{#id .class key=val}` — `[content]` is inline markdown; fires only per the Q4 rule.
- **Leaf** (own line, no body): `::name[content]{attrs}`
- **Container** (body between fences): `:::name{attrs}\n…\n:::`

**Attribute model** (`{ … }`, Pandoc-derived, matching micromark):
- `#foo` → `id=foo`; `.foo` → adds class `foo` (multiple classes combine; last id wins).
- `key=val`, `key="val"`, `key='val'`, bare `key` are equivalent HTML-style attributes.
- Attributes map to component **params** (validated by the component's zod schema, as today). `id`/`class` are captured as reserved params (available to components; unused by default). Unknown params follow the component schema's rules.

**Escaping / disambiguation:**
- Inline `:name` that is not followed by `[`/`{`, or whose name is not a registered inline component, is literal text (so ordinary colons in prose are safe).
- A literal `:` before a would-be directive can be written `\:`.

## Architecture

druckform currently hand-parses `:::` blocks in `src/parse/parser.ts` into `ComponentBlock` AST nodes, while prose inside text nodes is rendered through markdown-it (`mdToLatex` → `tokens-to-latex.ts`). The new syntax spans both layers, so the parser work is two-part:

1. **Block parser (`parser.ts`) — leaf + container.** Replace `OPEN_RE`/`CLOSE_RE`/`parseAttrs` with the tight directive grammar: `:::name{attrs}` … `:::` (container, 3+ colons) and `::name[content]{attrs}` (leaf, own line). A shared brace-attribute parser produces `{ id?, class?, ...params }`. `ComponentBlock` gains a `form: "leaf" | "container"` discriminator (container behaves as today; leaf has no children body).
2. **Inline rule (markdown-it) — inline.** Add a markdown-it **inline ruler** for `:name[content]{attrs}`, wired into the `mdToLatex`/`tokens-to-latex` path. It emits an inline token that `tokens-to-latex` dispatches to the registered **inline** component, splicing the component's inline LaTeX into the surrounding paragraph. The shared brace-attribute parser is reused.

Both layers use the **same** attribute grammar and the **same** name rules, so a single conceptual grammar covers all three forms.

### Component model

Components register through the existing registry + zod-schema + doctor machinery, with a declared **form**:
- `meta.form: "inline" | "leaf" | "container"` (default `"container"` for back-compat with existing components).
- **Inline** components receive the rendered-inline `[content]` as `children` and attrs as `params`; they must emit **inline** LaTeX (no paragraph breaks / block environments). Doctor warns if an inline component emits obvious block constructs.
- **Leaf** components receive attrs as `params` (and optional `[content]` as `children`); emit **block** LaTeX.
- **Container** components are unchanged in behavior.
- All forms use the existing `ctx` (token/style/asset/frontmatter/templateDir) and `render(params, children, ctx, element?)` signature.

### Escape hatch

- **Unregistered name** → a doctor finding + a render error naming the directive (consistent with the existing component-registry / token-coverage checks), never a raw LaTeX compile crash.
- **`raw` directive** (reserved, all three forms): `:raw[…]{format=latex}` / `::raw{format=latex}` / `:::raw{format=latex} … :::`. druckform emits the content **verbatim** into LaTeX when `format=latex`, and **skips** `format=html`; a future Obsidian plugin does the reverse. This is the uncapped valve for content the component model can't express.

## Migration (in-repo only)

Rewrite existing `::: name key="value"` invocations to `:::name{key="value"}` (tight, braces) across active in-repo content, updated by hand as part of the implementation:
- `docs/authoring.md`, `docs/extending-druckform.md` (worked examples).
- Example components/gallery under `templates/examples/` + `docs/examples-gallery.md` (if they use `:::`).
- Tests + fixtures that parse `:::`: `tests/unit/parser.test.ts`, `tests/unit/composer-document.test.ts`, `tests/integration/preview-component.test.ts`, `tests/fixtures/documents/valid.md`, `tests/fixtures/documents/invalid-missing-required.md`.
- **Leave historical plan docs untouched** (e.g. `docs/superpowers/plans/2026-06-27-*`) — they are artifacts, not live docs.

No `druck migrate` command ships. The author migrates their own two documents by hand.

## Testing

- **Block parser:** container `:::name{attrs}` (with/without attrs, nested, id/class), leaf `::name{attrs}`; the tight form; rejection of the old `::: name key="value"` form (or a clear error); brace-attribute parsing (id/class/key=val/quoted, multiple classes, last-id-wins).
- **Inline rule:** `:name[content]{attrs}` fires and emits inline LaTeX; the Q4 non-firing cases (`10:30`, `localhost:8080`, `John 15:13`, `:smile:`, `:name` with no bracket/brace, unregistered name) render as literal text; `\:` escapes.
- **Component model:** an inline component emits inline LaTeX spliced mid-paragraph; a leaf component emits block LaTeX; attrs reach params and validate via zod; `id`/`class` captured.
- **Escape hatch:** unregistered name → error/finding (not a LaTeX crash); `raw{format=latex}` passes through verbatim, `raw{format=html}` is skipped by druckform.
- **Migration:** the migrated in-repo docs/examples/fixtures parse under the new grammar; `druck doctor` on examples stays clean; full render of a fixture using all three forms succeeds.

## Affected files (anticipated)

- `src/parse/parser.ts` — replace the bespoke `:::` grammar with the tight directive block grammar (leaf + container) + shared brace-attribute parser; `ComponentBlock` `form` discriminator.
- `src/latex/tokens-to-latex.ts` + a new markdown-it inline rule module — inline directive parsing + dispatch to inline components.
- `src/latex/composer.ts` — route leaf vs container; ensure inline directives render within paragraph flow.
- `src/sdk/types.ts` — `meta.form`; `ComponentBlock.form`; reserved `id`/`class` param handling.
- component loaders (`src/component/{typescript,declarative}.ts`) — accept/validate `form`.
- `src/commands/doctor.ts` — validate form; inline-emits-block warning; unregistered-name finding.
- Raw directive handling (in the composer/registry).
- Docs: `SKILL.md`, `docs/extending-druckform.md`, `docs/authoring.md` — new syntax + attribute model + inline/leaf examples + `raw` escape hatch; migrate existing `:::` examples.
- Tests + fixtures per the Testing section.
