import { describe, expect, it } from "vitest";
import { parseDirectiveAttributes } from "../../src/parse/directive-attrs.js";

describe("parseDirectiveAttributes", () => {
  it("parses #id and .class per micromark rules", () => {
    expect(parseDirectiveAttributes("#foo .a .b")).toEqual({ id: "foo", class: "a b" });
  });
  it("last id wins; classes combine", () => {
    expect(parseDirectiveAttributes("#one #two .x")).toEqual({ id: "two", class: "x" });
  });
  it("parses key=val, quoted, and bare keys", () => {
    expect(parseDirectiveAttributes('title="Key Finding" accent=accent flag')).toEqual({
      title: "Key Finding",
      accent: "accent",
      flag: "true",
    });
  });
  it("handles single quotes and mixed with id/class", () => {
    expect(parseDirectiveAttributes("#h .warn title='Heads up'")).toEqual({
      id: "h",
      class: "warn",
      title: "Heads up",
    });
  });
  it("returns {} for empty input", () => {
    expect(parseDirectiveAttributes("")).toEqual({});
    expect(parseDirectiveAttributes("   ")).toEqual({});
  });
});
