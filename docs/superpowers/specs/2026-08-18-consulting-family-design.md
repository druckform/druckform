# Consulting deliverables template family

**Date:** 2026-08-18
**Status:** Design approved, awaiting implementation plan
**Builds on:** `docs/superpowers/specs/2026-08-17-page-foundation-and-prose-library-design.md` (shipped in v0.3.0)

## Context

The page foundation and shared prose library landed in v0.3.0: `base` now carries A4 page tokens, an opt-in cover/title/TOC, and ten prose components. That spec deliberately deferred four document families — consulting, technical documentation, correspondence, internal working docs — to their own specs, so the shared layer could prove itself first.

This is the first of those four. Consulting deliverables are the core case: client-facing reports, assessments and audits, whose defining structure is a set of **findings** — each with a severity, an impact, supporting evidence and a recommendation — usually preceded by a summary table of every finding in the document.

Nothing else in this family is novel. The interesting engineering is the findings index.

## Verified before designing

Two claims this design rests on were tested rather than assumed:

1. **A custom LaTeX list works with zero new packages.** `\@starttoc` + `\addcontentsline` + an `\l@<type>` formatter are plain LaTeX internals — the same machinery behind `\listoffigures` — so no `tocloft`, no prewarm change, and the family keeps the zero-new-packages property the foundation established.
2. **Tectonic resolves it in one invocation.** A two-finding probe printed `note: Rerunning TeX because "t.fnd" changed` and produced a summary listing both findings with correct page numbers (2 and 3). `runTectonic` still calls tectonic once; its auto-rerun does the rest, exactly as it does for the TOC.

## Scope

**In:** a `consulting` template; the `finding` component with its three sub-components; the generated findings index; `exec-summary`; `appendix`; a `kind` parameter on `base`'s `ref`.

**Out:** the other three families; any change to how findings are numbered by LaTeX counters (the author-supplied id is the identity); severity-based filtering or sorting of the index (it lists findings in document order).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Parent template | `extends: base` | `report` only re-defaults `infobox`'s accent — nothing consulting-specific. |
| Finding structure | Nested sub-components | A component has exactly one slot (`slots.children`); the engine has no multi-slot support. Nesting already works and is tested, and each part keeps real Markdown — lists, emphasis, nested callouts. |
| Findings index | LaTeX auxiliary list | Verified above. The author writes each finding once; the table generates itself, so it cannot drift. |
| Severity levels | `critical` / `high` / `medium` / `low` | Four covers standard audit practice. `info` is one line to add later. |
| `ref` kind | **Enum**, not free string | A typo'd kind yields a dangling reference, which LaTeX renders as `??` with only a warning — the exact silent failure the foundation's `sanitizeLabelId` work fought. An enum turns it into a zod validation error at lint time. |

## 1. The `finding` component

```markdown
:::finding{severity="high" id="F-01" title="Secrets recoverable from CI logs"}
:::impact
Any user with read access to the repository can recover deploy credentials.
:::
:::evidence
- `.github/workflows/deploy.yml:42` echoes `$DEPLOY_TOKEN`
:::
:::recommendation
Mask the variable and rotate the token.
:::
:::
```

**Params:** `severity` (enum, required), `id` (string, required), `title` (string, required).

`id` is the finding's identity: it is displayed, it seeds the label, and it is what the index lists. It is **not** a LaTeX counter — findings keep the ids the author assigns, because a consulting report's ids are quoted in email and remediation tickets and must not renumber when a finding is inserted.

The `id` flows into `\label{finding:<id>}` through `sanitizeLabelId` from `@druckform/core` — the same helper `figure` uses — so the label agrees with what `ref` produces from the same identifier.

### Severity → colour tokens

Each level maps to its own token: `severityCritical`, `severityHigh`, `severityMedium`, `severityLow`. Per the invariant established in the foundation (`bundled-template-tokens.test.ts`), **`consulting` must declare a default for every one of them in its own `style.tokens`**, so a hand-written style cannot trigger the `Missing required style token` error that made `report` unusable before v0.3.0. The same test will enforce this for `consulting` once the template exists.

### The three sub-components

