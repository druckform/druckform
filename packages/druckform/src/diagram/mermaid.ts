import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { StyleConfig } from "../sdk/types.js";

export function renderMermaid(
  content: string,
  styleConfig: StyleConfig,
  workDir: string,
  index: number,
): string {
  const inputFile = path.join(workDir, `mermaid-${index}.mmd`);
  const svgFile = path.join(workDir, `mermaid-${index}.svg`);
  const pdfFile = path.join(workDir, `mermaid-${index}.pdf`);

  fs.writeFileSync(inputFile, content, "utf8");

  const theme = styleConfig.diagrams?.mermaid?.theme ?? "default";
  const result = spawnSync("mmdc", ["-i", inputFile, "-o", svgFile, "-t", theme], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`mermaid rendering failed: ${result.stderr}`);
  }

  // Convert SVG → PDF using rsvg-convert
  const pdfResult = spawnSync("rsvg-convert", ["-f", "pdf", "-o", pdfFile, svgFile], {
    encoding: "utf8",
  });
  if (pdfResult.status !== 0) {
    throw new Error(`SVG→PDF conversion failed: ${pdfResult.stderr}`);
  }

  return pdfFile;
}
