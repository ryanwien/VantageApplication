import { describe, it, expect } from "vitest";
import { loadLinks, serializeLinks, addDemoLink, removeLink, unlinkedInstitutions } from "./links.js";

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

// Regression: a demo book must not hide its own institution from the connect
// sheet. This filtered on institutionId alone, so linking the demo — the free,
// obvious first click — made the real account permanently unreachable.
describe("unlinkedInstitutions", () => {
  const INST = [{ id: "robinhood" }, { id: "schwab" }, { id: "morgan-stanley" }];
  const demoSchwab = { institutionId: "schwab", demo: true };
  const liveRobinhood = { institutionId: "robinhood", demo: false };

  it("still offers an institution that only has a DEMO book", () => {
    const out = unlinkedInstitutions(INST, [demoSchwab]);
    expect(out.map((i) => i.id)).toEqual(["robinhood", "schwab", "morgan-stanley"]);
  });

  it("hides an institution that has a real link", () => {
    const out = unlinkedInstitutions(INST, [liveRobinhood, demoSchwab]);
    expect(out.map((i) => i.id)).toEqual(["schwab", "morgan-stanley"]);
  });

  // With no live path there is nothing better to offer, and a second press
  // would no-op — so the demo counts as the link.
  it("treats a demo book as linked when there is no live path at all", () => {
    const out = unlinkedInstitutions(INST, [demoSchwab], { isDemoMode: true });
    expect(out.map((i) => i.id)).toEqual(["robinhood", "morgan-stanley"]);
  });

  it("offers everything when nothing is linked, and survives junk", () => {
    expect(unlinkedInstitutions(INST, []).length).toBe(3);
    expect(unlinkedInstitutions().length).toBe(0);
    expect(unlinkedInstitutions(INST, [{}]).map((i) => i.id)).toEqual(["robinhood", "schwab", "morgan-stanley"]);
  });
});
