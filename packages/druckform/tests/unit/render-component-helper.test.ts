import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent, testCtx } from "../helpers/render-component.js";

const DIR = path.resolve(import.meta.dirname, "../../templates/base/components");

describe("renderComponent helper", () => {
  it("loads + renders a block component in one call", async () => {
    const out = await renderComponent(
      path.join(DIR, "block-heading.ts"),
      {},
      {
        children: "Title",
        element: { kind: "heading", level: 1 },
      },
    );
    expect(out).toBe("\\section{Title}");
  });

  it("renders a declarative component, resolving token params via ctx", async () => {
    const out = await renderComponent(
      path.join(DIR, "infobox.component.yaml"),
      { title: "Note" },
      {
        children: "Body",
      },
    );
    expect(out).toContain("\\begin{infobox}");
    expect(out).toContain("Body");
  });

  it("testCtx applies frontmatter overrides", () => {
    expect(testCtx({ frontmatter: { title: "X" } }).frontmatter.title).toBe("X");
  });
});
