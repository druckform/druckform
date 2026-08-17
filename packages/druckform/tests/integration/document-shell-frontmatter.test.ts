import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DocumentLayout } from "../../src/sdk/types.js";
import { renderComponent } from "../helpers/render-component.js";

const SHELL = path.resolve(import.meta.dirname, "../../templates/base/components/document.ts");

const layout: DocumentLayout = {
  kind: "document",
  documentclass: "article",
  stylePreamble: "%STYLE",
  componentPreamble: "%COMPONENTS",
  frontmatter: {},
};

const render = (frontmatter: Record<string, string>) =>
  renderComponent(SHELL, {}, { element: { ...layout, frontmatter }, ctx: { frontmatter } });

describe("base document shell", () => {
  it("emits no title block when there is no title", async () => {
    const out = await render({});
    expect(out).not.toContain("\\Huge");
    expect(out).toContain("DRUCKFORM_BODY");
  });

  it("renders a title block when title is present", async () => {
    const out = await render({ title: "Q3 Review" });
    expect(out).toContain("Q3 Review");
    expect(out).toContain("\\Huge");
  });

  it("includes subtitle, author and date when present", async () => {
    const out = await render({
      title: "T",
      subtitle: "Sub",
      author: "Ada",
      date: "2026-08-17",
    });
    for (const s of ["Sub", "Ada", "2026-08-17"]) expect(out).toContain(s);
  });

  it("escapes frontmatter values", async () => {
    expect(await render({ title: "R&D 50%" })).toContain("R\\&D 50\\%");
  });

  // Frontmatter arrives as strings: parser.ts coerces with String(v).
  it('puts the title on its own page when cover is "true"', async () => {
    expect(await render({ title: "T", cover: "true" })).toContain("\\clearpage");
  });

  it("does not clearpage when cover is absent", async () => {
    expect(await render({ title: "T" })).not.toContain("\\clearpage");
  });

  it('emits a TOC when toc is "true"', async () => {
    expect(await render({ title: "T", toc: "true" })).toContain("\\tableofcontents");
  });

  it("omits the TOC by default — a one-page memo must not sprout one", async () => {
    expect(await render({ title: "T" })).not.toContain("\\tableofcontents");
  });

  it("never emits documentclass or a geometry package load", async () => {
    const out = await render({ title: "T" });
    expect(out).not.toContain("\\documentclass");
    expect(out).not.toMatch(/usepackage\[[^\]]*\]\{geometry\}/);
  });
});
