import { type Component, type RenderCtx, sanitizeLabelId } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({});

export const meta = {
  name: "ref",
  description: "Inline cross-reference to a figure id, e.g. :ref[arch].",
  acceptsChildren: true,
  form: "inline" as const,
  example: "See :ref[arch] for the layout.",
};

// No preamble: \ref is a LaTeX built-in.
export const render: Component<typeof schema> = (
  _params,
  children: string,
  _ctx: RenderCtx,
): string => {
  // `children` arrives already escaped (see tokens-to-latex.ts's inline
  // dispatch) — sanitizeLabelId collapses that back to the same identifier
  // `figure` produces from the raw id, so the two labels agree. See sdk/tex.ts.
  return `\\ref{fig:${sanitizeLabelId(children)}}`;
};
