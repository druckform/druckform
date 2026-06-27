import type { LintContract } from "../sdk/types.js";
import { loadAllTemplates } from "../template/loader.js";
import { resolveTemplate } from "../template/resolver.js";
import { loadStyle } from "../style/validate.js";
import { extractRequiredTokens, checkTokenCoverage } from "../style/tokens.js";
import { parseDocument } from "../parse/parser.js";
import path from "node:path";
import fs from "node:fs";

// When compiled individually (source/tests): src/commands/ → ../../templates = druckform/templates
// When bundled into dist/cli.js:              dist/        → ../templates   = druckform/templates
const _t1 = path.resolve(new URL("../../templates", import.meta.url).pathname);
const BUNDLED_TEMPLATES = fs.existsSync(_t1) ? _t1 : path.resolve(new URL("../templates", import.meta.url).pathname);

export async function lintCommand(
  template: string,
  inFile: string,
  stylePath: string | undefined,
  json: boolean,
): Promise<void> {
  const all = loadAllTemplates(BUNDLED_TEMPLATES, process.env["DRUCKFORM_TEMPLATES_DIR"]);
  const resolved = await resolveTemplate(template, all);
  const doc = parseDocument(inFile);
  const findings = [];

  // Validate component names
  for (const node of doc.nodes) {
    if (node.type !== "component") continue;
    if (!resolved.components[node.block.name]) {
      findings.push({
        severity: "error" as const,
        component: node.block.name,
        message: `Unknown component '${node.block.name}'`,
        line: node.block.sourceLine,
      });
    }
  }

  // Validate required params
  for (const node of doc.nodes) {
    if (node.type !== "component") continue;
    const entry = resolved.components[node.block.name];
    if (!entry) continue;
    try {
      entry.def.schema.parse({ ...entry.defaults, ...node.block.params });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      findings.push({
        severity: "error" as const,
        component: node.block.name,
        message: msg,
        line: node.block.sourceLine,
      });
    }
  }

  // Token coverage (if style provided)
  if (stylePath) {
    const styleConfig = loadStyle(stylePath);
    const required = extractRequiredTokens(resolved);
    findings.push(...checkTokenCoverage(required, resolved, styleConfig));
  }

  const contract: LintContract = {
    schemaVersion: "1",
    ok: findings.length === 0,
    findings,
  };

  if (json) {
    process.stdout.write(JSON.stringify(contract, null, 2) + "\n");
  } else {
    if (contract.ok) {
      console.log("✓ No issues found.");
    } else {
      for (const f of findings) {
        const loc = f.line ? `:${f.line}` : "";
        console.error(`[${f.severity}] ${f.component}${loc}: ${f.message}`);
      }
    }
  }

  if (!contract.ok) process.exit(1);
}
