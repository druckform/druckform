import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";
import { testCtx } from "../helpers/render-component.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");

async function renderNamed(template: string, name: string, params: Record<string, unknown>) {
  const all = loadAllTemplates(BUNDLED, undefined);
  const resolved = await resolveTemplate(template, all);
  const entry = resolved.components[name];
  if (!entry) throw new Error(`no component '${name}' in '${template}'`);
  return entry.def.render({ ...entry.defaults, ...params }, "body", testCtx());
}

describe("admonition family in base", () => {
  it.each([
    ["note", "\\druckAccent"],
    ["tip", "\\druckAccent"],
    ["warning", "\\druckWarning"],
    ["danger", "\\druckDanger"],
  ])("%s renders with %s", async (name, expected) => {
    expect(await renderNamed("base", name, { title: "T" })).toContain(expected);
  });

  it("all aliases share one implementation", async () => {
    const all = loadAllTemplates(BUNDLED, undefined);
    const resolved = await resolveTemplate("base", all);
    const paths = ["callout", "note", "tip", "warning", "danger", "infobox"].map(
      (n) => resolved.components[n]?.sourcePath,
    );
    expect(new Set(paths).size).toBe(1);
  });

  // Back-compat: zod strips unknown keys rather than erroring, so if callout did
  // not accept `accent` this would render in the WRONG COLOUR with no error.
  it("infobox still honours accent=", async () => {
    expect(await renderNamed("base", "infobox", { title: "T", accent: "warning" })).toContain(
      "\\druckWarning",
    );
  });

  it("report's infobox default of accent=warning survives", async () => {
    expect(await renderNamed("report", "infobox", { title: "T" })).toContain("\\druckWarning");
  });
});
