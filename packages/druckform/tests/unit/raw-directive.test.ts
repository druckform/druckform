import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { composeDocument } from "../../src/latex/composer.js";
import { mdToLatex } from "../../src/latex/md-to-latex.js";
import { parseMarkdownString } from "../../src/parse/parser.js";
import type { ResolvedTemplate, StyleConfig } from "../../src/sdk/types.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";
import { testCtx } from "../helpers/render-component.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const style: StyleConfig = { $schema: "style-v1", tokens: {} };
let template: ResolvedTemplate;
beforeAll(async () => {
  template = await resolveTemplate("base", loadAllTemplates(BUNDLED));
});

describe("raw directive", () => {
  it("emits a raw latex container verbatim (unescaped)", () => {
    const doc = parseMarkdownString(":::raw{format=latex}\n\\vspace{2cm} 100% & _x_\n:::\n");
    const { tex } = composeDocument(doc, template, style, new Map(), "/a");
    expect(tex).toContain("\\vspace{2cm} 100% & _x_"); // NOT escaped
  });
  it("skips a raw html container in the LaTeX pipeline", () => {
    const doc = parseMarkdownString(":::raw{format=html}\n<b>hi</b>\n:::\n");
    const { tex } = composeDocument(doc, template, style, new Map(), "/a");
    expect(tex).not.toContain("<b>hi</b>");
  });
  it("emits an inline raw latex span verbatim", () => {
    const out = mdToLatex(":raw[\\LaTeX{}]{format=latex}", {
      template,
      ctx: testCtx(),
      assetsRoot: "/a",
    });
    expect(out).toContain("\\LaTeX{}");
  });
  it("throws a clear error for an unregistered block directive name", () => {
    const doc = parseMarkdownString(":::nosuch{}\nx\n:::\n");
    expect(() => composeDocument(doc, template, style, new Map(), "/a")).toThrow(/nosuch/);
  });
});
