import { describe, it, expect } from "vitest";
import { loadLinks, serializeLinks, addDemoLink, removeLink } from "./links.js";

describe("loadLinks", () => {
  it("rebuilds a demo book from a stored id", () => {
    const links = loadLinks(JSON.stringify([{ id: "morgan-stanley", at: 42 }]));
    expect(links).toHaveLength(1);
    expect(links[0].institutionName).toBe("Morgan Stanley");
    expect(links[0].connectedAt).toBe(42);
    expect(links[0].demo).toBe(true);
    expect(links[0].accounts.length).toBeGreaterThan(0);
  });

  it("accepts a bare id as well as a record", () => {
    expect(loadLinks(JSON.stringify(["schwab"]))[0].institutionId).toBe("schwab");
  });

  it("drops duplicates, unknown ids and junk", () => {
    const links = loadLinks(JSON.stringify(["schwab", "schwab", "etrade", null, 7, { at: 1 }]));
    expect(links.map((l) => l.institutionId)).toEqual(["schwab"]);
  });

  it("treats an unreadable value as no links, never as a crash", () => {
    expect(loadLinks("{not json")).toEqual([]);
    expect(loadLinks("{}")).toEqual([]);
    expect(loadLinks(null)).toEqual([]);
    expect(loadLinks(undefined)).toEqual([]);
  });
});

describe("serializeLinks", () => {
  it("stores ids, not books — so improving the demo data cannot strand an old shape", () => {
    const links = loadLinks(JSON.stringify([{ id: "robinhood", at: 9 }]));
    expect(JSON.parse(serializeLinks(links))).toEqual([{ id: "robinhood", at: 9 }]);
  });

  it("round-trips", () => {
    const a = addDemoLink(addDemoLink([], "schwab", 1), "robinhood", 2);
    expect(loadLinks(serializeLinks(a))).toEqual(a);
  });
});

describe("addDemoLink / removeLink", () => {
  it("adds one", () => {
    expect(addDemoLink([], "robinhood", 1).map((c) => c.institutionId)).toEqual(["robinhood"]);
  });

  it("refuses to link the same institution twice", () => {
    const once = addDemoLink([], "schwab", 1);
    expect(addDemoLink(once, "schwab", 2)).toBe(once);
  });

  it("refuses an institution that is not in the catalog", () => {
    const before = [];
    expect(addDemoLink(before, "wells-fargo")).toBe(before);
  });

  it("removes by institution", () => {
    const two = addDemoLink(addDemoLink([], "schwab", 1), "robinhood", 2);
    expect(removeLink(two, "schwab").map((c) => c.institutionId)).toEqual(["robinhood"]);
    expect(removeLink(two, "nope")).toHaveLength(2);
  });
});
