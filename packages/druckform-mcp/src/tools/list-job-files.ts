import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { JobStore } from "../job-store.js";

const schema = z.object({ job_id: z.string() });

// Internal artifacts that are not part of the client-supplied input set.
const EXCLUDED = new Set(["bundle.zip", "out.pdf"]);

interface FileEntry {
  name: string;
  size: number;
  checksum: string;
}

function walk(root: string, dir: string, out: FileEntry[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs);
    if (entry.isDirectory()) {
      walk(root, abs, out);
    } else if (entry.isFile() && !EXCLUDED.has(rel)) {
      const data = fs.readFileSync(abs);
      out.push({
        name: rel,
        size: data.length,
        checksum: crypto.createHash("sha256").update(data).digest("hex"),
      });
    }
  }
}

export function makeListJobFilesTool(store: JobStore) {
  return {
    name: "list_job_files",
    description:
      "List the input files held by a job (relative name, byte size, sha256). Use this to diff locally and re-upload only changed files for a subsequent render.",
    inputSchema: {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    handler: async (args: unknown) => {
      const { job_id } = schema.parse(args);
      const job = store.get(job_id);
      if (!job) throw new Error(`Job not found: ${job_id}`);
      const files: FileEntry[] = [];
      walk(job.dir, job.dir, files);
      files.sort((a, b) => a.name.localeCompare(b.name));
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ job_id, files }, null, 2) }],
      };
    },
  };
}
