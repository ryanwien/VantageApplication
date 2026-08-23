import { describe, it, expect } from "vitest";
import { parseInline, parseBlocks, hasMarkup } from "./richtext.js";

const text = spans => spans.map(s => s.v).join("");
const types = spans => spans.map(s => s.t);

describe("parseInline", () => {
  it("returns the whole line as text when there is no markup", () => {
    expect(parseInline("just words")).toEqual([{ t: "text", v: "just words" }]);
  });

  it("never returns an empty span list", () => {
    expect(parseInline("").length).toBe(1);
  });

  it("reads strong in both spellings", () => {
    expect(parseInline("a **b** c")).toEqual([
      { t: "text", v: "a " }, { t: "b", v: "b" }, { t: "text", v: " c" },
    ]);
    expect(types(parseInline("__b__"))).toEqual(["b"]);
  });

  it("does not mistake strong for two empty emphases", () => {
    expect(types(parseInline("**NVDA**"))).toEqual(["b"]);
  });

  it("leaves snake_case alone", () => {
    expect(parseInline("call get_row_data now")).toEqual([{ t: "text", v: "call get_row_data now" }]);
  });

  it("keeps code spans literal", () => {
    const spans = parseInline("use `**not bold**` here");
    expect(spans[1]).toEqual({ t: "code", v: "**not bold**" });
  });

  it("links [label](href) and keeps the label", () => {
    expect(parseInline("see [docs](https://example.com/x)")[1])
      .toEqual({ t: "link", v: "docs", href: "https://example.com/x" });
  });

  it("autolinks a bare url", () => {
    const spans = parseInline("go to https://example.com now");
    expect(spans[1]).toEqual({ t: "link", v: "https://example.com", href: "https://example.com" });
  });

  it("strips an unsafe href but keeps its words", () => {
    const spans = parseInline("click [here](javascript:alert(1))");
    expect(spans.some(s => s.t === "link")).toBe(false);
    expect(text(spans)).toContain("here");
  });

  it("never emits a non-http href", () => {
    for (const bad of ["javascript:x", "data:text/html,x", "vbscript:x", "file:///etc"]) {
      const spans = parseInline(`[a](${bad})`);
      expect(spans.filter(s => s.t === "link")).toEqual([]);
    }
  });

  it("preserves every character of the original line", () => {
    const line = "a **b** and `c` and [d](https://e.com) tail";
    expect(text(parseInline(line))).toBe("a b and c and d tail");
  });
});

describe("parseBlocks", () => {
  it("returns no blocks for empty input", () => {
    expect(parseBlocks("")).toEqual([]);
    expect(parseBlocks(null)).toEqual([]);
  });

  it("joins soft-wrapped lines into one paragraph", () => {
    const b = parseBlocks("one line\nsecond line");
    expect(b.length).toBe(1);
    expect(text(b[0].spans)).toBe("one line second line");
  });

  it("splits paragraphs on a blank line", () => {
    expect(parseBlocks("a\n\nb").map(x => x.type)).toEqual(["p", "p"]);
  });

  it("collects consecutive bullets into one list", () => {
    const b = parseBlocks("- one\n- two\n- three");
    expect(b.length).toBe(1);
    expect(b[0].type).toBe("ul");
    expect(b[0].items.length).toBe(3);
  });

  it("reads numbered lists and keeps the starting number", () => {
    const b = parseBlocks("3. three\n4. four");
    expect(b[0].type).toBe("ol");
    expect(b[0].start).toBe(3);
    expect(b[0].items.length).toBe(2);
  });

  it("does not merge a bullet list into a numbered one", () => {
    expect(parseBlocks("- a\n1. b").map(x => x.type)).toEqual(["ul", "ol"]);
  });

  it("ends a list when prose follows it", () => {
    const b = parseBlocks("- a\n- b\nThat is the summary.");
    expect(b.map(x => x.type)).toEqual(["ul", "p"]);
    expect(text(b[1].spans)).toBe("That is the summary.");
  });

  it("reads headings at every level", () => {
    const b = parseBlocks("# one\n### three");
    expect(b.map(x => x.level)).toEqual([1, 3]);
  });

  it("takes a fenced block verbatim, markup and all", () => {
    const b = parseBlocks("before\n```js\nconst a = **1**;\n```\nafter");
    expect(b.map(x => x.type)).toEqual(["p", "code", "p"]);
    expect(b[1].lang).toBe("js");
    expect(b[1].text).toBe("const a = **1**;");
  });

  it("closes an unterminated fence at end of input instead of dropping it", () => {
    const b = parseBlocks("```\nstill code");
    expect(b.length).toBe(1);
    expect(b[0].type).toBe("code");
    expect(b[0].text).toBe("still code");
  });

  it("reads blockquotes and rules", () => {
    expect(parseBlocks("> quoted").map(x => x.type)).toEqual(["quote"]);
    expect(parseBlocks("---").map(x => x.type)).toEqual(["hr"]);
  });

  it("handles a realistic model answer", () => {
    const b = parseBlocks([
      "**NVDA** closed at `$124.60`, down 3.8%.",
      "",
      "Three things moved it:",
      "- Broad semiconductor weakness",
      "- A downgrade from [Analyst Co](https://example.com/note)",
      "- Profit-taking after the run",
      "",
      "Net: the trend is intact.",
    ].join("\n"));
    expect(b.map(x => x.type)).toEqual(["p", "p", "ul", "p"]);
    expect(b[2].items.length).toBe(3);
    expect(b[2].items[1].some(s => s.t === "link")).toBe(true);
  });
});

describe("hasMarkup", () => {
  it("is false for plain prose so the cheap path is taken", () => {
    expect(hasMarkup("The market closed lower today.")).toBe(false);
    expect(hasMarkup("")).toBe(false);
    expect(hasMarkup(undefined)).toBe(false);
  });

  it("is true for each construct the parser handles", () => {
    for (const s of ["**a**", "- a", "1. a", "# a", "> a", "```", "`a`", "[a](https://b.c)", "https://b.c"]) {
      expect(hasMarkup(s), s).toBe(true);
    }
  });
});
