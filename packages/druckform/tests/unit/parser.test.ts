import { describe, expect, it } from "vitest";
import { parseMarkdownString } from "../../src/parse/parser.js";

describe("parseMarkdownString", () => {
  it("parses plain text as a single text node", () => {
    const doc = parseMarkdownString("Hello world\n\nMore text");
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]).toMatchObject({ type: "text", content: "Hello world\n\nMore text" });
  });

  it("parses text before and after a component", () => {
    const doc = parseMarkdownString('Before\n:::box{title="A"}\nInside\n:::\nAfter');
    expect(doc.nodes).toHaveLength(3);
    expect(doc.nodes[0]?.type).toBe("text");
    expect(doc.nodes[1]?.type).toBe("component");
    expect(doc.nodes[2]?.type).toBe("text");
  });

  it("records source line numbers", () => {
    const doc = parseMarkdownString('Line1\n:::box{title="A"}\nBody\n:::');
    const comp = doc.nodes[1];
    if (comp?.type === "component") {
      expect(comp.block.sourceLine).toBe(2);
    }
  });
});

describe("directive block parser", () => {
  it("parses a tight container with brace attributes", () => {
    const doc = parseMarkdownString(':::infobox{title="Note" #n .warn}\nbody\n:::\n');
    const node = doc.nodes[0];
    if (node?.type !== "component") throw new Error("expected component");
    expect(node.block.name).toBe("infobox");
    expect(node.block.form).toBe("container");
    expect(node.block.params).toEqual({ title: "Note", id: "n", class: "warn" });
    expect(node.block.children[0]).toMatchObject({ type: "text", content: "body" });
  });

  it("parses nested containers", () => {
    const doc = parseMarkdownString(":::outer{}\n:::inner{}\nx\n:::\n:::\n");
    const outer = doc.nodes[0];
    if (outer?.type !== "component") throw new Error("expected component");
    expect(outer.block.name).toBe("outer");
    const inner = outer.block.children.find((n) => n.type === "component");
    expect(inner && inner.type === "component" && inner.block.name).toBe("inner");
  });

  it("parses a leaf directive (two colons, no body)", () => {
    const doc = parseMarkdownString("::figure[A cat]{src=cat.pdf}\n");
    const node = doc.nodes[0];
    if (node?.type !== "component") throw new Error("expected component");
    expect(node.block.name).toBe("figure");
    expect(node.block.form).toBe("leaf");
    expect(node.block.params).toEqual({ src: "cat.pdf" });
    expect(node.block.children[0]).toMatchObject({ type: "text", content: "A cat" });
  });

  it("treats a leaf with no content/attrs as an empty-children component", () => {
    const doc = parseMarkdownString("::pagebreak\n");
    const node = doc.nodes[0];
    if (node?.type !== "component") throw new Error("expected component");
    expect(node.block.form).toBe("leaf");
    expect(node.block.children).toEqual([]);
  });
});
