import type { StyleConfig } from "../sdk/types.js";

/**
 * Deep-merges two style configs (`over` wins per key). Used to combine a
 * template's declared style with styles inherited down the extends chain, and
 * then with an optional external override. The result is normalized so
 * `tokens.colors`/`fonts`/`spacing` are always present.
 */
export function mergeStyle(
  base: StyleConfig | undefined,
  over: StyleConfig | undefined,
): StyleConfig {
  const b = base?.tokens ?? {};
  const o = over?.tokens ?? {};
  const merged: StyleConfig = {
    $schema: over?.$schema ?? base?.$schema ?? "style-v1",
    tokens: {
      colors: { ...(b.colors ?? {}), ...(o.colors ?? {}) },
      fonts: { ...(b.fonts ?? {}), ...(o.fonts ?? {}) },
      spacing: { ...(b.spacing ?? {}), ...(o.spacing ?? {}) },
    },
  };
  const diagrams = { ...(base?.diagrams ?? {}), ...(over?.diagrams ?? {}) };
  if (Object.keys(diagrams).length > 0) merged.diagrams = diagrams;
  return merged;
}
