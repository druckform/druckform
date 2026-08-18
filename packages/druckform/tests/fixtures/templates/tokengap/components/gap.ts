import type { Component, RenderCtx } from "@druckform/core";
import { Tex, raw } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({ title: z.string() });

export const meta = {
  name: "gap",
  description: "Requires a token that no bundled style (including base) defines.",
  acceptsChildren: false,
  requiredTokens: ["brand-highlight"],
};

export const render: Component<typeof schema> = (params, _children, ctx: RenderCtx) => {
  return Tex`{${raw(ctx.token("brand-highlight"))}${params.title}}`;
};
