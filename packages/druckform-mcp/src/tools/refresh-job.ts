import { z } from "zod";
import type { JobStore } from "../job-store.js";
import { generateToken } from "../url-tokens.js";

const schema = z.object({ job_id: z.string() });

export function makeRefreshJobTool(store: JobStore, baseUrl: string) {
  return {
    name: "refresh_job",
    description:
      "Re-issue fresh upload/download URLs for an existing job and extend its TTL. Use this to start another edit cycle: upload a (partial) zip of only the changed files to the new upload_url, then call finalize_job again. Unchanged files already on the job are reused.",
    inputSchema: {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    handler: async (args: unknown) => {
      const { job_id } = schema.parse(args);
      const job = store.get(job_id);
      if (!job) throw new Error(`Job not found: ${job_id}`);

      const uploadToken = generateToken(job.id, "upload");
      const downloadToken = generateToken(job.id, "download");
      store.update(job.id, { uploadToken, downloadToken, uploadUsed: false });
      store.keepAlive(job.id);

      const refreshed = store.get(job.id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              job_id: job.id,
              upload_url: `${baseUrl}/upload/${uploadToken}`,
              download_url: `${baseUrl}/download/${downloadToken}`,
              expires_at: new Date(refreshed?.expiresAt ?? Date.now()).toISOString(),
            }),
          },
        ],
      };
    },
  };
}
