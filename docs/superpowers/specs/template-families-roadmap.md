# Template families — roadmap and open ideas

**Status:** working notes, not an approved design. Each family below still needs its own
brainstorm → spec → plan cycle before implementation.
**Last updated:** 2026-08-18

## Where we are

| Phase | State |
|---|---|
| Page foundation + prose library | Shipped, v0.3.0 |
| **Consulting deliverables** | **Shipped on `family-consulting`** (unmerged at time of writing) |
| Technical documentation | Not started |
| Business correspondence | Not started |
| Internal working docs | Not started |

The foundation spec (`2026-08-17-page-foundation-and-prose-library-design.md`) named four
families and deferred all of them so the shared layer could prove itself first. Consulting
was the first, and is done. This file holds what we know about the other three, plus the
cross-cutting work that surfaced while building consulting.

## What already exists, so we don't rebuild it

`base` currently provides:

```
badge  callout  danger  deflist  document  figure  footnote  infobox  metadata
note  pagebreak  pullquote  ref  tip  warning
block:blockquote  block:codeblock  block:heading  block:hr  block:image
block:list  block:table
```

`consulting` adds `finding` (+ `impact`/`evidence`/`recommendation`), `findings-summary`,
`exec-summary`, `appendix`, and gives `ref` a `kind` enum.

Anything a new family needs that looks like the above should extend or re-default it
rather than introduce a parallel component. `report` is the model for a thin family: it
only re-defaults `infobox`'s accent.

## Constraints that carried through consulting, and should carry forward

These held for the whole of consulting and are worth keeping as defaults rather than
re-deciding per family:

- **Zero new LaTeX packages.** Every family so far has been buildable from engine-core
  LaTeX plus what `block:table` already pulls (`tabularx`, `booktabs`). Adding a package
  means updating the prewarm document, or the offline Docker image breaks.
  `tests/integration/prewarm-sync.test.ts` enforces it — **add each new template name to
  that test's list**, which consulting initially forgot.
- **A component has exactly one slot** (`slots.children`). No multi-slot support exists.
  Structured components are built by nesting sub-components, as `finding` does.
- **Every template declares a default for every token its components require**, in its own
  `style.tokens`. Otherwise a hand-written style hits `Missing required style token` — the
  bug that made `report` unusable before v0.3.0.
- **Both sides of a label go through `sanitizeLabelId`.** Two silent-`??` bugs have shipped
  from violating this.
- **Every component ships `meta.example` / `example:`**, matched verbatim by the docs and
  enforced by `examples-gallery-drift.test.ts`.
- **Escaping convention is `Tex` with `raw()`** only for values that are enum-constrained,
  token-derived, or already sanitised. Bare `${}` interpolation next to a macro name also
  trips a heuristic in `doctor.ts`.

## Family 2 — Technical documentation

The foundation spec's one-liner: *cross-reference vocabulary, parameter tables, glossary.*

**Likely the highest-value family after consulting**, because it is the one an AI agent
writes most often (READMEs, API docs, design docs, runbooks).

### Candidate components

- **`param-table`** — a parameter/option table with name, type, default, required flag,
  description. Almost certainly a container of `param` sub-components rather than a
  positional table, so each description keeps real Markdown. Same nesting shape as
  `finding`.
- **`glossary` / `term`** — a defined-terms list. **This is the second natural consumer of
  the auxiliary-list machinery** built for `findings-summary`: terms declared inline
  throughout the document, collected into one alphabetised list. Note the machinery
  currently emits in *document order*; alphabetisation would be new work, and LaTeX's own
  sort tooling (`makeindex`) is an external binary we do not have offline. Sorting in TS
  before emit is probably the answer.
- **`api` / `endpoint`** — method, path, params, response. May just be `param-table` plus a
  heading; resist inventing it until a real document needs it.
- **`admonition` variants already exist** (`note`/`warning`/`tip`/`danger`) — do not add
  `caution`/`important`; re-default the existing four if the visual language differs.
- **`ref` kinds** — this family will want `kind: "table"`, `kind: "section"`, `kind: "term"`.
  The enum is the extension point; adding a kind is a one-line change plus a label-agreement
  test.

### Open questions

