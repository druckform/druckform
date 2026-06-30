import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/cli-runner.js", () => ({
  doctorTemplate: vi.fn(() => ({
    schemaVersion: "1",
    ok: false,
    findings: [{ severity: "error", component: "banner", message: "missing render" }],
  })),
}));

import { doctorTemplate } from "../src/cli-runner.js";
import { makeValidateComponentTool } from "../src/tools/validate-component.js";

afterEach(() => vi.clearAllMocks());

async function call(args: unknown): Promise<Record<string, unknown>> {
  const tool = makeValidateComponentTool();
  return JSON.parse((await tool.handler(args)).content[0].text);
}

describe("validate_component", () => {
  it("returns the doctor findings for a template", async () => {
    const out = await call({ template: "acme" });
    expect(out.ok).toBe(false);
    expect((out.findings as unknown[]).length).toBe(1);
    expect(doctorTemplate).toHaveBeenCalledWith("acme");
  });

  it("rejects unsafe template names", async () => {
    await expect(call({ template: "../etc" })).rejects.toThrow(/invalid template name/i);
  });
});
