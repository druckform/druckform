import type { BlockElement, DocumentLayout, RenderCtx } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "document", description: "custom shell", acceptsChildren: true };

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement | DocumentLayout,
): string {
  if (!element || element.kind !== "document") return "DRUCKFORM_BODY";
  return [
    "%CUSTOMDOC",
    element.stylePreamble,
    element.componentPreamble,
    // Bare \geometry, not a bracketed \usepackage load: the engine core
    // already loads the geometry package, and loading it twice with options
    // is an Option clash.
    "\\geometry{a4paper}",
    "\\begin{document}",
    "DRUCKFORM_BODY",
    "\\end{document}",
  ].join("\n");
}
