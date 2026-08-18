import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const dir = path.resolve(import.meta.dirname, "../../templates/consulting/components");
const at = (f: string) => path.join(dir, f);
const REF = path.resolve(import.meta.dirname, "../../templates/base/components/ref.ts");

const base = { severity: "high", id: "F-01", title: "Secrets in CI logs" };

describe("finding", () => {
  it("renders id, severity label and title", async () => {
    const out = await renderComponent(at("finding.ts"), base, { children: "body" });
    expect(out).toContain("F-01");
    expect(out).toContain("High");
    expect(out).toContain("Secrets in CI logs");
    expect(out).toContain("body");
  });

  // Each severity must reach a DISTINCT token. callout once mapped every
  // variant except one to the same colour, so `danger` rendered as `info`.
  it.each([
    ["critical", "\\druckSeverityCritical"],
    ["high", "\\druckSeverityHigh"],
    ["medium", "\\druckSeverityMedium"],
    ["low", "\\druckSeverityLow"],
  ])("severity %s uses %s", async (severity, token) => {
    const out = await renderComponent(at("finding.ts"), { ...base, severity });
    expect(out).toContain(token);
  });

  it("rejects an unknown severity", async () => {
    await expect(
      renderComponent(at("finding.ts"), { ...base, severity: "showstopper" }),
    ).rejects.toThrow();
  });

  it("escapes id and title", async () => {
    const out = await renderComponent(at("finding.ts"), {
      ...base,
      id: "F&1",
      title: "100% of tokens",
    });
    expect(out).toContain("F\\&1");
    expect(out).toContain("100\\% of tokens");
  });

  it("writes exactly one index entry, protected for the aux file", async () => {
    const out = await renderComponent(at("finding.ts"), base);
    expect(out.match(/\\addcontentsline\{fnd\}\{finding\}/g) ?? []).toHaveLength(1);
    expect(out).toContain("\\protect\\findingentry");
  });

  // The figure/ref bug: one side emitted the id raw while the other received it
  // escaped, so the label and the reference disagreed and the PDF said "??".
  it("produces a label byte-identical to what ref{kind=finding} references", async () => {
    const out = await renderComponent(at("finding.ts"), { ...base, id: "acme_prod_2026" });
    const ref = await renderComponent(REF, { kind: "finding" }, { children: "acme_prod_2026" });
    const label = out.match(/\\label\{(finding:[^}]*)\}/)?.[1];
    const target = ref.match(/\\ref\{(finding:[^}]*)\}/)?.[1];
    expect(label).toBeDefined();
    expect(target).toBe(label);
  });

  // A finding's id IS its display name (unlike figure's auto-numbering), so
  // :ref[F-01]{kind=finding} must print "F-01", not a page number: the
  // current label is set from the id, never from \thepage.
  it("sets the current label to the finding's own id, not the page", async () => {
    const out = await renderComponent(at("finding.ts"), base);
    expect(out).toContain("\\druckcurrentfindinglabel{F-01}");
    expect(out).not.toContain("\\thepage");
  });
});

describe("finding sub-components", () => {
  it.each([
    ["impact.component.yaml", "Impact"],
    ["evidence.component.yaml", "Evidence"],
    ["recommendation.component.yaml", "Recommendation"],
  ])("%s renders its label and children", async (file, label) => {
    const out = await renderComponent(at(file), {}, { children: "the body" });
    expect(out).toContain(label);
    expect(out).toContain("the body");
  });

  // Containment is NOT enforced by the engine, so each part must render sanely
  // on its own rather than assuming a :::finding wrapper.
  it("renders standalone without a parent finding", async () => {
    const out = await renderComponent(at("impact.component.yaml"), {}, { children: "x" });
    expect(out.trim().length).toBeGreaterThan(0);
    expect(out).not.toContain("undefined");
  });
});
