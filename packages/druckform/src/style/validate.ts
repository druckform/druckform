import fs from "node:fs";
import { Ajv } from "ajv";
import yaml from "js-yaml";
import type { StyleConfig } from "../sdk/types.js";

// Schema is inlined (not read from schemas/style-v1.json) to avoid import.meta.url
// path resolution issues when tsup bundles all commands into dist/cli.js.
// IMPORTANT: if schemas/style-v1.json is updated, update this copy too.
const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "style-v1",
  title: "Druckform Style v1",
  type: "object",
  required: ["tokens"],
  properties: {
    $schema: { type: "string" },
    tokens: {
      type: "object",
      properties: {
        colors: {
          type: "object",
          additionalProperties: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
        },
        fonts: {
          type: "object",
          properties: {
            main: { type: "string" },
            mono: { type: "string" },
          },
          additionalProperties: false,
        },
        spacing: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
      additionalProperties: false,
    },
    diagrams: {
      type: "object",
      properties: {
        mermaid: {
          type: "object",
          properties: {
            theme: { type: "string" },
            themeVariablesRef: { type: "string" },
          },
          additionalProperties: false,
        },
        plantuml: {
          type: "object",
          properties: { skinRef: { type: "string" } },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;

const ajv = new Ajv();
const validate = ajv.compile(schema);

export function loadStyle(stylePath: string): StyleConfig {
  const raw = fs.readFileSync(stylePath, "utf8");
  const data = yaml.load(raw);
  if (!validate(data)) {
    const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join("; ");
    throw new Error(`Invalid style.yaml: ${errors}`);
  }
  return data as StyleConfig;
}
