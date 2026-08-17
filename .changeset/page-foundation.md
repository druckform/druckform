---
"@druckform/core": minor
---

**Breaking (visual): documents now render A4 by default.** Bundled templates previously produced US Letter — nothing emitted `geometry`, so `\documentclass{article}`'s `letterpaper` default leaked through. Paper size and margins are now style tokens:

```yaml
tokens:
  page:
    size: a4        # a4 | letter — default a4
    margin: "2.5cm"
```

To keep the old output, set `size: letter`.

`geometry` is now loaded (bare) by the engine core, and page setup is applied with `\geometry{…}`. A custom document shell that calls `\usepackage[…]{geometry}` will now hit LaTeX's "Option clash"; switch it to `\geometry{…}`. `druck doctor` reports this with the fix.

Also adds an opt-in cover page, title block and table of contents, driven by the frontmatter fields `title`, `subtitle`, `author`, `date`, `cover` and `toc`.
