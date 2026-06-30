import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/cli-runner.js", () => ({
  previewComponent: vi.fn((_t, _n, _p, _c, outPdf) => {
    fs.writeFileSync(outPdf, "%PDF-stub", "utf8");
    return { schemaVersion: "1", status: "ok", pdf: outPdf };
  }),
}));

import { JobStore } from "../src/job-store.js";
import { makePreviewComponentTool } from "../src/tools/preview-component.js";

const BASE = "http://127.0.0.1:9999";
let store: JobStore;
beforeEach(() => {
  process.env.DRUCKFORM_JOBS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pc-"));
  store = new JobStore();
});
afterEach(() => {
  store.destroy();
  vi.clearAllMocks();
});

async function call(args: unknown): Promise<Record<string, unknown>> {
  const tool = makePreviewComponentTool(store, BASE);
  return JSON.parse((await tool.handler(args)).content[0].text);
}

describe("preview_component", () => {
  it("renders a component and returns a download URL", async () => {
    const out = await call({
      template: "base",
      name: "infobox",
      params: { title: "Hi" },
      children: "Body",
    });
    expect(out.job_id).toBeTruthy();
    expect(String(out.download_url)).toContain(`${BASE}/download/`);
    expect(store.get(out.job_id as string)?.status).toBe("done");
  });

  it("returns an error result when the render fails", async () => {
    const { previewComponent } = await import("../src/cli-runner.js");
    (
      previewComponent as unknown as { mockReturnValueOnce: (v: unknown) => void }
    ).mockReturnValueOnce({
      schemaVersion: "1",
      status: "error",
      pdf: null,
      error: { summary: "boom", findings: [] },
    });
    const out = await call({ template: "base", name: "infobox" });
    expect(out.status).toBe("error");
  });
});