- Does a code-heavy family need anything beyond `block:codeblock`? Line numbers and line
  highlighting are the usual asks, and `listings` is already prewarmed — check what options
  we can turn on without a new package.
- Cross-references to headings need stable heading ids. Right now `block:heading` does not
  emit labels. That is a `base` change, not a family change, and it affects everyone.

## Family 3 — Business correspondence

The foundation spec's one-liner: *letterhead (`fancyhdr` lands here), address blocks,
subject lines, signatures, line-item totals.*

**This is the family that breaks the zero-new-packages streak.** Letterhead needs running
headers/footers, which means `fancyhdr`, which means the prewarm document and the Docker
image both change. That is not a reason to avoid it — it is a reason to sequence it
deliberately and budget for the image work.

### Candidate components

- **`letterhead`** — sender block, logo, contact details. Probably driven by `style.tokens`
  and frontmatter rather than a body component, since it is page furniture.
- **`address`** — recipient block with the country-specific line ordering that DIN 5008
  (German business letters) expects. Worth checking, given the user base.
- **`subject`** — the `Betreff` line.
- **`signature`** — name, title, optional scanned-signature image, with the space above it
  that a printed letter needs.
- **`line-items`** — a quote/invoice table with quantity, unit price, line total, and a
  computed sum. **The sum is the interesting part**: computing it in TS at render time is
  trivial and testable; computing it in LaTeX is not. Do it in TS.

### Open questions and cautions

- **Invoices are a compliance surface.** A German invoice has legally mandated fields
  (`Pflichtangaben`: tax number, invoice number, dates). If we ship an `invoice` component
  it will be used for real invoices. Either do the research properly or scope the family to
  quotes and letters and say so explicitly in the docs.
- DIN 5008 has precise geometry (fold marks, address window position). If we target it,
  target it exactly or not at all — approximately-DIN is worse than clearly-not-DIN.
- Page tokens currently assume a document, not a letter. First-page-different margins are a
  `fancyhdr`-era concern.

## Family 4 — Internal working docs

The foundation spec's one-liner: *attendees, decision/ADR blocks, action tables with owners.*

**Probably the cheapest of the three**, and a good candidate for going second if
correspondence's package work needs scheduling.

### Candidate components

- **`attendees`** — present / absent / apologies. Likely a `deflist` re-default rather than
  a new component; check before building.
- **`decision`** — the ADR shape: context, decision, consequences, status. Nested
  sub-components again, same as `finding`. Status is an enum (`proposed` / `accepted` /
  `superseded` / `deprecated`) with colour tokens — structurally identical to `severity`,
  so **most of `finding`'s implementation is reusable**, and if two families end up with the
  same shape it is worth extracting rather than copying.
- **`action` / `actions`** — owner, due date, status. **Third consumer of the auxiliary-list
  machinery**: actions declared inline, collected into one table at the top. By this point
  the machinery has three consumers and should probably be factored into something a
  template author can instantiate, rather than three near-copies of `\findingentry` /
  `\l@finding` / `\listof…`.
- **`ref` kind** `"decision"`, `"action"`.

### Open question

Meeting notes and ADRs may not want the same page furniture as a client deliverable — no
cover page, tighter margins, denser type. That is a `style.tokens` question, and the page
foundation already supports it; worth confirming rather than assuming.

## Cross-cutting work worth doing before or between families

Ordered by how much pain they cause.

1. **Extract the auxiliary-list machinery.** `findings-summary` hand-rolls
   `\findingentry` / `\l@finding` / `\listoffindings`. Glossary, actions and any future
   collected list want the same thing. Three copies is the point at which this should
   become a shared helper a template author parameterises by list name and entry format.
   **Do this before family 4**, which will otherwise be copy number three.
2. **Surface LaTeX's undefined-reference warning through the render contract.** A dangling
   `\ref` renders `??` and exits 0. The bundled e2e fixture catches it via
   `UNIVERSAL_FORBIDDEN`, but a user's own document gets nothing. Duplicate ids have the
   same shape: LaTeX warns "multiply defined", druck reports `status: ok`. Every family
   that adds a `ref` kind widens this hole.
3. **Label `block:heading`** so cross-references to sections work at all. Needed by
   technical documentation; useful everywhere.
