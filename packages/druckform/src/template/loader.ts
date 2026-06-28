import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { TemplateConfig } from "../sdk/types.js";

export interface TemplateEntry {
  config: TemplateConfig;
  dir: string;
  origin: "bundled" | "user";
}

export function loadAllTemplates(bundledDir: string, userDir?: string): Map<string, TemplateEntry> {
  const templates = new Map<string, TemplateEntry>();

  for (const origin of ["bundled", "user"] as const) {
    const dir = origin === "bundled" ? bundledDir : userDir;
    if (!dir || !fs.existsSync(dir)) continue;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const templateDir = path.join(dir, entry.name);
      const configPath = path.join(templateDir, "template.yaml");
      if (!fs.existsSync(configPath)) continue;

      const raw = fs.readFileSync(configPath, "utf8");
      const config = yaml.load(raw) as TemplateConfig;
      templates.set(config.name, { config, dir: templateDir, origin });
    }
  }

  return templates;
}
