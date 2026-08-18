import path from "node:path";
import { describe, expect, it } from "vitest";
import { escapeTeX } from "../../src/sdk/tex.js";
import { renderComponent } from "../helpers/render-component.js";

const FIGURE = path.resolve(import.meta.dirname, "../../templates/base/components/figure.ts");
const REF = path.resolve(import.meta.dirname, "../../templates/base/components/ref.ts");

describe("figure", () => {
  it("wraps children in a figure environment with a caption", async () => {
    const out = await renderComponent(
      FIGURE,
      { caption: "System overview" },
      {
        children: "\\includegraphics{x.pdf}",
      },
    );
    expect(out).toContain("\\begin{figure}");
    expect(out).toContain("\\caption{System overview}");
    expect(out).toContain("\\includegraphics{x.pdf}");
    expect(out).toContain("\\end{figure}");
  });

  it("emits a label only when an id is given", async () => {
    const withId = await renderComponent(FIGURE, { caption: "C", id: "arch" });
    expect(withId).toContain("\\label{fig:arch}");
    const without = await renderComponent(FIGURE, { caption: "C" });
    expect(without).not.toContain("\\label");
  });

  it("escapes the caption", async () => {
    const out = await renderComponent(FIGURE, { caption: "100% & more" });
    expect(out).toContain("100\\% \\& more");
  });
});

describe("ref", () => {
  it("references a figure label", async () => {
    const out = await renderComponent(REF, {}, { children: "arch" });
    expect(out).toContain("\\ref{fig:arch}");
  });

  it("agrees with figure's label for an id containing an underscore", async () => {
    // `figure` receives the raw id (attribute values are unescaped); `ref`
    // receives its bracket content already escaped by the inline renderer
    // (see tokens-to-latex.ts). Both must sanitise to the same fig: label.
    const id = "system_overview";
    const figureOut = await renderComponent(FIGURE, { caption: "C", id });
    const refOut = await renderComponent(REF, {}, { children: escapeTeX(id) });

    const figureLabel = figureOut.match(/\\label\{(fig:[^}]+)\}/)?.[1];
    const refLabel = refOut.match(/\\ref\{(fig:[^}]+)\}/)?.[1];

    expect(figureLabel).toBeDefined();
    expect(refLabel).toBeDefined();
    expect(refLabel).toBe(figureLabel);
  });
});
