import fs from "node:fs";
import type { ASTNode, ComponentBlock, ParsedDocument } from "../sdk/types.js";

const OPEN_RE = /^:::\s+(\S+)(.*)?$/;
const CLOSE_RE = /^:::$/;
const ATTR_RE = /(\w+)="([^"]*)"/g;

function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = new RegExp(ATTR_RE.source, "g");
  for (let match = re.exec(attrStr); match !== null; match = re.exec(attrStr)) {
    attrs[match[1] ?? ""] = match[2] ?? "";
  }
  return attrs;
}

export function parseDocument(filePath: string): ParsedDocument {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const [nodes] = parseLines(lines, 0);
  return { nodes };
}

export function parseMarkdownString(content: string): ParsedDocument {
  const lines = content.split("\n");
  const [nodes] = parseLines(lines, 0);
  return { nodes };
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
    const openMatch = OPEN_RE.exec(line);
    const closeMatch = CLOSE_RE.test(line) && !openMatch;

    if (closeMatch) {
      flushText();
      return [nodes, i]; // caller consumes the :::
    }

    if (openMatch) {
      flushText();
      const name = openMatch[1] ?? "";
      const attrStr = openMatch[2] ?? "";
      const params = parseAttrs(attrStr);
      const sourceLine = i + 1;
      i++;
      const [children, closedAt] = parseLines(lines, i);
      i = closedAt + 1; // skip the closing :::
      const block: ComponentBlock = { name, params, children, sourceLine };
      nodes.push({ type: "component", block });
      textStartLine = i + 1;
      continue;
    }

    textBuf.push(line);
    i++;
  }

  flushText();
  return [nodes, i];
}
