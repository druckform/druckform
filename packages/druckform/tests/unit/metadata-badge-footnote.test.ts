import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const dir = path.resolve(import.meta.dirname, "../../templates/base/components");
const at = (f: string) => path.join(dir, f);

describe("metadata", () => {
  it("renders key/value pairs as a two-column table", async () => {
    const out = await renderComponent(at("metadata.ts"), {
      pairs: "Client=Acme GmbH; Date=2026-08-17",
    });
    expect(out).toContain("\\begin{tabular}");
    expect(out).toContain("Client");
    expect(out).toContain("Acme GmbH");
    expect(out).toContain("2026-08-17");
  });

  it("escapes both keys and values", async () => {
    const out = await renderComponent(at("metadata.ts"), { pairs: "R&D=50%" });
    expect(out).toContain("R\\&D");
    expect(out).toContain("50\\%");
  });

  it("ignores empty segments from a trailing separator", async () => {
    const out = await renderComponent(at("metadata.ts"), { pairs: "A=1;" });
    expect(out.match(/\\\\/g) ?? []).toHaveLength(1);
  });
});

describe("badge", () => {
  it("renders an inline coloured label", async () => {
    const out = await renderComponent(at("badge.component.yaml"), {}, { children: "DRAFT" });
    expect(out).toContain("DRAFT");
    expect(out).not.toContain("\\par");
  });

  it("puts both brackets in the same colour scope (M10)", async () => {
    // Before the fix, `[` sat before the colour switch (body colour) and `]`
    // sat after it (accent colour) — inconsistent. Both must now follow the
    // colour macro, inside the same \textbf{...} group.
    const out = await renderComponent(at("badge.component.yaml"), {}, { children: "DRAFT" });
    expect(out).toBe("\\textbf{\\druckAccent{}[\\,DRAFT\\,]}");
  });
});

describe("footnote", () => {
  it("emits a LaTeX footnote", async () => {
    const out = await renderComponent(
      at("footnote.component.yaml"),
      {},
      {
        children: "Measured on 2026-08-17.",
      },
    );
    expect(out).toContain("\\footnote{Measured on 2026-08-17.}");
  });
});
