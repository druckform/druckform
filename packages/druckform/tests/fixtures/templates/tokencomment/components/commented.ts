import { type RenderCtx, Tex, raw } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({ title: z.string() });
export const meta = {
  name: "commented",
  description: "mentions a token call in prose only",
  acceptsChildren: false,
  requiredTokens: ["accent"],
  example: '::commented{title="Hi"}',
};

/*
 * A block comment that mentions ctx.token("critical") while explaining
 * something. It is prose, not a call, and must not be reported.
 */
export function render(params: { title: string }, _children: string, ctx: RenderCtx): string {
  // Also inert in a line comment: ctx.token("bogus") and tokenRef("alsoBogus").
  const url = "https://example.com/docs#ctx.token"; // a string containing // and a token-ish word
  void url;
  return Tex`${raw(ctx.token("accent"))}{${params.title}}`;
}
