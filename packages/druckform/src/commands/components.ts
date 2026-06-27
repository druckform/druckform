import type { ComponentsContract } from "../sdk/types.js";
import { loadAllTemplates } from "../template/loader.js";
import { resolveTemplate } from "../template/resolver.js";
import path from "node:path";
import fs from "node:fs";

// When compiled individually (source/tests): src/commands/ → ../../templates = druckform/templates
// When bundled into dist/cli.js:              dist/        → ../templates   = druckform/templates
const _t1 = path.resolve(new URL("../../templates", import.meta.url).pathname);
const BUNDLED_TEMPLATES = fs.existsSync(_t1) ? _t1 : path.resolve(new URL("../templates", import.meta.url).pathname);

export async function componentsCommand(template: string, json: boolean): Promise<void> {
  const all = loadAllTemplates(
    BUNDLED_TEMPLATES,
    process.env["DRUCKFORM_TEMPLATES_DIR"],
  );

  const resolved = await resolveTemplate(template, all);

  const contract: ComponentsContract = {
    schemaVersion: "1",
    template,
    components: Object.values(resolved.components).map(({ def }) => ({
      name: def.meta.name,
      description: def.meta.description,
      params: def.jsonSchema,
      acceptsChildren: def.meta.acceptsChildren,
      ...(def.meta.example !== undefined ? { example: def.meta.example } : {}),
    })),
  };

  if (json) {
    process.stdout.write(JSON.stringify(contract, null, 2) + "\n");
  } else {
    for (const c of contract.components) {
      console.log(`  ${c.name} — ${c.description}`);
    }
  }
}
