import fs from "node:fs";
import yaml from "js-yaml";
import type { ASTNode, ParsedDocument } from "../sdk/types.js";
import { parseDirectiveAttributes } from "./directive-attrs.js";

// Container: three colons, tight name, optional {attrs}. Closed by a `:::` line.
const CONTAINER_OPEN_RE = /^:::([A-Za-z][\w-]*)\s*(?:\{([^}]*)\})?\s*$/;
const CONTAINER_CLOSE_RE = /^:::\s*$/;
// Leaf: two colons, tight name, optional [content], optional {attrs}, own line.
const LEAF_RE = /^::([A-Za-z][\w-]*)(?:\[([^\]]*)\])?\s*(?:\{([^}]*)\})?\s*$/;

// Detects a leading `---` … `---` YAML frontmatter block. Only a `---` on the
// very first line with a later closing `---` counts; otherwise the leading `---`
// is ordinary content (e.g. a GFM horizontal rule). Body source-line numbers are
// preserved because the body is parsed from `bodyStart` against the same array.
function extractFrontmatter(lines: string[]): {
  frontmatter: Record<string, string>;
  bodyStart: number;
} {
  if (lines[0]?.trim() !== "---") return { frontmatter: {}, bodyStart: 0 };
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      close = i;
      break;
    }
  }
  if (close < 0) return { frontmatter: {}, bodyStart: 0 };
  const parsed = (yaml.load(lines.slice(1, close).join("\n")) ?? {}) as Record<string, unknown>;
  const frontmatter: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== null && typeof v !== "object") frontmatter[k] = String(v);
  }
  return { frontmatter, bodyStart: close + 1 };
}

export function parseDocument(filePath: string): ParsedDocument {
  return parseMarkdownString(fs.readFileSync(filePath, "utf8"));
}

export function parseMarkdownString(content: string): ParsedDocument {
  const lines = content.split("\n");
  const { frontmatter, bodyStart } = extractFrontmatter(lines);
  const [nodes] = parseLines(lines, bodyStart);
  return { nodes, frontmatter };
}

function parseLines(lines: string[], startLine: number): [ASTNode[], number] {
  const nodes: ASTNode[] = [];
  let i = startLine;
  let textBuf: string[] = [];
  let textStartLine = i + 1;

  const flushText = () => {
    const content = textBuf.join("\n").trim();
    if (content) {
      nodes.push({ type: "text", content, sourceLine: textStartLine });
    }
    textBuf = [];
    textStartLine = i + 1;
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const containerOpen = CONTAINER_OPEN_RE.exec(line);
    const isClose = CONTAINER_CLOSE_RE.test(line) && !containerOpen;

    if (isClose) {
      flushText();
      return [nodes, i]; // caller consumes the closing :::
    }

    if (containerOpen) {
      flushText();
      const name = containerOpen[1] ?? "";
      const params = parseDirectiveAttributes(containerOpen[2] ?? "");
      const sourceLine = i + 1;
      i++;
      const [children, closedAt] = parseLines(lines, i);
      i = closedAt + 1; // skip the closing :::
      nodes.push({
        type: "component",
        block: { name, params, children, sourceLine, form: "container" },
      });
      textStartLine = i + 1;
      continue;
    }

    const leaf = LEAF_RE.exec(line);
    if (leaf) {
      flushText();
      const name = leaf[1] ?? "";
      const content = leaf[2];
      const params = parseDirectiveAttributes(leaf[3] ?? "");
      const sourceLine = i + 1;
      const children: ASTNode[] = content ? [{ type: "text", content, sourceLine }] : [];
      nodes.push({
        type: "component",
        block: { name, params, children, sourceLine, form: "leaf" },
      });
      i++;
      textStartLine = i + 1;
      continue;
    }

    textBuf.push(line);
    i++;
  }

  flushText();
  return [nodes, i];
}
