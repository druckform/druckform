import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ENGINE_CORE } from "../../src/latex/composer.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

// The composer collects preamble blocks from EVERY component in a resolved
// template, not only the ones a given document happens to use (see
// composer.ts). That means adding a single component with a new
// \usepackage anywhere in a bundled template makes every document in that
// template pull that package at render time — which fails outright in the
// offline/sandboxed environment tectonic-prewarm.tex exists to avoid. This
// test is the guard: it fails loudly, naming the missing package, before
// that regression ever reaches a real (10-minute) Docker e2e run.
const BUNDLED = path.resolve(import.meta.dirname, "../../templates");
const PREWARM_TEX = path.resolve(import.meta.dirname, "../../../../docker/tectonic-prewarm.tex");

const USEPACKAGE_RE = /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^}]+)\}/g;

function extractPackageNames(tex: string): Set<string> {
  const names = new Set<string>();
  for (const match of tex.matchAll(USEPACKAGE_RE)) {
    const group = match[1] ?? "";
    for (const name of group.split(",")) {
      const trimmed = name.trim();
      if (trimmed) names.add(trimmed);
    }
  }
  return names;
}

describe("component preamble ↔ prewarm sync", () => {
  it("every package a bundled template's components can pull in is prewarmed", async () => {
    const prewarmTex = fs.readFileSync(PREWARM_TEX, "utf8");
    const prewarmedPackages = extractPackageNames(prewarmTex);

    const all = loadAllTemplates(BUNDLED, undefined);
    const requiredPreamble = new Set<string>([ENGINE_CORE]);

    for (const templateName of ["base", "report", "examples"]) {
      const resolved = await resolveTemplate(templateName, all);
      for (const entry of Object.values(resolved.components)) {
        if (entry.def.preamble) requiredPreamble.add(entry.def.preamble.trim());
      }
    }

    const requiredPackages = extractPackageNames([...requiredPreamble].join("\n"));

    const missing = [...requiredPackages].filter((name) => !prewarmedPackages.has(name));
    expect(
      missing,
      `Package(s) ${missing.join(", ")} are \\usepackage-d by a bundled component but ` +
        `absent from docker/tectonic-prewarm.tex — add them there (and exercise the ` +
        `feature they enable) or the offline Docker image cannot render documents ` +
        `that use this component.`,
    ).toEqual([]);
  });
});
