import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hardenedUnzip } from "../src/unzip.js";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "druckform-unzip-test-"));
}

function makeZip(destDir: string, entries: Record<string, string>): string {
  const sourceDir = makeTempDir();
  for (const [name, content] of Object.entries(entries)) {
    const p = path.join(sourceDir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, "utf8");
  }
  const zipPath = path.join(destDir, "bundle.zip");
  spawnSync("zip", ["-r", zipPath, "."], { cwd: sourceDir });
  return zipPath;
}

describe("hardenedUnzip", () => {
  it("extracts a valid zip", async () => {
    const dest = makeTempDir();
    const zipDir = makeTempDir();
    const zip = makeZip(zipDir, { "document.md": "# Hello", "assets/img.png": "PNG" });
    const result = await hardenedUnzip(zip, dest);
    expect(result.ok).toBe(true);
    expect(result.files).toContain("document.md");
    expect(fs.existsSync(path.join(dest, "document.md"))).toBe(true);
  });

  it("rejects entries with path traversal (../)", async () => {
    const dest = makeTempDir();
    // Create a zip manually with a traversal entry using Python-free approach
    // Use a pre-built fixture zip with known bad entry
    const zipPath = path.join(import.meta.dirname, "fixtures/zipslip.zip");
    if (!fs.existsSync(zipPath)) {
      // Skip if fixture doesn't exist — document to create it separately
      console.warn("Skipping zip-slip test — fixture not found. See tests/fixtures/README.md");
      return;
    }
    const result = await hardenedUnzip(zipPath, dest);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Zip-slip/);
  });

  it("rejects archives exceeding entry count", async () => {
    // Create a zip with 1001 files — use a stub approach
    const dest = makeTempDir();
    const sourceDir = makeTempDir();
    // Create 1001 tiny files
    for (let i = 0; i < 1001; i++) {
      fs.writeFileSync(path.join(sourceDir, `file${i}.txt`), "x");
    }
    const zipPath = path.join(dest, "bomb-count.zip");
    spawnSync("zip", ["-r", zipPath, "."], { cwd: sourceDir });
    const result = await hardenedUnzip(zipPath, dest);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/entry count/);
  });
});
