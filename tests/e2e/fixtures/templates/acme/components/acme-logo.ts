import { type RenderCtx, escapeTeX } from "@druckform/core";
import { z } from "zod";

// Auto-discovered: the filename stem (`acme-logo`) must equal meta.name.
export const schema = z.object({ caption: z.string().default("ACMELOGO") });
export const meta = {
  name: "acme-logo",
  description: "Renders the template-bundled SVG asset (converted to PDF by the engine).",
  acceptsChildren: false,
  form: "leaf" as const,
};

export function render(params: { caption: string }, _children: string, ctx: RenderCtx): string {
  // ctx.asset resolves against the DEFINING template's directory and converts
  // .svg → .pdf via rsvg-convert. ctx.templateDir is the same directory.
  // The resolved path is engine-generated (not user input), so it is spliced raw;
  // the caption comes from the document and must be escaped.
  const pdf = ctx.asset("logo.svg");
  return [
    `\\par\\noindent\\includegraphics[width=1.5cm]{${pdf}}\\par`,
    `\\noindent ${escapeTeX(params.caption)}\\par`,
  ].join("\n");
}
