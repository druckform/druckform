import { spawnSync } from "node:child_process";
import type {
  TemplatesContract,
  ComponentsContract,
  LintContract,
  RenderContract,
} from "druckform";

function run(args: string[]): { ok: boolean; stdout: string; stderr: string } {
  // Read env var at call time so tests can set it in beforeAll
  const binRaw = process.env["DRUCK_BIN"] ?? "druck";
  const binParts = binRaw.split(" ");
  const cmd = binParts[0] ?? "druck";
  const cmdArgs = binParts.slice(1);

  const result = spawnSync(cmd, [...cmdArgs, ...args, "--json"], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) {
    return { ok: false, stdout: "", stderr: result.error.message };
  }
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function runOrThrow(args: string[]): string {
  const { ok, stdout, stderr } = run(args);
  if (!ok) {
    throw new Error(`druck ${args[0]} failed: ${stderr || "empty output"}`);
  }
  return stdout;
}

export function listTemplates(): TemplatesContract {
  return JSON.parse(runOrThrow(["templates"])) as TemplatesContract;
}

export function listComponents(template: string): ComponentsContract {
  return JSON.parse(runOrThrow(["components", "--template", template])) as ComponentsContract;
}

export function lintDocument(
  template: string,
  inFile: string,
  stylePath: string,
): LintContract {
  return JSON.parse(runOrThrow(["lint", "--template", template, "--in", inFile, "--style", stylePath])) as LintContract;
}

export function renderDocument(
  template: string,
  stylePath: string,
  inFile: string,
  assetsDir: string,
  outPdf: string,
): RenderContract {
  return JSON.parse(runOrThrow([
    "render",
    "--template", template,
    "--style", stylePath,
    "--in", inFile,
    "--assets", assetsDir,
    "--out", outPdf,
  ])) as RenderContract;
}
