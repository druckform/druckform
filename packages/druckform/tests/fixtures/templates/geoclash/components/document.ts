import type { BlockElement, DocumentLayout, RenderCtx } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "document", description: "clashing shell", acceptsChildren: true };

export function render(
  _params: unknown,
  _children: string,
  _ctx: RenderCtx,
  element?: BlockElement | DocumentLayout,
): string {
  if (!element || element.kind !== "document") return "DRUCKFORM_BODY";
  return [
    element.stylePreamble,
    element.componentPreamble,
    "\\usepackage[a4paper,margin=2cm]{geometry}",
    "\\begin{document}",
    "DRUCKFORM_BODY",
    "\\end{document}",
  ].join("\n");
}
