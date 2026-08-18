import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { componentsCommand } from "../../src/commands/components.js";

describe("rich list_components", () => {
  it("includes source, acceptsElement, and contractVersion", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      writes.push(String(s));
      return true;
    });
    await componentsCommand("base", true);
    vi.restoreAllMocks();
    const out = JSON.parse(writes.join(""));
    const table = out.components.find((c: { name: string }) => c.name === "block:table");
    expect(table.contractVersion).toBe("1");
    expect(table.acceptsElement).toBe(true); // block:table reads `element`
    expect(table.form).toBe("container"); // components default to container form
    expect(typeof table.source).toBe("string");
    expect(table.source).toContain("export const meta");
    const infobox = out.components.find((c: { name: string }) => c.name === "infobox");
    expect(infobox.acceptsElement).toBe(false); // declarative infobox: no element/{{body}}
    expect(infobox.form).toBe("container");
  });

  it("exposes each component's resolved param defaults", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      writes.push(String(s));
      return true;
    });
    await componentsCommand("base", true);
    vi.restoreAllMocks();
    const out = JSON.parse(writes.join(""));
    const note = out.components.find((c: { name: string }) => c.name === "note");
    expect(note.defaults).toEqual({ variant: "info" });
    const callout = out.components.find((c: { name: string }) => c.name === "callout");
    expect(callout.defaults).toEqual({});
  });

  it("lets an alias registration override description and example instead of inheriting callout's", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      writes.push(String(s));
      return true;
    });
    await componentsCommand("base", true);
    vi.restoreAllMocks();
    const out = JSON.parse(writes.join(""));
    for (const [alias, variant] of [
      ["note", "info"],
      ["tip", "tip"],
      ["warning", "warn"],
      ["danger", "danger"],
      ["infobox", "info"],
    ] as const) {
      const entry = out.components.find((c: { name: string }) => c.name === alias);
      // The example must name the alias itself, not "callout", and must not
      // advertise a contradicting variant.
      expect(entry.example).toContain(`:::${alias}`);
      expect(entry.example).not.toContain(":::callout");
      expect(entry.description).not.toBe("Variant-styled callout box with a title.");
      expect(entry.defaults.variant).toBe(variant);
    }
  });
});
