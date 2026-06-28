import fs from "node:fs";
import path from "node:path";
import type { TemplatesContract } from "../sdk/types.js";
import { loadAllTemplates } from "../template/loader.js";

// When compiled individually (source/tests): src/commands/ → ../../templates = druckform/templates
// When bundled into dist/cli.js:              dist/        → ../templates   = druckform/templates
const _t1 = path.resolve(new URL("../../templates", import.meta.url).pathname);
const BUNDLED_TEMPLATES = fs.existsSync(_t1)
  ? _t1
  : path.resolve(new URL("../templates", import.meta.url).pathname);

export function templatesCommand(json: boolean): void {
  const all = loadAllTemplates(BUNDLED_TEMPLATES, process.env.DRUCKFORM_TEMPLATES_DIR);

  const contract: TemplatesContract = {
    schemaVersion: "1",
    templates: [...all.values()].map(({ config, origin }) => ({
      name: config.name,
      extends: config.extends ?? null,
      origin,
      ...(config.description !== undefined ? { description: config.description } : {}),
    })),
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
  } else {
    for (const t of contract.templates) {
      const ext = t.extends ? ` (extends: ${t.extends})` : "";
      console.log(`  ${t.name}${ext} [${t.origin}]`);
    }
  }
}
