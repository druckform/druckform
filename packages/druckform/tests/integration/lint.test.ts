import path from "node:path";
import { describe, expect, it } from "vitest";
import { lintCommand } from "../../src/commands/lint.js";

// Capture stdout/stderr for --json assertions
import { vi } from "vitest";

const FIXTURES = path.resolve(import.meta.dirname, "../fixtures");

describe("lint integration", () => {
  it("reports ok for a valid document", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      writes.push(String(s));
      return true;
    });

    process.env.DRUCKFORM_TEMPLATES_DIR = undefined;
    // Override bundled templates path via env for test isolation
    await lintCommand("base", path.join(FIXTURES, "documents/valid.md"), undefined, true);

    const out = JSON.parse(writes.join(""));
    expect(out.schemaVersion).toBe("1");
    expect(out.ok).toBe(true);

    vi.restoreAllMocks();
  });

  it("reports error for missing required param", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      writes.push(String(s));
      return true;
    });
    const exits: number[] = [];
    vi.spyOn(process, "exit").mockImplementation((n) => {
      exits.push(n ?? 0);
      throw new Error("exit");
    });

    await expect(
      lintCommand(
        "base",
        path.join(FIXTURES, "documents/invalid-missing-required.md"),
        undefined,
        true,
      ),
    ).rejects.toThrow("exit");

    const out = JSON.parse(writes.join(""));
    expect(out.ok).toBe(false);
    expect(out.findings.length).toBeGreaterThan(0);
    expect(exits[0]).toBe(1);

    vi.restoreAllMocks();
  });
});
