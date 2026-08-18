import { type Component, type RenderCtx, escapeTeX, sanitizeLabelId } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({
  caption: z.string(),
  /** Optional anchor; referenced as :ref[<id>]. Namespaced to fig: in the label. */
  id: z.string().optional(),
});

export const meta = {
  name: "figure",
  description: "Captioned, numbered figure wrapping any block content.",
  acceptsChildren: true,
  example: ':::figure{caption="System overview" id="arch"}\n![](diagram.png)\n:::',
};

// No preamble: `figure` and `\caption` are LaTeX built-ins and graphicx is
// already in the engine core.
export const render: Component<typeof schema> = (params, children, _ctx: RenderCtx) => {
  // Sanitised through the same code path `ref` uses, so a `:ref[...]` to this
  // id resolves to a byte-identical \label{fig:...} argument. See sdk/tex.ts.
  const label = params.id ? `\n\\label{fig:${sanitizeLabelId(params.id)}}` : "";
  return [
    "\\begin{figure}[htbp]",
    "\\centering",
    children,
    `\\caption{${escapeTeX(params.caption)}}${label}`,
    "\\end{figure}",
  ].join("\n");
};
