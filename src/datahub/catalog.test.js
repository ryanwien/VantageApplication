import { describe, it, expect } from "vitest";
import { detectCatalogIntent } from "./catalog.js";

describe("detectCatalogIntent", () => {
  it("returns null for non-catalog text", () => {
    expect(detectCatalogIntent("chart AMD and explain the move")).toBe(null);
    expect(detectCatalogIntent("who owns AMD")).toBe(null);
    expect(detectCatalogIntent("")).toBe(null);
    expect(detectCatalogIntent(null)).toBe(null);
  });

  it("detects lineage questions", () => {
    expect(detectCatalogIntent("what feeds the fct_users_created table?"))
      .toEqual({ kind: "lineage", term: "fct_users_created" });
    expect(detectCatalogIntent("show upstream lineage for fct_users_created"))
      .toEqual({ kind: "lineage", term: "fct_users_created" });
  });

  it("detects schema questions", () => {
    expect(detectCatalogIntent("what columns are in the fct_users_created dataset?"))
      .toEqual({ kind: "schema", term: "fct_users_created" });
  });

  it("detects owner questions", () => {
    expect(detectCatalogIntent("who owns the fct_users_created table?"))
      .toEqual({ kind: "owner", term: "fct_users_created" });
  });

  it("falls back to search when only a catalog noun is present", () => {
    expect(detectCatalogIntent("find the customers dataset"))
      .toEqual({ kind: "search", term: "customers" });
  });

  it("prefers a quoted term", () => {
    expect(detectCatalogIntent('what is the schema of "Long Tail Companions"'))
      .toEqual({ kind: "schema", term: "Long Tail Companions" });
  });

  it("does not hijack market-dashboard questions that merely use ambiguous words", () => {
    expect(detectCatalogIntent("show me a column chart of AMD")).toBe(null);
    expect(detectCatalogIntent("AMD is playing table stakes in the chip market")).toBe(null);
    expect(detectCatalogIntent("what's the schema of this trade going to look like")).toBe(null);
  });

  it("is total: never throws, even on a caller-supplied toString that throws", () => {
    const hostile = {
      toString() {
        throw new Error("boom");
      },
    };
    expect(() => detectCatalogIntent(hostile)).not.toThrow();
    expect(detectCatalogIntent(hostile)).toBe(null);
  });

  it("rejects other non-string input without throwing", () => {
    expect(detectCatalogIntent(undefined)).toBe(null);
    expect(detectCatalogIntent(42)).toBe(null);
    expect(detectCatalogIntent(["table"])).toBe(null);
    expect(detectCatalogIntent({})).toBe(null);
  });

  it("does not treat an apostrophe as a quote delimiter", () => {
    // Two possessive apostrophes used to be misread as a pair of quote marks,
    // producing a bogus quoted term ("s dataset") out of the text between them.
    const result = detectCatalogIntent("the customer's dataset's schema and lineage");
    expect(result).not.toBe(null);
    expect(result.term).not.toBe("s dataset");
    expect(result.term).not.toMatch(/'/);
  });
});
