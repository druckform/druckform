import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const dir = path.resolve(import.meta.dirname, "../../templates/consulting/components");
const at = (f: string) => path.join(dir, f);

describe("exec-summary", () => {
  it("defaults its heading", async () => {
    const out = await renderComponent(
      at("exec-summary.component.yaml"),
      {},
      {
        children: "The engagement found three issues.",
      },
    );
    expect(out).toContain("Executive Summary");
    expect(out).toContain("The engagement found three issues.");
  });

  it("accepts a custom title and escapes it", async () => {
    const out = await renderComponent(at("exec-summary.component.yaml"), {
      title: "Summary & Scope",
    });
    expect(out).toContain("Summary \\& Scope");
  });

  // A colour macro immediately followed by a letter glues into one undefined
  // control word. This is the bug class that broke pullquote.
  it("terminates the colour macro before any letter", async () => {
    const out = await renderComponent(at("exec-summary.component.yaml"), {});
    expect(out).not.toMatch(/\\druckAccent[A-Za-z]/);
    expect(out).toContain("\\druckAccent\\rule");
  });
});

describe("appendix", () => {
  it("emits the appendix switch", async () => {
    expect(await renderComponent(at("appendix.component.yaml"))).toContain("\\appendix");
  });
});
