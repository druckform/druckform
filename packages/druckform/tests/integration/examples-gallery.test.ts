import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const DIR = path.resolve(import.meta.dirname, "../../templates/examples/components");

describe("examples gallery", () => {
  it("fancy-table renders a tabularx from a table element", async () => {
    const out = await renderComponent(
      path.join(DIR, "fancy-table.ts"),
      {},
      {
        element: {
          kind: "table",
          alignments: ["left", "right"],
          header: ["A", "B"],
          rows: [["1", "2"]],
        },
      },
    );
    expect(out).toContain("\\begin{tabularx}");
  });
});
