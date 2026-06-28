import path from "node:path";
import type { ComponentDef } from "../sdk/types.js";
import { loadDeclarativeComponent } from "./declarative.js";
import { loadTypeScriptComponent } from "./typescript.js";

export async function loadComponent(
  sourcePath: string,
  _templateDir: string,
): Promise<ComponentDef> {
  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === ".yaml" || ext === ".yml") {
    return loadDeclarativeComponent(sourcePath);
  }
  if (ext === ".ts" || ext === ".js" || ext === ".mjs") {
    return loadTypeScriptComponent(sourcePath);
  }
  throw new Error(`Unknown component file extension: ${ext} (${sourcePath})`);
}
