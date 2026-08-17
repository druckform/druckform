import { type Component, type RenderCtx, escapeTeX } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({
  /** Semicolon-separated `key=value` pairs, e.g. "Client=Acme; Date=2026-08-17". */
  pairs: z.string(),
});

export const meta = {
  name: "metadata",
  description: "Two-column key/value block for document metadata.",
  acceptsChildren: false,
  example: '::metadata{pairs="Client=Acme GmbH; Date=2026-08-17; Status=Draft"}',
  form: "leaf" as const,
};

// booktabs is already pulled in by block:table; no new package.
export const preamble = "\\usepackage{booktabs}";

export const render: Component<typeof schema> = (params, _children, _ctx: RenderCtx) => {
  const rows = params.pairs
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const eq = pair.indexOf("=");
      const key = eq >= 0 ? pair.slice(0, eq) : pair;
      const value = eq >= 0 ? pair.slice(eq + 1) : "";
      return `\\textbf{${escapeTeX(key.trim())}} & ${escapeTeX(value.trim())} \\\\`;
    });
  return [
    "\\par\\vspace{0.5em}",
    "\\begin{tabular}{@{}ll@{}}",
    "\\toprule",
    ...rows,
    "\\bottomrule",
    "\\end{tabular}",
    "\\par\\vspace{0.5em}",
  ].join("\n");
};
