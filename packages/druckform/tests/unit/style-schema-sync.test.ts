import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STYLE_SCHEMA } from "../../src/style/validate.js";

// There are two copies of the style schema, and they must not drift:
//   - STYLE_SCHEMA in src/style/validate.ts is what the CLI actually enforces.
//     It is inlined because tsup bundles every command into dist/cli.js, where
//     reading a sibling JSON file via import.meta.url is unreliable.
//   - schemas/style-v1.json is what editors read. Style files point at it with
//     `# yaml-language-server: $schema=../../schemas/style-v1.json`.
// When they diverge, authors get red squiggles on keys that render fine, or no
// warning on keys the CLI will reject. Both happened: the JSON copy sat two
// features behind (mermaid `themeVariables`, and the `{ name, options }` font
// form documented in extending-druckform.md §4.1).
describe("style schema copies stay in sync", () => {
  const jsonPath = path.resolve(import.meta.dirname, "../../schemas/style-v1.json");

  // If this fails: run `pnpm --filter @druckform/core schema:sync`.
  it("schemas/style-v1.json matches the schema the CLI enforces", () => {
    const onDisk = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(STYLE_SCHEMA)));
  });
});
