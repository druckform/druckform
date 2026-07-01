import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadStyle } from "../../src/style/validate.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "df-style-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function writeStyle(obj: unknown): string {
  const p = path.join(dir, "style.json");
  fs.writeFileSync(p, JSON.stringify(obj), "utf8");
  return p;
}

describe("style schema: mermaid.themeVariables", () => {
  it("accepts an inline themeVariables object", () => {
    const p = writeStyle({
      $schema: "style-v1",
      tokens: {},
      diagrams: {
        mermaid: {
          theme: "base",
          themeVariables: { primaryColor: "#FFE7D1", lineColor: "#FF6b00" },
        },
      },
    });
    const cfg = loadStyle(p);
    expect(cfg.diagrams?.mermaid?.themeVariables?.primaryColor).toBe("#FFE7D1");
  });

  it("still accepts themeVariablesRef", () => {
    const p = writeStyle({
      $schema: "style-v1",
      tokens: {},
      diagrams: { mermaid: { themeVariablesRef: "brand.json" } },
    });
    expect(loadStyle(p).diagrams?.mermaid?.themeVariablesRef).toBe("brand.json");
  });
});