`impact`, `evidence` and `recommendation` are containers that render a small labelled heading followed by their children. They are separate components rather than parameters because parameters are escaped plain strings: a bulleted evidence list or an emphasised impact sentence is impossible in an attribute.

**Containment is not enforced.** The engine has no parent-child validation, so `:::impact` written outside a `:::finding` renders as a bare labelled block rather than erroring. This is accepted for now: inventing enforcement machinery for one family is the wrong trade, and the natural home for it is a later `doctor` check that walks the AST. The implementation must therefore make each sub-component render sanely standalone rather than assuming a parent.

## 2. The findings index

```markdown
::findings-summary
```

`findings-summary` is a leaf emitting `\listoffindings`. `finding` emits an `\addcontentsline{fnd}{finding}{…}` alongside its body. The template's document-shell preamble defines the machinery:

```latex
\makeatletter
\newcommand{\listoffindings}{\section*{Findings Summary}\@starttoc{fnd}}
\newcommand{\l@finding}[2]{%       % #1 = entry text, #2 = page number
  \par\noindent #1 \dotfill\ #2\par}   % final layout is the plan's business
\makeatother
```

Placement is the author's: `::findings-summary` before the findings gives a forward-looking summary; after them, an appendix-style register. Both work, because the entries come from the auxiliary file rather than from document order.

**Known limitation, to be documented:** the index is written during the run that renders the findings, so a document whose *only* change is a finding's title needs the same auto-rerun Tectonic already performs. This is the standard LaTeX aux-file contract and the TOC has the same property; it is called out because a stale `.fnd` in a user's own build directory would show old titles.

## 3. `exec-summary` and `appendix`

`exec-summary` is a container emitting a headed, full-width introductory block — deliberately not a `callout` alias, because an executive summary is body prose with a heading, not a boxed aside.

`appendix` is a leaf emitting `\appendix`, switching subsequent `#` headings from numbered to lettered sections. It takes no parameters.

## 4. The `kind` parameter on `base`'s `ref`

`ref` currently hardcodes `\ref{fig:…}`. It gains an optional `kind`:

```ts
export const schema = z.object({
  kind: z.enum(["fig", "finding"]).default("fig"),
});
```

`:ref[arch]` continues to mean a figure — the default preserves every existing document and the component's own `meta.example`. `:ref[F-01]{kind=finding}` references a finding.

This is a change to a **base** component made by a family spec, which is deliberate: technical documentation will want `sec` and `tab`, and adding one shared, validated vocabulary once is better than each family inventing its own reference component. Each family that introduces a referenceable thing extends the enum.

## 5. Compatibility

Purely additive. A new template, seven new components, and one optional parameter with a default that preserves current behaviour. No existing document changes output.

## 6. Testing

- Unit tests per component, using `tests/helpers/render-component.ts`.
- `finding` and `ref` produce **byte-identical** `finding:` labels for the same id, including ids containing underscores — the regression test shape the foundation's `figure`/`ref` bug taught us.
- Each severity maps to a **distinct** token — the test that would have caught `callout`'s invisible `danger` variant.
- `consulting` satisfies its own required tokens with no external style (the existing `bundled-template-tokens.test.ts` invariant, extended to the new template).
- **A real render** asserting the generated index lists both findings with resolved page numbers. This is the assertion that matters: it is the only one that proves the aux-file mechanism end to end, and the foundation's `pullquote` bug showed that unit tests over emitted strings cannot see LaTeX-level failures.
- `doctor`-clean for `consulting` alongside the existing three.
- The e2e fixture corpus gains a consulting document, so the index is exercised inside the image. `"??"` is already in `UNIVERSAL_FORBIDDEN`, so a dangling finding reference fails the suite.

## Out of scope — the remaining families

Each gets its own spec, informed by this one:

- **Technical documentation:** `sec`/`tab` reference kinds, parameter tables, glossary.
- **Business correspondence:** letterhead — the one family that needs a new LaTeX package (`fancyhdr`) and therefore a prewarm entry, which `prewarm-sync.test.ts` will force.
- **Internal working docs:** attendees, decision/ADR blocks, action tables with owners.
