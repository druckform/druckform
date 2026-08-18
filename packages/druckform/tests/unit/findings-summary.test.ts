import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadComponent } from "../../src/component/loader.js";
import { renderComponent } from "../helpers/render-component.js";

const SRC = path.resolve(
  import.meta.dirname,
  "../../templates/consulting/components/findings-summary.component.yaml",
);

describe("findings-summary", () => {
  it("emits the list command", async () => {
    expect(await renderComponent(SRC)).toContain("\\listoffindings");
  });

  it("defines the machinery finding depends on", async () => {
    const def = await loadComponent(SRC, "");
    const preamble = def.preamble ?? "";
    // finding writes \protect\findingentry{...}; \@starttoc{fnd} reads entries
    // back through \l@finding. Both must exist or the index fails to compile.
    expect(preamble).toContain("\\findingentry");
    expect(preamble).toContain("\\l@finding");
    expect(preamble).toContain("\\listoffindings");
    // \@ names require the catcode change around them.
    expect(preamble).toContain("\\makeatletter");
    expect(preamble).toContain("\\makeatother");
  });

  it("adds no LaTeX package", async () => {
    const def = await loadComponent(SRC, "");
    expect(def.preamble ?? "").not.toContain("usepackage");
  });
});
