---
"@druckform/core": patch
---

`druck lint` no longer rejects the documented `raw` escape hatch. `raw` is a reserved directive the renderer handles itself rather than a registered component, so lint reported `Unknown component 'raw'` on documents that rendered perfectly — which broke the author → lint → render loop for anything using `:::raw{format=latex}`. Lint now skips it, matching the composer. Conversely, invoking a renderer-internal name (`document`, `block:*`) as a directive is now a lint error, as it already was at render time.
