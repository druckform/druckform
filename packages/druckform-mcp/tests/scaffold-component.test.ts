import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/cli-runner.js", () => ({
  newComponent: vi.fn(() => ({ created: ["templates/acme/components/banner.ts"] })),
}));

import { newComponent } from "../src/cli-runner.js";
import { makeScaffoldComponentTool } from "../src/tools/scaffold-component.js";

afterEach(() => vi.clearAllMocks());

async function call(args: unknown): Promise<Record<string, unknown>> {
  const tool = makeScaffoldComponentTool();
  return JSON.parse((await tool.handler(args)).content[0].text);
}

describe("scaffold_component", () => {
  it("scaffolds a component and returns the created paths", async () => {
    const out = await call({ template: "acme", name: "banner", kind: "ts", acceptsChildren: true });
    expect((out.created as string[]).length).toBe(1);
    expect(newComponent).toHaveBeenCalledWith("acme", "banner", "ts", true);
  });

  it("rejects unsafe template or component names", async () => {
    await expect(call({ template: "acme", name: "../x" })).rejects.toThrow(/invalid/i);
  });

  it("defaults kind to ts and acceptsChildren to false", async () => {
    await call({ template: "acme", name: "banner" });
    expect(newComponent).toHaveBeenCalledWith("acme", "banner", "ts", false);
  });
});
