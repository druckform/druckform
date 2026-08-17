import { describe, expect, it } from "vitest";
import { mergeStyle } from "../../src/style/merge.js";

describe("mergeStyle", () => {
  it("deep-merges tokens with over winning per key", () => {
    const base = {
      $schema: "style-v1",
      tokens: { colors: { accent: "#111111", warning: "#222222" } },
    };
    const over = {
      $schema: "style-v1",
      tokens: { colors: { accent: "#999999" }, spacing: { gap: "1em" } },
    };
    expect(mergeStyle(base, over)).toEqual({
      $schema: "style-v1",
      tokens: {
        colors: { accent: "#999999", warning: "#222222" },
        fonts: {},
        spacing: { gap: "1em" },
        page: {},
      },
    });
  });

  it("returns a normalized empty style when both are undefined", () => {
    expect(mergeStyle(undefined, undefined)).toEqual({
      $schema: "style-v1",
      tokens: { colors: {}, fonts: {}, spacing: {}, page: {} },
    });
  });
});

describe("mergeStyle: page tokens", () => {
  it("keeps page tokens from the base style", () => {
    const base = { $schema: "style-v1", tokens: { page: { size: "a4" as const } } };
    expect(mergeStyle(base, undefined).tokens.page).toEqual({ size: "a4" });
  });

  it("keeps page tokens supplied only by the override", () => {
    const over = { $schema: "style-v1", tokens: { page: { margin: "3cm" } } };
    expect(mergeStyle(undefined, over).tokens.page).toEqual({ margin: "3cm" });
  });

  it("merges per key, override winning", () => {
    const base = { $schema: "style-v1", tokens: { page: { size: "a4" as const, margin: "2cm" } } };
    const over = { $schema: "style-v1", tokens: { page: { margin: "3cm" } } };
    expect(mergeStyle(base, over).tokens.page).toEqual({ size: "a4", margin: "3cm" });
  });
});
