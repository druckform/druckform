import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { componentsCommand } from "../../src/commands/components.js";

const FIXTURES = path.resolve(import.meta.dirname, "../fixtures/templates");

async function runComponents(template: string) {
  const writes: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((s) => {
    writes.push(String(s));
    return true;
  });
  process.env.DRUCKFORM_TEMPLATES_DIR = FIXTURES;
  try {
    await componentsCommand(template, true);
    return JSON.parse(writes.join(""));
  } finally {
    process.env.DRUCKFORM_TEMPLATES_DIR = undefined;
    vi.restoreAllMocks();
  }
}

describe("components contract reports the registration key", () => {
  it("lists an alias under its own name, not the implementation's meta.name", async () => {
    const out = await runComponents("aliasing");
    const names = out.components.map((c: { name: string }) => c.name);
    // `restated` is backed by infobox; discovery must advertise the invocable name.
    expect(names).toContain("restated");
    expect(names).toContain("infobox");
  });
});
