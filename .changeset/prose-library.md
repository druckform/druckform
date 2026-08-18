---
"@druckform/core": minor
---

Adds a shared prose component library to `base`, so every template inherits it: `callout` with the friendly aliases `note`/`tip`/`warning`/`danger` (and `infobox`, kept for compatibility), plus `figure`, `ref`, `pagebreak`, `pullquote`, `deflist`, `metadata`, `badge` and `footnote`. No new LaTeX packages are required.

Fixes along the way:

- `variant="danger"` rendered identically to `info`; each variant now maps to its own colour token.
- `base` now declares `warning` and `danger` colours, so `report` no longer fails with `Missing required style token 'warning'` against a style that defines only `accent`.
- `extends: <template>.<component>` now resolves the named component instead of ignoring the value and using the entry's key, so a component can be aliased under another name — and a typo'd target is an error rather than being silently ignored.
- `druck components` reports the registration key rather than the implementation's `meta.name`, so aliases are discoverable.
