import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const dir = path.resolve(import.meta.dirname, "../../templates/base/components");
const at = (f: string) => path.join(dir, f);

describe("pagebreak", () => {
  it("emits a clearpage", async () => {
    expect(await renderComponent(at("pagebreak.component.yaml"))).toContain("\\clearpage");
  });
});

describe("pullquote", () => {
  it("wraps children in a quote environment", async () => {
    const out = await renderComponent(
      at("pullquote.component.yaml"),
      {},
      {
        children: "Ship it.",
      },
    );
    expect(out).toContain("\\begin{druckpullquote}");
    expect(out).toContain("Ship it.");
  });

  it("renders an attribution when given", async () => {
    const out = await renderComponent(
      at("pullquote.component.yaml"),
      { attribution: "Ada L." },
      { children: "Ship it." },
    );
    // Exact-output assertion, not a loose toContain: `\upshapeAda L.` also
    // "contains" "Ada L.", which is exactly how the `\controlword{{param}}`
    // gluing bug (\upshape + {{attribution}} with no separator producing the
    // undefined macro \upshapeAda) slipped past this test before.
    expect(out).toContain("\\hfill\\normalsize\\upshape Ada L.\n");
    // General guard: a control word must never be immediately followed by a
    // letter that isn't part of the word itself — that glues into one
    // undefined macro name.
    expect(out).not.toMatch(/\\upshape[A-Za-z]/);
  });
});

describe("deflist", () => {
  it("renders each pair as a description item", async () => {
    const out = await renderComponent(at("deflist.ts"), {
      pairs: "Token=A named style value; Template=A named set of components",
    });
    expect(out).toContain("\\begin{description}");
    // NOTE: the task brief's test used "A named style value." with a trailing
    // period that isn't present in the `pairs` input above (nor does the spec's
    // deflist.ts add one) — corrected here to match the actual input text.
    expect(out).toContain("\\item[Token] A named style value");
    expect(out).toContain("\\item[Template] A named set of components");
    expect(out).toContain("\\end{description}");
  });

  // A description environment whose body is not a sequence of \item commands is
  // a LaTeX error ("Something's wrong--perhaps a missing \\item"), which is why
  // this takes structured pairs rather than free Markdown children.
  it("emits no empty items for a trailing separator", async () => {
    const out = await renderComponent(at("deflist.ts"), { pairs: "A=1;" });
    expect(out.match(/\\item\[/g) ?? []).toHaveLength(1);
  });

  it("escapes terms and definitions", async () => {
    const out = await renderComponent(at("deflist.ts"), { pairs: "R&D=50% faster" });
    expect(out).toContain("R\\&D");
    expect(out).toContain("50\\% faster");
  });
});
