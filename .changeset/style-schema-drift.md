---
"@druckform/core": patch
---

`style.yaml` now accepts the documented `{ name, options }` font form. `FontSpec` is `string | { name, options? }`, the compiler emits `\setmainfont{name}[options]` for the object form, and the extending guide documents it — but the validation schema only allowed a bare string, so `main: { name: "Noto Sans", options: "AutoFakeBold=2.2" }` failed to load with `/tokens/fonts/main must be string`.

The same schema had drifted in the other direction too: `schemas/style-v1.json`, which editors read via the `yaml-language-server` comment in style files, was missing both the font object form and mermaid `themeVariables`, so authors saw spurious warnings on keys the CLI accepts. The two copies are now generated from one exported constant and a test asserts they stay identical.
