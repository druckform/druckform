import fs from "node:fs";
import os from "node:os";
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
    // No bundled template ships a .component.yaml anymore (callout absorbed the
    // last one, `infobox`), so exercise the declarative-loader path via a
    // throwaway fixture instead of a real template file.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "druckform-declarative-"));
    const fixture = path.join(dir, "infobox.component.yaml");
    fs.writeFileSync(
      fixture,
      `
name: infobox
description: An info box
params:
  title:  { type: string, required: true }
  accent: { type: token,  required: false, default: accent }
slots:
  children: true
emits: |
  \\begin{infobox}{{{accent}}}{{{title}}}
  {{children}}
  \\end{infobox}
`,
    );

    const out = await renderComponent(
      fixture,
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
