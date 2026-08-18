---
"@druckform/core": minor
---

Adds the `consulting` template for client-facing reports and assessments: `finding` (severity, id, title) with nested `impact` / `evidence` / `recommendation`, plus `exec-summary` and `appendix`.

`::findings-summary` generates an index of every finding in the document, with page numbers, from the findings themselves — so the summary cannot drift from the detail. It is built on LaTeX's own list machinery and adds no new package.

`ref` gains an optional `kind` (`fig` | `finding`, default `fig`), so `:ref[F-01]{kind=finding}` cross-references a finding. Existing `:ref[...]` calls are unchanged.

Fixes `sanitizeLabelId` for ids containing `~`, `^` or `\`. Those three characters escape to words made of ordinary letters (`\textasciitilde{}` and friends), which survived the sanitiser on the referencing side but not the defining side, so `\label` and `\ref` disagreed and the reference rendered as a silent `??`. Affected `figure`/`ref` as well as the new `finding`.
