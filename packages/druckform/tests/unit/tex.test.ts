import { describe, expect, it } from "vitest";
import { Tex, escapeTeX, raw, sanitizeLabelId } from "../../src/sdk/tex.js";

describe("escapeTeX", () => {
  it("escapes all 10 TeX special characters", () => {
    expect(escapeTeX("& % _ # $ { } ~ ^ \\")).toBe(
      "\\& \\% \\_ \\# \\$ \\{ \\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}",
    );
  });

  it("leaves safe text unchanged", () => {
    expect(escapeTeX("hello world 123")).toBe("hello world 123");
  });

  it("handles empty string", () => {
    expect(escapeTeX("")).toBe("");
  });
});

describe("Tex", () => {
  it("escapes interpolated strings", () => {
    const title = "Report & Summary";
    expect(Tex`\textbf{${title}}`).toBe("\\textbf{Report \\& Summary}");
  });

  it("inserts raw() values without escaping", () => {
    const macro = "\\accentcolor";
    expect(Tex`\color{${raw(macro)}}{text}`).toBe("\\color{\\accentcolor}{text}");
  });

  it("handles mixed escaped and raw values", () => {
    const user = "100%";
    const token = "\\warningColor";
    expect(Tex`${user} ${raw(token)}`).toBe("100\\% \\warningColor");
  });
});

describe("sanitizeLabelId", () => {
  // The whole point of this function: the defining side sanitises the raw id
  // while the referencing side sanitises the already-escaped id, and the two
  // must agree byte-for-byte or LaTeX silently renders "??".
  it.each([
    "F-01",
    "F_01",
    "acme_prod_2026",
    "F&1",
    "100%x",
    "a#b",
    "c$d",
    "e{f}g",
    "F 1",
    // ~ ^ and \\ are the three whose escapeTeX replacement spells the
    // character as a word of safe letters, so they diverged until the word
    // was erased first. Each shipped a silent "??" before that.
    "F~01",
    "F^1",
    "F\\1",
  ])("agrees between the raw and escaped sides for %j", (id) => {
    expect(sanitizeLabelId(escapeTeX(id))).toBe(sanitizeLabelId(id));
  });

  it("still yields a usable label for the word-escaped characters", () => {
    expect(sanitizeLabelId("F~01")).toBe("F-01");
    expect(sanitizeLabelId("F^1")).toBe("F-1");
    expect(sanitizeLabelId("F\\1")).toBe("F-1");
  });
});
