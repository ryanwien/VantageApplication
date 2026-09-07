import { describe, it, expect } from "vitest";
import { loadLinks, serializeLinks, addDemoLink, removeLink, unlinkedInstitutions, partialCoverage, linkRoute } from "./links.js";

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

// Robinhood's own key reaches crypto and nothing else, so a crypto link must
// not stand in for the equities an aggregator would bring.
describe("unlinkedInstitutions with a partial (crypto-only) link", () => {
  const INST = [{ id: "robinhood" }, { id: "schwab" }, { id: "morgan-stanley" }];
  const cryptoRH = { institutionId: "robinhood", demo: false, provider: "robinhood-crypto" };
  const plaidRH = { institutionId: "robinhood", demo: false, provider: "plaid" };

  it("keeps Robinhood offered when only the crypto key is linked and Plaid exists", () => {
    const out = unlinkedInstitutions(INST, [cryptoRH], { aggregator: true });
    expect(out.map((i) => i.id)).toContain("robinhood");
  });

  // Nothing better to offer: promising an upgrade this server cannot make is
  // worse than leaving the row out.
  it("hides it when no aggregator is configured, because crypto is all there is", () => {
    const out = unlinkedInstitutions(INST, [cryptoRH], { aggregator: false });
    expect(out.map((i) => i.id)).not.toContain("robinhood");
  });

  it("hides it once the aggregator link exists too", () => {
    const out = unlinkedInstitutions(INST, [cryptoRH, plaidRH], { aggregator: true });
    expect(out.map((i) => i.id)).not.toContain("robinhood");
  });

  it("reports what an existing partial link covers", () => {
    expect(partialCoverage("robinhood", [cryptoRH])).toBe("crypto");
    expect(partialCoverage("robinhood", [plaidRH])).toBe(null);
    expect(partialCoverage("schwab", [cryptoRH])).toBe(null);
    // A demo book is not a partial link, it is a fake one.
    expect(partialCoverage("robinhood", [{ ...cryptoRH, demo: true }])).toBe(null);
  });
});

describe("linkRoute", () => {
  const ALL = {
    plaid: { configured: true },
    schwab: { configured: true },
    "robinhood-crypto": { configured: true },
  };
  const cryptoRH = { institutionId: "robinhood", demo: false, provider: "robinhood-crypto" };

  // The reversal. Plaid used to win every institution it could reach, which
  // sent somebody holding a working Robinhood key to a phone-number form and
  // then, in sandbox, to a fixture bank wearing their brokerage's name.
  it("prefers the brokerage's own key over the aggregator", () => {
    expect(linkRoute("robinhood", { providers: ALL })).toBe("robinhood-crypto");
    expect(linkRoute("schwab", { providers: ALL })).toBe("schwab");
  });

  // The institution with no first-party path at all is the one the aggregator
  // is here for.
  it("sends Morgan Stanley to the aggregator, because it has nothing of its own", () => {
    expect(linkRoute("morgan-stanley", { providers: ALL })).toBe("plaid");
  });

  // The ADD STOCKS press: the crypto book is already linked, so the only thing
  // left to fetch is the half that key cannot reach.
  it("falls through to the aggregator once the crypto book is already linked", () => {
    expect(linkRoute("robinhood", { providers: ALL, connections: [cryptoRH] })).toBe("plaid");
  });

  // Robinhood's own branch was unreachable in EVERY configuration before this:
  // with no aggregator the handler demoed out before reaching it, and with one
  // its own guard was false. A key that is set and never used is worse than no
  // key, because the desk reports it working.
  it("uses the key when it is the only credential there is", () => {
    expect(linkRoute("robinhood", { providers: { "robinhood-crypto": { configured: true } } })).toBe("robinhood-crypto");
  });

  it("has nothing live to offer without a path to the institution", () => {
    expect(linkRoute("morgan-stanley", { providers: { "robinhood-crypto": { configured: true } } })).toBe("demo");
    expect(linkRoute("schwab", { providers: {} })).toBe("demo");
    expect(linkRoute("robinhood", {})).toBe("demo");
  });

  // The switch has to reach the ROUTE, not only the label. While demo mode was
  // known to the sheet alone, a button reading DEMO opened Plaid's real
  // sign-in — the one failure this feature must never produce.
  it("honours the Settings switch over every configured path", () => {
    for (const id of ["robinhood", "schwab", "morgan-stanley"]) {
      expect(linkRoute(id, { providers: ALL, demoOnly: true })).toBe("demo");
    }
  });

  // A demo book is not a partial link, so it must not consume the first press
  // and push the real key to second place.
  it("is not satisfied by a demo book", () => {
    const demoRH = { institutionId: "robinhood", demo: true, provider: "robinhood-crypto" };
    expect(linkRoute("robinhood", { providers: ALL, connections: [demoRH] })).toBe("robinhood-crypto");
  });
});
