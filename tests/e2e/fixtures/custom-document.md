---
template: acme
title: Acme Custom Template Report
---

Intro paragraph. The subtitle above is not set, so the template's
`frontmatter.subtitle` default must supply it.

An inline directive mid-sentence: shipped in :acme-badge[v2] today, at 10:30
on localhost:8080 — those prose colons must not fire.

::acme-stamp[Reviewed by QA]{status="FINAL"}

::acme-logo{caption="ACMELOGO caption"}

:::acme-panel{title="Scope"}
Panel body with **bold** text and a nested component:

:::infobox{title="Inherited Infobox"}
This infobox comes from `base`, but its accent default was overridden to the
template's own `acme` token.
:::
:::

## Overridden GFM Blocks

| Feature | Status |
|:--------|-------:|
| tables  | ok     |
| rules   | ok     |

---

:::raw{format=latex}
\noindent\textbf{RawLatexMarker}\par
:::
