import { type Component, type RenderCtx, Tex, raw, sanitizeLabelId } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({
  /** Label namespace. Each template family that introduces a referenceable
   *  thing extends this enum. It is an enum rather than a free string on
   *  purpose: a typo'd kind would emit a dangling \ref, which LaTeX renders
   *  as "??" with a warning rather than an error. */
  kind: z.enum(["fig", "finding"]).default("fig"),
});

export const meta = {
  name: "ref",
  description: "Inline cross-reference, e.g. :ref[arch] or :ref[F-01]{kind=finding}.",
  acceptsChildren: true,
  form: "inline" as const,
  example: "See :ref[arch] for the layout.",
};

// No preamble: \ref is a LaTeX built-in.
export const render: Component<typeof schema> = (
  params,
  children: string,
  _ctx: RenderCtx,
): string => {
  // `children` arrives already escaped (see tokens-to-latex.ts's inline
  // dispatch) — sanitizeLabelId collapses that back to the same identifier
  // `figure` produces from the raw id, so the two labels agree. See sdk/tex.ts.
  // Both interpolations are wrapped in raw(): `kind` is zod-enum-restricted
  // (never free text) and sanitizeLabelId already stripped children down to
  // a safe charset, so escaping again would be redundant, not safer.
  return Tex`\ref{${raw(params.kind)}:${raw(sanitizeLabelId(children))}}`;
};
