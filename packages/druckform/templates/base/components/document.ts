import { type BlockElement, type DocumentLayout, type RenderCtx, escapeTeX } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({});
export const meta = { name: "document", description: "Document shell", acceptsChildren: true };

// The shell owns everything AFTER the engine-core packages: it places the style
// and component preambles, opens/closes the document, and marks where the body
// goes. It does NOT emit \documentclass or the engine packages (fontspec,
// xcolor, graphicx, geometry, hyperref, ulem) — the composer injects those and
// they are not overrideable. Page size/margins come from tokens.page via the
// style preamble; a shell that wants different geometry calls \geometry{...}
// and never loads the geometry package again with options (that is an Option
// clash — doctor flags it).
//
// NOTE: do not spell the bracketed package-load form out in a comment here.
// doctor's geometry check scans raw component source, comments included, so
// writing it literally makes this file flag itself.

/** Title block, rendered only when a `title` is supplied. */
function titleBlock(fm: Record<string, string>): string[] {
  if (!fm.title) return [];
  const cover = fm.cover === "true";
  const out: string[] = [];
  if (cover) out.push("\\thispagestyle{empty}", "\\vspace*{\\fill}");
  out.push("\\begin{center}", `{\\Huge\\bfseries ${escapeTeX(fm.title)}\\par}`);
  if (fm.subtitle) out.push("\\vspace{0.5em}", `{\\Large ${escapeTeX(fm.subtitle)}\\par}`);
  if (fm.author) out.push("\\vspace{1.2em}", `{\\large ${escapeTeX(fm.author)}\\par}`);
  if (fm.date) out.push("\\vspace{0.3em}", `{\\large ${escapeTeX(fm.date)}\\par}`);
  out.push("\\end{center}");
  out.push(cover ? "\\vspace*{\\fill}" : "\\vspace{2em}");
  if (cover) out.push("\\clearpage");
  return out;
}

export function render(
  _params: unknown,
  _children: string,
  ctx: RenderCtx,
  element?: BlockElement | DocumentLayout,
): string {
  if (!element || element.kind !== "document") return "DRUCKFORM_BODY";
  const fm = ctx.frontmatter ?? {};
  const toc = fm.toc === "true" ? ["\\tableofcontents", "\\clearpage"] : [];
  return [
    element.stylePreamble,
    element.componentPreamble,
    "\\begin{document}",
    ...titleBlock(fm),
    ...toc,
    "DRUCKFORM_BODY",
    "\\end{document}",
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}
