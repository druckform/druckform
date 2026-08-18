import { describe, expect, it } from "vitest";
import { GEOMETRY_CLASH } from "../../src/commands/doctor.js";

describe("GEOMETRY_CLASH", () => {
  it.each([
    ["basic single-backslash form", "\\usepackage[a4paper]{geometry}"],
    ["TS-source double-backslash form", "\\\\usepackage[a4paper]{geometry}"],
    ["multi-package brace group", "\\usepackage[a4paper]{geometry,fancyhdr}"],
    ["multi-package brace group, geometry not first", "\\usepackage[a4paper]{fancyhdr,geometry}"],
    ["RequirePackage form", "\\RequirePackage[a4paper]{geometry}"],
    ["whitespace before the option group", "\\usepackage [a4paper]{geometry}"],
  ])("flags %s", (_label, src) => {
    expect(GEOMETRY_CLASH.test(src)).toBe(true);
  });

  it("does not flag a bare \\geometry{...} call", () => {
    expect(GEOMETRY_CLASH.test("\\geometry{a4paper}")).toBe(false);
  });

  it("does not flag an unrelated bracketed usepackage", () => {
    expect(GEOMETRY_CLASH.test("\\usepackage[normalem]{ulem}")).toBe(false);
  });
});
