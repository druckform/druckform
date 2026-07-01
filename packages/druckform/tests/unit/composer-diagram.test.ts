import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { composeDocument } from "../../src/latex/composer.js";
import { parseMarkdownString } from "../../src/parse/parser.js";
import type { ResolvedTemplate, StyleConfig } from "../../src/sdk/types.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const style: StyleConfig = { $schema: "style-v1", tokens: { colors: { accent: "#111111" } } };
let template: ResolvedTemplate;

beforeAll(async () => {
  template = await resolveTemplate("base", loadAllTemplates(BUNDLED));
});

describe("composer diagram substitution", () => {
  it("substitutes a fence with a height-capped include (default macro, no leaked placeholder)", () => {
    const doc = parseMarkdownString("Intro\n\n```mermaid\ngraph TD; A-->B\n```\n");
    const fence = "```mermaid\ngraph TD; A-->B\n```";
    const diagramMap = new Map([[fence, { pdfPath: "/tmp/mermaid-0.pdf" }]]);

    const { tex } = composeDocument(doc, template, style, diagramMap, "/a");

    expect(tex).toContain(
      "\\includegraphics[width=\\linewidth,height=\\druckDiagramMaxHeight,keepaspectratio]{/tmp/mermaid-0.pdf}",
    );
    expect(tex).toContain("\\newcommand{\\druckDiagramMaxHeight}{0.82\\textheight}");
    expect(tex).toContain("\\newcommand{\\druckImageMaxHeight}{0.82\\textheight}");
    expect(tex).not.toMatch(/DRUCKFORM\\?_?DIAGRAM/);
  });

  it("uses a per-diagram maxHeight when provided", () => {
    const doc = parseMarkdownString("```mermaid\ngraph TD; A-->B\n```\n");
    const fence = "```mermaid\ngraph TD; A-->B\n```";
    const diagramMap = new Map([[fence, { pdfPath: "/tmp/m.pdf", maxHeight: "0.5\\textheight" }]]);

    const { tex } = composeDocument(doc, template, style, diagramMap, "/a");

    expect(tex).toContain(
      "\\includegraphics[width=\\linewidth,height=0.5\\textheight,keepaspectratio]{/tmp/m.pdf}",
    );
  });

  it("substitutes multiple diagrams independently", () => {
    const doc = parseMarkdownString(
      "```mermaid\ngraph TD; A-->B\n```\n\nmiddle\n\n```mermaid\ngraph TD; C-->D\n```\n",
    );
    const diagramMap = new Map([
      ["```mermaid\ngraph TD; A-->B\n```", { pdfPath: "/tmp/mermaid-0.pdf" }],
      ["```mermaid\ngraph TD; C-->D\n```", { pdfPath: "/tmp/mermaid-1.pdf" }],
    ]);

    const { tex } = composeDocument(doc, template, style, diagramMap, "/a");

    expect(tex).toContain("{/tmp/mermaid-0.pdf}");
    expect(tex).toContain("{/tmp/mermaid-1.pdf}");
    expect(tex).not.toMatch(/DRUCKFORM\\?_?DIAGRAM/);
  });
});
