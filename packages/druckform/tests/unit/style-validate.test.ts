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

// FontSpec is `string | { name, options? }` (sdk/types.ts), the compiler emits
// \setmainfont{name}[options] for the object form, and extending-druckform.md
// §4.1 documents it — but the schema only allowed a bare string, so a style file
// using the documented form failed to load with "/tokens/fonts/main must be
// string".
describe("style schema: fonts accept the FontSpec object form", () => {
  it("accepts a bare font name", () => {
    const p = writeStyle({
      $schema: "style-v1",
      tokens: { fonts: { main: "Liberation Serif", mono: "Liberation Mono" } },
    });
    expect(loadStyle(p).tokens.fonts?.main).toBe("Liberation Serif");
  });

  it("accepts { name, options } for fontspec options", () => {
    const p = writeStyle({
      $schema: "style-v1",
      tokens: { fonts: { main: { name: "Noto Sans", options: "AutoFakeBold=2.2" } } },
    });
    expect(loadStyle(p).tokens.fonts?.main).toEqual({
      name: "Noto Sans",
      options: "AutoFakeBold=2.2",
    });
  });

  it("accepts { name } with no options", () => {
    const p = writeStyle({
      $schema: "style-v1",
      tokens: { fonts: { mono: { name: "JetBrains Mono" } } },
    });
    expect(loadStyle(p).tokens.fonts?.mono).toEqual({ name: "JetBrains Mono" });
  });

  it("rejects an object without a name", () => {
    const p = writeStyle({
      $schema: "style-v1",
      tokens: { fonts: { main: { options: "AutoFakeBold=2.2" } } },
    });
    expect(() => loadStyle(p)).toThrow(/Invalid style\.yaml/);
  });

  it("rejects an unknown key inside the font object", () => {
    const p = writeStyle({
      $schema: "style-v1",
      tokens: { fonts: { main: { name: "Noto Sans", weight: "bold" } } },
    });
    expect(() => loadStyle(p)).toThrow(/Invalid style\.yaml/);
  });
});

describe("style schema: page tokens", () => {
  it("accepts a4 with a uniform margin", () => {
    const p = writeStyle({
      $schema: "style-v1",
      tokens: { page: { size: "a4", margin: "2.5cm" } },
    });
    expect(loadStyle(p).tokens.page).toEqual({ size: "a4", margin: "2.5cm" });
  });

  it("accepts letter and per-side margins", () => {
    const p = writeStyle({
      $schema: "style-v1",
      tokens: { page: { size: "letter", top: "3cm", bottom: "2cm" } },
    });
    expect(loadStyle(p).tokens.page?.size).toBe("letter");
  });

  it("rejects an unknown paper size rather than falling back", () => {
    const p = writeStyle({ $schema: "style-v1", tokens: { page: { size: "a5" } } });
    expect(() => loadStyle(p)).toThrow(/Invalid style\.yaml/);
  });

  it("rejects an unknown key inside page", () => {
    const p = writeStyle({ $schema: "style-v1", tokens: { page: { bleed: "3mm" } } });
    expect(() => loadStyle(p)).toThrow(/Invalid style\.yaml/);
  });
});
