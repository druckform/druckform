# Examples gallery

The `examples` template extends `base` and ships one canonical, copy-pasteable component override: `fancy-table`. It demonstrates overriding a reserved `block:` component that receives a structured element payload.

`examples` inherits `base`'s document shell and its whole prose component library (`callout` and its aliases, `figure`, `ref`, `pagebreak`, `pullquote`, `deflist`, `metadata`, `badge`, `footnote`) unchanged — the sections below show each of those using their own `meta.example`/`example` field verbatim. A test (`tests/integration/examples-gallery-drift.test.ts`) diffs every snippet on this page against the resolved component's example, so drift here fails CI rather than going unnoticed.

To use `fancy-table` as a starting point for your own override, copy it into your own template's `components/` directory, rename `meta.name`, then run `druck doctor` and `druck preview-component` to verify it is wired up correctly.

---

## fancy-table: `block:table` structured element override

Demonstrates: overriding a reserved `block:` component that receives a structured `BlockElement` payload instead of children. The component reads `element.alignments`, `element.header`, and `element.rows` to produce a `tabularx` table with booktabs rules.

```ts
import type { BlockElement, RenderCtx } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "block:table", description: "Booktabs table with a shaded header", acceptsChildren: false };
export const preamble = ["\\usepackage{tabularx}", "\\usepackage{booktabs}", "\\usepackage{array}"].join("\n");

function col(a: "left" | "center" | "right" | null): string {
  if (a === "center") return ">{\\centering\\arraybackslash}X";
  if (a === "right") return ">{\\raggedleft\\arraybackslash}X";
  return ">{\\raggedright\\arraybackslash}X";
}

export function render(
  _p: unknown,
  _c: string,
  _ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "table") return "";
  const cols = element.alignments.map(col).join("");
  const header = `${element.header.map((c) => `\\textbf{${c}}`).join(" & ")} \\\\`;
  const body = element.rows.map((r) => `${r.join(" & ")} \\\\`).join("\n");
  return [
    `\\begin{tabularx}{\\linewidth}{${cols}}`,
    "\\toprule",
    header,
    "\\midrule",
    body,
    "\\bottomrule",
    "\\end{tabularx}",
  ].join("\n");
}
```

---

## callout (and its aliases `note` / `tip` / `warning` / `danger` / `infobox`)

From `base`'s `components/callout.ts` (`meta.example`):

```
:::callout{variant="warn" title="Heads up"}
Body
:::
```

The aliases invoke the same component under a friendlier name with the variant preset, e.g. `:::warning{title="Heads up"}` … `:::`.

## figure

From `base`'s `components/figure.ts` (`meta.example`):

```
:::figure{caption="System overview" id="arch"}
![](diagram.png)
:::
```

## ref

From `base`'s `components/ref.ts` (`example`):

```
See :ref[arch] for the layout.
```

## pagebreak

From `base`'s `components/pagebreak.component.yaml` (`example`):

```
::pagebreak
```

## pullquote

From `base`'s `components/pullquote.component.yaml` (`example`):

```
:::pullquote{attribution="Ada Lovelace"}
The Analytical Engine weaves algebraic patterns.
:::
```

## deflist

From `base`'s `components/deflist.ts` (`meta.example`):

```
::deflist{pairs="Token=A named style value; Template=A named set of components"}
```

## metadata

From `base`'s `components/metadata.ts` (`meta.example`):

```
::metadata{pairs="Client=Acme GmbH; Date=2026-08-17; Status=Draft"}
```

## badge

From `base`'s `components/badge.component.yaml` (`example`):

```
Status: :badge[DRAFT]
```

## footnote

From `base`'s `components/footnote.component.yaml` (`example`):

```
The figure is provisional:footnote[Measured on 2026-08-17.].
```

---

The sections below are the `consulting` template's own components (it extends `base`, so it also has everything above). Each snippet is copied verbatim from that component's `example`/`meta.example`.

## finding

From `consulting`'s `components/finding.ts` (`meta.example`):

```
:::finding{severity="high" id="F-01" title="Secrets recoverable from CI logs"}
:::impact
Credentials are recoverable by anyone with read access.
:::
:::
```

## impact

From `consulting`'s `components/impact.component.yaml` (`example`):

```
:::impact
Credentials are recoverable by anyone with read access.
:::
```

## evidence

From `consulting`'s `components/evidence.component.yaml` (`example`):

```
:::evidence
- `.github/workflows/deploy.yml:42` echoes `$DEPLOY_TOKEN`
:::
```

## recommendation

From `consulting`'s `components/recommendation.component.yaml` (`example`):

```
:::recommendation
Mask the variable in CI and rotate the token.
:::
```

## findings-summary

From `consulting`'s `components/findings-summary.component.yaml` (`example`):

```
::findings-summary
```

## exec-summary

From `consulting`'s `components/exec-summary.component.yaml` (`example`):

```
:::exec-summary
The engagement identified three issues, one of them high severity.
:::
```

## appendix

From `consulting`'s `components/appendix.component.yaml` (`example`):

```
::appendix
```

---

Copy `fancy-table` into your template's `components/`, rename `meta.name`, run `druck doctor` and `druck preview-component`. For the prose library components above, run `druck components --template base --json` (or `--template consulting --json` for the finding family) to confirm the exact params for the version you have installed.
