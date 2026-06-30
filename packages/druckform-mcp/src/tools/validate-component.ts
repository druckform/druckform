import { z } from "zod";
import { doctorTemplate } from "../cli-runner.js";
import { assertSafeTemplateName } from "../template-guard.js";

const schema = z.object({ template: z.string() });

export function makeValidateComponentTool() {
  return {
    name: "validate_component",
    description:
      "Validate a template's components against the authoring contract (runs `druck doctor`). Returns lint findings.",
    inputSchema: {
      type: "object",
      properties: { template: { type: "string", description: "Template name" } },
      required: ["template"],
    },
    handler: async (args: unknown) => {
      const { template } = schema.parse(args);
      assertSafeTemplateName(template);
      const result = doctorTemplate(template);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  };
}
