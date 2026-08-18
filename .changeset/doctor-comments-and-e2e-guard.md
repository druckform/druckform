---
"@druckform/core": patch
---

`druck doctor` no longer reports tokens that appear only inside comments. Its
token scan is a plain regex over the component source, so a `ctx.token("...")`
written in prose to explain something was reported as an undeclared token. Real
calls are still detected; strings containing `//` no longer swallow the rest of
the line.
