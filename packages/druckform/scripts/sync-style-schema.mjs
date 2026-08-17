#!/usr/bin/env node
// Regenerates schemas/style-v1.json from STYLE_SCHEMA in src/style/validate.ts.
//
// src/style/validate.ts holds the schema the CLI enforces (inlined, because tsup
// bundles every command into dist/cli.js where reading a sibling JSON file is
// unreliable). schemas/style-v1.json is the editor-facing copy that style files
// point at with `# yaml-language-server: $schema=...`. Edit the TS constant, then
// run this to regenerate the JSON; style-schema-sync.test.ts fails if they drift.
//
//   pnpm --filter @druckform/core schema:sync
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(pkgRoot, "src/style/validate.ts");
const outFile = path.join(pkgRoot, "schemas/style-v1.json");

const built = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  packages: "external",
});

// Imported from a temp file rather than a data: URL so its external imports
// resolve against the package's own node_modules.
const tmp = path.join(pkgRoot, "src/style/.sync-style-schema.tmp.mjs");
fs.writeFileSync(tmp, built.outputFiles[0].text, "utf8");
try {
  const { STYLE_SCHEMA } = await import(`file://${tmp}`);
  fs.writeFileSync(outFile, `${JSON.stringify(STYLE_SCHEMA, null, 2)}\n`, "utf8");
  // Hand formatting to biome so the generated file matches `pnpm lint`, which
  // checks it like any other JSON in the repo.
  const fmt = spawnSync("pnpm", ["exec", "biome", "format", "--write", outFile], {
    cwd: pkgRoot,
    stdio: "inherit",
  });
  if (fmt.status !== 0) {
    throw new Error("biome format failed on the generated schema");
  }
  console.log(`wrote ${path.relative(pkgRoot, outFile)}`);
} finally {
  fs.rmSync(tmp, { force: true });
}
