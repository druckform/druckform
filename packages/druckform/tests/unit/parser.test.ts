import { describe, expect, it } from "vitest";
import { parseMarkdownString } from "../../src/parse/parser.js";

describe("parseMarkdownString", () => {
  it("parses plain text as a single text node", () => {
    const doc = parseMarkdownString("Hello world\n\nMore text");
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]).toMatchObject({ type: "text", content: "Hello world\n\nMore text" });
  });

  it("parses a single component block", () => {
    const doc = parseMarkdownString(`::: infobox title="Note"\nBody text\n:::`);
    expect(doc.nodes).toHaveLength(1);
    const node = doc.nodes[0];
    expect(node?.type).toBe("component");
    if (node?.type === "component") {
      expect(node.block.name).toBe("infobox");
      expect(node.block.params["title"]).toBe("Note");
    }
  });

  it("parses text before and after a component", () => {
    const doc = parseMarkdownString("Before\n::: box title=\"A\"\nInside\n:::\nAfter");
    expect(doc.nodes).toHaveLength(3);
    expect(doc.nodes[0]?.type).toBe("text");
    expect(doc.nodes[1]?.type).toBe("component");
    expect(doc.nodes[2]?.type).toBe("text");
  });

  it("parses nested components", () => {
    const doc = parseMarkdownString(
      '::: outer title="O"\n::: inner title="I"\nText\n:::\n:::'
    );
    expect(doc.nodes).toHaveLength(1);
    const outer = doc.nodes[0];
    if (outer?.type === "component") {
      expect(outer.block.children).toHaveLength(1);
      expect(outer.block.children[0]?.type).toBe("component");
    }
  });

  it("records source line numbers", () => {
    const doc = parseMarkdownString('Line1\n::: box title="A"\nBody\n:::');
    const comp = doc.nodes[1];
    if (comp?.type === "component") {
      expect(comp.block.sourceLine).toBe(2);
    }
  });
});
