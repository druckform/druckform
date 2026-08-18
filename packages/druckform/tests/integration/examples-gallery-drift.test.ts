import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

// docs/examples-gallery.md claims its snippets "cannot drift from what
// `druck preview-component` renders" — but the strings are hand-copied
// markdown, not generated. This test is what makes that claim true: it
// re-extracts each component's meta.example/example from the resolved
// `examples` template and diffs it against the gallery's fenced snippet
// under the matching "## <name>" heading.
const GALLERY = path.resolve(import.meta.dirname, "../../../../docs/examples-gallery.md");
const BUNDLED = path.resolve(import.meta.dirname, "../../templates");

// name -> gallery heading text (some headings carry a parenthetical suffix).
const HEADINGS: Record<string, string> = {
  callout: "## callout (and its aliases `note` / `tip` / `warning` / `danger` / `infobox`)",
  figure: "## figure",
  ref: "## ref",
  pagebreak: "## pagebreak",
  pullquote: "## pullquote",
  deflist: "## deflist",
  metadata: "## metadata",
  badge: "## badge",
  footnote: "## footnote",
};

function extractFence(markdown: string, heading: string): string {
  const headingIdx = markdown.indexOf(heading);
  if (headingIdx < 0) throw new Error(`heading not found in gallery: ${heading}`);
  const afterHeading = markdown.slice(headingIdx + heading.length);
  const fenceStart = afterHeading.indexOf("```");
  if (fenceStart < 0) throw new Error(`no fenced block after heading: ${heading}`);
  const afterFenceOpen = afterHeading.slice(fenceStart + 3);
  const firstNewline = afterFenceOpen.indexOf("\n");
  const body = afterFenceOpen.slice(firstNewline + 1);
  const fenceEnd = body.indexOf("```");
  if (fenceEnd < 0) throw new Error(`unterminated fenced block after heading: ${heading}`);
  return body.slice(0, fenceEnd);
}

describe("examples gallery: no drift from meta.example", () => {
  it.each(Object.keys(HEADINGS))("%s's gallery snippet matches its resolved example", async (name) => {
    const markdown = fs.readFileSync(GALLERY, "utf8");
    const gallerySnippet = extractFence(markdown, HEADINGS[name] as string).trim();

    const all = loadAllTemplates(BUNDLED, undefined);
    const resolved = await resolveTemplate("examples", all);
    const entry = resolved.components[name];
    if (!entry) throw new Error(`component '${name}' not found in resolved 'examples' template`);
    const resolvedExample = (entry.example ?? entry.def.meta.example ?? "").trim();

    expect(gallerySnippet).toBe(resolvedExample);
  });
});
