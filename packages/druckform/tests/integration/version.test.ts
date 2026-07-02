import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CLI = path.resolve(import.meta.dirname, "../../dist/cli.js");
const PKG = path.resolve(import.meta.dirname, "../../package.json");

describe("druck --version", () => {
  it("prints the package version and exits 0", () => {
    const version = (JSON.parse(fs.readFileSync(PKG, "utf8")) as { version: string }).version;
    const res = spawnSync("node", [CLI, "--version"], { encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe(version);
  });
});