4. ~~**`doctor`'s token scanner matches inside comments.**~~ **Done** (`fdd3584`) — comments
   are blanked before the scan, string contents are respected so a `//` in a URL does not
   swallow the line, and a fixture covers the false positive.
5. **`preview-component` fails for leaf components emitting no visible marks.** `::appendix`
   and the pre-existing `::pagebreak` both produce "did not produce document.xdv". Wrapping
   the snippet in minimal visible content would fix both.
6. **`examples-gallery-drift`'s `HEADINGS` / `TEMPLATE_FOR` are opt-in maps.** They fail hard
   when an entry is *wrong*, but a component nobody adds escapes coverage silently. An
   "every resolved component with an example has a heading" assertion would close it.
   Each new family makes this more likely to bite.
7. ~~**`run-e2e.sh` has no staleness guard.**~~ **Done** (`fdd3584`) — `E2E_SKIP_BUILD=1`
   now compares a content fingerprint of everything baked into the image and refuses to run
   on a mismatch, with `E2E_ALLOW_STALE_IMAGE=1` as the override.
8. **`\findingentry` uses fixed 4.5em/6em boxes**; long ids overrun the severity column.
   Cosmetic, but any new collected list should not copy the fixed-width approach.

## Sequencing recommendation

1. **Technical documentation** — highest usage, no new packages, and it forces the
   `block:heading` labelling work that everything else benefits from.
2. **Internal working docs** — cheap, and reuses `finding`'s enum-plus-colour-tokens shape.
   Extract the auxiliary-list helper first (item 1 above).
3. **Business correspondence** — last, because `fancyhdr` means image and prewarm work, and
   the invoice question needs a real scoping decision before anyone writes code.

Do the cross-cutting items opportunistically, except items 1 and 3, which have a natural
slot in the sequence above. Items 4 and 7 are already done.

## Making the next run faster

Consulting took 2h20m wall clock: 81.5 min of implementers, 34.7 min of task reviews,
8.6 min of final review, ~15 min of orchestration. Where to get it back:

- **The e2e task alone was 29.8 min, and 14 of those produced nothing** — a stale image
  and two turn-boundary parks. The stale guard (item 7) is now in. Also: tell the e2e
  implementer to run the suite in the foreground of its own turn, and to do
  sabotage/teeth-checks with `--engine local` rather than rebuilding a 1.9 GB image.
- **Fewer, larger tasks.** Seven tasks meant seven review cycles at 4–6 min each; Task 2's
  review cost more than the task. Batch small same-shape work into one dispatch — four
  tasks would have been right for consulting.
- **Reviewers should not re-run the full suite.** Nearly every one independently rebuilt
  and ran everything. That is the controller's job once. Keep their own verification for
  the specific claim under review — that is where they found the real defects.
- **Write plan snippets in the codebase's conventions** (`Tex`/`raw()`, not bare `${}`), so
  implementers do not have to deviate and then justify it.
- **Use the cheapest model when the plan contains the complete code.** The one haiku task
  was the fastest implementer of the run and reviewed clean.
- **The "known flake" tax is paid.** `prewarm-sync` and `lint` timed out sporadically under
  the parallel pool, and every implementer and reviewer in the run had to notice it,
  re-run standalone, and explain it. The cause was vitest's 5s default applied to
  integration tests that esbuild-transpile every component of every bundled template;
  the timeout is now 30s (`2da6679`). Adding a template to `prewarm-sync` costs it roughly
  +700ms, so the budget matters more with each family.

Expect ~1h15–1h30 for a comparable family. Do not cut the real-render verification: every
genuine bug in this run passed its unit tests and died to a render.

## Method notes, for whoever picks this up

Consulting was built brainstorm → spec → plan → subagent-driven execution, and the pattern
held up well. Two things that mattered more than expected:

- **Every genuine bug was found by a real render, not a unit test.** Blank cross-references,
  wrong `\ref` semantics, and an empty index all passed their unit tests. Any family spec
  should require a real-render verification step per task, and the e2e fixture should be
  extended in the same plan rather than afterwards.
- **Assertions on whole-document `pdftotext` output are usually too weak.** The consulting
  index assertions passed against an empty index because the same strings appeared in the
  finding bodies. Scope assertions to the page or region under test, and prove they fail by
  deliberately breaking the thing they protect.
