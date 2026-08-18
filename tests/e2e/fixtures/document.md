---
template: report
title: E2E Bundled Template Report
toc: true
---

# E2E Bundled Template Report

Introduction paragraph with **bold**, *italic*, `code`, ~~strike~~ and a
[link](https://example.com). Ordinary prose colons must survive untouched:
the build starts at 10:30 and listens on localhost:8080.

:::infobox{title="Key Finding"}
Body of the info box, with **Markdown** inside.
:::

:::infobox{title="Outer Box"}
Outer body text.
:::infobox{title="Inner Box"}
Inner body text.
:::
:::

:::callout{variant="warn" title="Heads Up"}
A report-template callout in the warn variant.
:::

## GFM Elements

- bullet one
- bullet two
  - nested bullet

1. ordered first
2. ordered second

- [x] task done
- [ ] task open

> A blockquote paragraph.

| Left | Center | Right |
|:-----|:------:|------:|
| a    | b      | c     |
| d    | e      | f     |

```
plain & code block
```

---

![Acme logo](logo.png)

## Prose Library

:::note{title="A note"}
Note body.
:::

:::warning{title="A warning"}
Warning body.
:::

:::danger{title="A danger"}
Danger body.
:::

:::tip{title="A tip"}
Tip body.
:::

::metadata{pairs="Client=Acme GmbH; Date=2026-08-17; Status=Draft"}

:::pullquote{attribution="Ada Lovelace"}
The Analytical Engine weaves algebraic patterns.
:::

::deflist{pairs="Token=A named style value; Template=A named set of components"}

Status: :badge[DRAFT] with a footnote:footnote[Measured 2026-08-17.].

:::figure{caption="A framed box" id="box_fig"}
\rule{2cm}{1cm}
:::

See :ref[box_fig] for the box.

::pagebreak

## Diagrams

```mermaid
graph TD
  A[Start] --> B[Decision]
  B -->|yes| C[Accept]
  B -->|no| D[Reject]
```

```plantuml maxheight=0.4
@startuml
Alice -> Bob : Hello
Bob --> Alice : Hi
@enduml
```

## Raw Escape Hatch

:::raw{format=latex}
\textbf{RawLatexMarker}
:::
