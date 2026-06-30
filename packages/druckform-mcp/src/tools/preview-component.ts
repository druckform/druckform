import path from "node:path";
import { z } from "zod";
import { previewComponent } from "../cli-runner.js";
import type { JobStore } from "../job-store.js";
import { generateToken } from "../url-tokens.js";

const schema = z.object({
  template: z.string(),
  name: z.string(),
  params: z.record(z.string()).optional(),
  children: z.string().optional(),
});

export function makePreviewComponentTool(store: JobStore, baseUrl: string) {
  return {
    name: "preview_component",
    description:
      "Render a single component with sample params/children to a PDF (fast author loop) and return a download_url. Targets ':::'-invoked components.",
    inputSchema: {
      type: "object",
      properties: {
        template: { type: "string" },
        name: { type: "string" },
        params: { type: "object", description: "Component params (string values)" },
        children: { type: "string", description: "Markdown body for the component" },
      },
      required: ["template", "name"],
    },
    handler: async (args: unknown) => {
      const { template, name, params, children } = schema.parse(args);
      const job = store.createInline(template, "placeholder-download");
      const downloadToken = generateToken(job.id, "download");
      store.update(job.id, { downloadToken, status: "rendering" });

      const outPdf = path.join(job.dir, "out.pdf");
      const result = previewComponent(template, name, params, children, outPdf);

      if (result.status === "ok") {
        store.update(job.id, { status: "done" });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                job_id: job.id,
                download_url: `${baseUrl}/download/${downloadToken}`,
                expires_at: new Date(job.expiresAt).toISOString(),
              }),
            },
          ],
        };
      }
      const errSummary = result.error?.summary;
      store.update(job.id, {
        status: "error",
        ...(errSummary !== undefined && { errorSummary: errSummary }),
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ status: "error", error: result.error }) },
        ],
      };
    },
  };
}
