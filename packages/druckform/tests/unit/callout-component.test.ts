import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const SRC = path.resolve(import.meta.dirname, "../../templates/report/components/callout.ts");

describe("callout variants map to distinct colour tokens", () => {
  it.each([
    ["info", "\\druckAccent"],
    ["tip", "\\druckAccent"],
    ["warn", "\\druckWarning"],
    ["danger", "\\druckDanger"],
  ])("variant %s uses %s", async (variant, expected) => {
    const out = await renderComponent(SRC, { variant, title: "T" }, { children: "body" });
    expect(out).toContain(expected);
  });

  // Regression: the old two-branch conditional sent everything except `warn` to
  // accent, so `danger` rendered identically to `info` and silently did nothing.
  it("danger is visually distinct from info", async () => {
    const danger = await renderComponent(SRC, { variant: "danger", title: "T" });
    const info = await renderComponent(SRC, { variant: "info", title: "T" });
    expect(danger).not.toBe(info);
  });
});

describe("callout accepts infobox's accent parameter", () => {
  it("an explicit accent overrides the variant colour", async () => {
    const out = await renderComponent(
      SRC,
      { variant: "info", title: "T", accent: "warning" },
      { children: "body" },
    );
    expect(out).toContain("\\druckWarning");
  });

  it("escapes the title", async () => {
    const out = await renderComponent(SRC, { title: "50% & rising" });
    expect(out).toContain("50\\% \\& rising");
  });
});
