import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JobStore } from "../src/job-store.js";
import { makeRefreshJobTool } from "../src/tools/refresh-job.js";
import { clearTokensForTest } from "../src/url-tokens.js";

const BASE = "http://127.0.0.1:9999";
let store: JobStore;

beforeEach(() => {
  process.env.DRUCKFORM_JOBS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-"));
  store = new JobStore();
});
afterEach(() => {
  store.destroy();
  clearTokensForTest();
});

async function call(args: unknown): Promise<Record<string, unknown>> {
  const tool = makeRefreshJobTool(store, BASE);
  return JSON.parse((await tool.handler(args)).content[0].text);
}

describe("refresh_job", () => {
  it("re-issues fresh upload/download URLs, clears uploadUsed, and extends TTL", async () => {
    const job = store.create("base", "s.yaml", "u", "d");
    store.update(job.id, { uploadUsed: true, expiresAt: Date.now() + 1000 });

    const out = await call({ job_id: job.id });
    expect(String(out.upload_url)).toContain(`${BASE}/upload/`);
    expect(String(out.download_url)).toContain(`${BASE}/download/`);
    expect(out.expires_at).toBeTruthy();

    const after = store.get(job.id);
    expect(after?.uploadUsed).toBe(false);
    expect(after?.uploadToken).not.toBe("u");
    expect(after?.downloadToken).not.toBe("d");
    expect(after?.expiresAt ?? 0).toBeGreaterThan(Date.now() + 60 * 1000);
  });

  it("errors for an unknown job", async () => {
    await expect(call({ job_id: "nope" })).rejects.toThrow(/not found/i);
  });
});
