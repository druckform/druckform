import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderComponent } from "../helpers/render-component.js";

const IMG = path.resolve(import.meta.dirname, "../../templates/base/components/block-image.ts");

describe("block:image height cap", () => {
  it("applies the default image cap when there is no directive", async () => {
    const out = await renderComponent(
      IMG,
      {},
      {
        element: { kind: "image", src: "/abs/logo.pdf", alt: "logo", title: null },
      },
    );
    expect(out).toBe(
      "\\includegraphics[max width=\\linewidth, max totalheight=\\druckImageMaxHeight]{/abs/logo.pdf}",
    );
  });

  it("uses a per-image maxheight from the title directive", async () => {
    const out = await renderComponent(
      IMG,
      {},
      {
        element: { kind: "image", src: "/abs/tall.pdf", alt: "t", title: "maxheight=0.5" },
      },
    );
    expect(out).toBe(
      "\\includegraphics[max width=\\linewidth, max totalheight=0.5\\textheight]{/abs/tall.pdf}",
    );
  });

  it("falls back to the default cap for a non-directive title", async () => {
    const out = await renderComponent(
      IMG,
      {},
      {
        element: { kind: "image", src: "/abs/x.pdf", alt: "x", title: "A photo" },
      },
    );
    expect(out).toContain("max totalheight=\\druckImageMaxHeight");
  });
});
