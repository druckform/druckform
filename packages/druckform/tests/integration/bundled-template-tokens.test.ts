import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeStyle } from "../../src/style/merge.js";
import { checkTokenCoverage, extractRequiredTokens } from "../../src/style/tokens.js";
import { loadAllTemplates } from "../../src/template/loader.js";
import { resolveTemplate } from "../../src/template/resolver.js";

const BUNDLED = path.resolve(import.meta.dirname, "../../templates");

// A bundled template must be usable with no external style at all. Otherwise the
// author has to divine which colours their chosen template needs — which is how
// `report` came to fail on any style that did not happen to define `warning`.
describe.each(["base", "report", "examples", "consulting"])(
  "bundled template '%s' satisfies its own required tokens",
  (name) => {
    it("renders with no external style", async () => {
      const all = loadAllTemplates(BUNDLED, undefined);
      const resolved = await resolveTemplate(name, all);
      const style = mergeStyle(resolved.style, undefined);
      const findings = checkTokenCoverage(extractRequiredTokens(resolved), resolved, style);
      expect(findings).toEqual([]);
    });
  },
);
