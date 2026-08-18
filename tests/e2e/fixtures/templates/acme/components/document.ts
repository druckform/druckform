import { type BlockElement, type DocumentLayout, type RenderCtx, escapeTeX } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({});
export const meta = {
  name: "document",
  description: "Acme document shell — title block from frontmatter + bundled logo.",
  acceptsChildren: true,
};

export function render(
  _params: unknown,
  _children: string,
  ctx: RenderCtx,
  element?: BlockElement | DocumentLayout,
): string {
  if (!element || element.kind !== "document") return "DRUCKFORM_BODY";
  // Bundled asset lives beside template.yaml; .svg is auto-converted to PDF.
  const logo = ctx.asset("logo.svg");
  const title = escapeTeX(ctx.frontmatter?.title ?? "");
  const subtitle = escapeTeX(ctx.frontmatter?.subtitle ?? "");
  return [
    element.stylePreamble,
    element.componentPreamble,
    // Bare \geometry, not a bracketed \usepackage load: the engine core
    // already loads the geometry package, and loading it twice with options
    // is an Option clash.
    "\\geometry{margin=2.2cm}",
    "\\begin{document}",
    `\\includegraphics[width=2cm]{${logo}}\\par`,
    `{\\Huge\\bfseries ${title}}\\par`,
    `{\\large ${subtitle}}\\par`,
    "\\vspace{1em}",
    "DRUCKFORM_BODY",
    "\\end{document}",
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}
