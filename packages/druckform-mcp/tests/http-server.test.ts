import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpServer, startHttpServer } from "../src/http-server.js";
import { JobStore } from "../src/job-store.js";
import { clearTokensForTest, generateToken } from "../src/url-tokens.js";

let store: JobStore;

beforeEach(() => {
  process.env.DRUCKFORM_JOBS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "http-test-"));
  store = new JobStore();
});

afterEach(() => {
  store.destroy();
  clearTokensForTest();
});

describe("HTTP server", () => {
  it("rejects upload with an unknown token", async () => {
    const app = createHttpServer(store);
    const res = await app.inject({
      method: "PUT",
      url: "/upload/invalid-token",
      payload: Buffer.from("data"),
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts upload with a valid token and marks job as uploaded", async () => {
    // Create job first to get the real UUID, then generate tokens with that ID
    const job = store.create("base", "style.yaml", "placeholder-upload", "placeholder-download");
    const uploadToken = generateToken(job.id, "upload");
    const downloadToken = generateToken(job.id, "download");
    store.update(job.id, { uploadToken, downloadToken });

    const app = createHttpServer(store);
    const res = await app.inject({
      method: "PUT",
      url: `/upload/${uploadToken}`,
      payload: Buffer.from("fake zip content"),
    });

    expect(res.statusCode).toBe(200);
    expect(store.get(job.id)?.status).toBe("uploaded");
  });

  it("rejects download when job is not done", async () => {
    // Create job first to get the real UUID, then generate tokens with that ID
    const job = store.create("base", "style.yaml", "placeholder-upload", "placeholder-download");
    const uploadToken = generateToken(job.id, "upload");
    const downloadToken = generateToken(job.id, "download");
    store.update(job.id, { uploadToken, downloadToken });

    const app = createHttpServer(store);
    const res = await app.inject({
      method: "GET",
      url: `/download/${downloadToken}`,
    });
    expect(res.statusCode).toBe(409);
  });

  it("binds an ephemeral port when port 0 is requested", async () => {
    const s = new JobStore();
    const a = await startHttpServer(s, 0);
    try {
      expect(a.port).toBeGreaterThan(0);
      expect(a.url).toBe(`http://127.0.0.1:${a.port}`);
    } finally {
      await a.close();
      await s.destroy();
    }
  });

  it("two instances on port 0 get distinct ports (no clash)", async () => {
    const s1 = new JobStore();
    const s2 = new JobStore();
    const a = await startHttpServer(s1, 0);
    const b = await startHttpServer(s2, 0);
    try {
      expect(a.port).not.toBe(b.port);
    } finally {
      await a.close();
      await b.close();
      await s1.destroy();
      await s2.destroy();
    }
  });

  it("binds to DRUCKFORM_HTTP_BIND address when set", async () => {
    const savedEnv = process.env.DRUCKFORM_HTTP_BIND;
    process.env.DRUCKFORM_HTTP_BIND = "0.0.0.0";
    const isolatedStore = new JobStore();
    let server: { url: string; close: () => Promise<void>; boundHost: string } | undefined;
    try {
      server = await startHttpServer(isolatedStore, 7399);
      expect(server.url).toBe("http://127.0.0.1:7399");
      expect(server.boundHost).toBe("0.0.0.0");
    } finally {
      await server?.close();
      await isolatedStore.destroy();
      if (savedEnv === undefined) {
        process.env.DRUCKFORM_HTTP_BIND = undefined;
      } else {
        process.env.DRUCKFORM_HTTP_BIND = savedEnv;
      }
    }
  });
});
