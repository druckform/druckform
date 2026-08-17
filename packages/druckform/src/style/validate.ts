import fs from "node:fs";
import { Ajv } from "ajv";
import yaml from "js-yaml";
import type { StyleConfig } from "../sdk/types.js";

// Schema is inlined (not read from schemas/style-v1.json) to avoid import.meta.url
// path resolution issues when tsup bundles all commands into dist/cli.js.
// schemas/style-v1.json is the editor-facing copy (referenced by the
// `yaml-language-server` line in style files). This constant is the source of
// truth: edit it, then run `pnpm --filter @druckform/core schema:sync` to
// regenerate the JSON. style-schema-sync.test.ts fails if the two drift.
export const STYLE_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "style-v1",
  title: "Druckform Style v1",
  type: "object",
  required: ["tokens"],
  definitions: {
    // A font is a bare family name, or a name plus fontspec options —
    // e.g. { name: "Noto Sans", options: "AutoFakeBold=2.2" } for a variable
    // font with no selectable Bold instance. Mirrors FontSpec in sdk/types.ts.
    fontSpec: {
      anyOf: [
        { type: "string" },
        {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            options: { type: "string" },
          },
          additionalProperties: false,
        },
      ],
    },
  },
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
            main: { $ref: "#/definitions/fontSpec" },
            mono: { $ref: "#/definitions/fontSpec" },
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
            themeVariables: { type: "object", additionalProperties: { type: "string" } },
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
const validate = ajv.compile(STYLE_SCHEMA);

export function loadStyle(stylePath: string): StyleConfig {
  const raw = fs.readFileSync(stylePath, "utf8");
  const data = yaml.load(raw);
  if (!validate(data)) {
    const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join("; ");
    throw new Error(`Invalid style.yaml: ${errors}`);
  }
  return data as StyleConfig;
}
