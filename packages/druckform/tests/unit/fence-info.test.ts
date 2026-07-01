import { describe, expect, it } from "vitest";
import { parseMaxHeightFraction } from "../../src/diagram/fence-info.js";

describe("parseMaxHeightFraction", () => {
  it("parses maxheight=<n> into a \\textheight fraction", () => {
    expect(parseMaxHeightFraction("maxheight=0.5")).toBe("0.5\\textheight");
    expect(parseMaxHeightFraction(" maxheight=0.82 ")).toBe("0.82\\textheight");
    expect(parseMaxHeightFraction("maxheight=1")).toBe("1\\textheight");
  });
  it("returns undefined for absent/malformed values", () => {
    expect(parseMaxHeightFraction("")).toBeUndefined();
    expect(parseMaxHeightFraction(null)).toBeUndefined();
    expect(parseMaxHeightFraction(undefined)).toBeUndefined();
    expect(parseMaxHeightFraction("maxheight=")).toBeUndefined();
    expect(parseMaxHeightFraction("maxheight=big")).toBeUndefined();
  });
});
