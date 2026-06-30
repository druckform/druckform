import { z } from "zod";
import { newComponent } from "../cli-runner.js";
import { assertSafeTemplateName } from "../template-guard.js";

const schema = z.object({
  template: z.string(),
  name: z.string(),
  kind: z.enum(["ts", "yaml"]).default("ts"),
  acceptsChildren: z.boolean().default(false),
});

export function makeScaffoldComponentTool() {
  return {
    name: "scaffold_component",
    description:
      "Create a new component (with a starter test) in a template under DRUCKFORM_TEMPLATES_DIR. Returns the created file paths. Then validate_component and preview_component to verify.",
    inputSchema: {
      type: "object",
      properties: {
        template: { type: "string", description: "Target template name" },
        name: { type: "string", description: "Component name" },
        kind: { type: "string", enum: ["ts", "yaml"], description: "Component kind (default ts)" },
        acceptsChildren: { type: "boolean", description: "Whether it accepts ::: children" },
      },
      required: ["template", "name"],
    },
    handler: async (args: unknown) => {
      const { template, name, kind, acceptsChildren } = schema.parse(args);
      assertSafeTemplateName(template);
      assertSafeTemplateName(name); // same rule: bare name, no path
      const result = newComponent(template, name, kind, acceptsChildren);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  };
}
