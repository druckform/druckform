import { Tex, raw } from "@druckform/core";
import type { Component, RenderCtx } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({
  variant: z.enum(["info", "tip", "warn", "danger"]).default("info"),
  title: z.string(),
  /** Explicit style-token name, overriding the variant's colour. Absorbed from
   *  the former `infobox` component so `:::infobox{accent="warning"}` keeps
   *  working when infobox is registered as an alias of this component. */
  accent: z.string().optional(),
});

export const meta = {
  name: "callout",
  description: "Variant-styled callout box with a title.",
  acceptsChildren: true,
  example: ':::callout{variant="warn" title="Heads up"}\nBody\n:::',
  requiredTokens: ["accent", "warning", "danger"],
};

export const preamble = `\\newenvironment{callout}[2]{%
  \\par\\vspace{0.5em}%
  \\noindent{\\leavevmode#1\\bfseries#2}\\par
  \\noindent\\rule{\\linewidth}{0.5pt}\\par\\smallskip
  \\noindent\\ignorespaces
}{%
  \\par\\vspace{0.5em}%
}`;

const VARIANT_TOKEN: Record<string, string> = {
  info: "accent",
  tip: "accent",
  warn: "warning",
  danger: "danger",
};

export const render: Component<typeof schema> = (params, children, ctx: RenderCtx) => {
  const tokenName = params.accent ?? VARIANT_TOKEN[params.variant] ?? "accent";
  const color = ctx.token(tokenName);
  return Tex`\begin{callout}{${raw(color)}}{${params.title}}
${raw(children)}
\end{callout}`;
};
