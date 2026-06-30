import { describe, expect, it } from "vitest";
import { listComponentsTool } from "../src/tools/list-components.js";
import { listTemplatesTool } from "../src/tools/list-templates.js";
import { makeScaffoldComponentTool } from "../src/tools/scaffold-component.js";
import { makeValidateComponentTool } from "../src/tools/validate-component.js";

describe("tool descriptions are free of German flavour vocabulary", () => {
  it("list_templates description has no 'Sätze'", () => {
    expect(listTemplatesTool.description).not.toMatch(/Sätze|Satz/);
  });
  it("list_components description has no 'Lettern'", () => {
    expect(listComponentsTool.description).not.toMatch(/Lettern|Letter/);
  });
});

it("exposes the authoring tools", () => {
  expect(makeValidateComponentTool().name).toBe("validate_component");
  expect(makeScaffoldComponentTool().name).toBe("scaffold_component");
});
