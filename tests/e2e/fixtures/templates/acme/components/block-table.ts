import type { BlockElement, RenderCtx } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({});
export const meta = {
  name: "block:table",
  description: "Acme table — accent-ruled, with a row count caption.",
  acceptsChildren: false,
  // Declared explicitly: the token is read via ctx.token(), not via a param, so
  // the loader cannot derive it. Token coverage is checked before LaTeX runs, so
  // this fails the render if the merged style is missing `acme`.
  requiredTokens: ["acme"],
};
export const preamble = "\\usepackage{booktabs}";

export function render(
  _params: unknown,
  _children: string,
  ctx: RenderCtx,
  element?: BlockElement,
): string {
  if (!element || element.kind !== "table") return "";
  const cols = element.alignments
    .map((a) => (a === "center" ? "c" : a === "right" ? "r" : "l"))
    .join("");
  const header = `${element.header.map((c) => `\\textbf{${c}}`).join(" & ")} \\\\`;
  const body = element.rows.map((r) => `${r.join(" & ")} \\\\`).join("\n");
  return [
    `{${ctx.token("acme")}\\rule{\\linewidth}{1pt}}\\par`,
    `\\begin{tabular}{${cols}}`,
    "\\toprule",
    header,
    "\\midrule",
    body,
    "\\bottomrule",
    "\\end{tabular}",
    `\\par\\small ACMETABLE rows=${element.rows.length}`,
  ].join("\n");
}
