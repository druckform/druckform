import { type Component, type RenderCtx, escapeTeX } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({
  /** Semicolon-separated `term=definition` pairs. */
  pairs: z.string(),
});

export const meta = {
  name: "deflist",
  description: "Definition list of term/definition pairs.",
  acceptsChildren: false,
  form: "leaf" as const,
  example: '::deflist{pairs="Token=A named style value; Template=A named set of components"}',
};

// `description` is a LaTeX built-in; no package needed.
export const render: Component<typeof schema> = (params, _children, _ctx: RenderCtx) => {
  const items = params.pairs
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const eq = pair.indexOf("=");
      const term = eq >= 0 ? pair.slice(0, eq) : pair;
      const definition = eq >= 0 ? pair.slice(eq + 1) : "";
      return `\\item[${escapeTeX(term.trim())}] ${escapeTeX(definition.trim())}`;
    });
  return ["\\begin{description}", ...items, "\\end{description}"].join("\n");
};
