import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JobStore } from "../src/job-store.js";
import { makeListJobFilesTool } from "../src/tools/list-job-files.js";

let store: JobStore;

beforeEach(() => {
  process.env.DRUCKFORM_JOBS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ljf-"));
  store = new JobStore();
});
afterEach(() => store.destroy());

async function call(args: unknown): Promise<Record<string, unknown>> {
  const tool = makeListJobFilesTool(store);
  return JSON.parse((await tool.handler(args)).content[0].text);
}

describe("list_job_files", () => {
  it("lists input files with size + sha256, excluding internal artifacts", async () => {
    const job = store.create("base", "style.yaml", "u", "d");
    fs.writeFileSync(path.join(job.dir, "document.md"), "# Hi", "utf8");
    fs.mkdirSync(path.join(job.dir, "assets"));
    fs.writeFileSync(path.join(job.dir, "assets", "logo.png"), "PNGDATA", "utf8");
    fs.writeFileSync(path.join(job.dir, "bundle.zip"), "ZIP", "utf8"); // excluded
    fs.writeFileSync(path.join(job.dir, "out.pdf"), "PDF", "utf8"); // excluded

    const out = await call({ job_id: job.id });
    const files = out.files as Array<{ name: string; size: number; checksum: string }>;
    const names = files.map((f) => f.name);
    expect(names).toContain("document.md");
    expect(names).toContain("assets/logo.png");
    expect(names).not.toContain("bundle.zip");
    expect(names).not.toContain("out.pdf");

    const docEntry = files.find((f) => f.name === "document.md");
    expect(docEntry?.size).toBe(4);
    expect(docEntry?.checksum).toBe(crypto.createHash("sha256").update("# Hi").digest("hex"));
  });

  it("errors for an unknown job", async () => {
    await expect(call({ job_id: "nope" })).rejects.toThrow(/not found/i);
  });
});
