import fs from "node:fs";
import path from "node:path";
import { COMPONENT_CONTRACT_VERSION, type ComponentsContract } from "../sdk/types.js";
import { loadAllTemplates } from "../template/loader.js";
import { resolveTemplate } from "../template/resolver.js";

// When compiled individually (source/tests): src/commands/ → ../../templates = druckform/templates
// When bundled into dist/cli.js:              dist/        → ../templates   = druckform/templates
const _t1 = path.resolve(new URL("../../templates", import.meta.url).pathname);
const BUNDLED_TEMPLATES = fs.existsSync(_t1)
  ? _t1
  : path.resolve(new URL("../templates", import.meta.url).pathname);

export async function componentsCommand(template: string, json: boolean): Promise<void> {
  const all = loadAllTemplates(BUNDLED_TEMPLATES, process.env.DRUCKFORM_TEMPLATES_DIR);

  const resolved = await resolveTemplate(template, all);

  const contract: ComponentsContract = {
    schemaVersion: "1",
    template,
    components: Object.entries(resolved.components).map(
      ([name, { def, defaults, sourcePath, description, example }]) => {
        const source = (() => {
          try {
            return fs.readFileSync(sourcePath, "utf8");
          } catch {
            return undefined;
          }
        })();
        // A registration (e.g. an alias's `template.yaml` entry) may override the
        // underlying component's own description/example — that is how `note`
        // advertises itself instead of `callout`'s generic copy.
        const effectiveDescription = description ?? def.meta.description;
        const effectiveExample = example ?? def.meta.example;
        return {
          name,
          description: effectiveDescription,
          params: def.jsonSchema,
          acceptsChildren: def.meta.acceptsChildren,
          // Heuristic: TS components read `element`; declarative document shells use {{body}}.
          acceptsElement: source
            ? /\belement\b/.test(source) || source.includes("{{body}}")
            : false,
          form: def.meta.form ?? "container",
          contractVersion: COMPONENT_CONTRACT_VERSION,
          defaults,
          ...(effectiveExample !== undefined ? { example: effectiveExample } : {}),
          ...(source !== undefined ? { source } : {}),
        };
      },
    ),
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
  } else {
    for (const c of contract.components) {
      console.log(`  ${c.name} [${c.form}] — ${c.description}`);
    }
  }
}
