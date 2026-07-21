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
    expect(detectCatalogIntent("chart AMD and explain the move")).toBe(null);
    expect(detectCatalogIntent("who owns AMD")).toBe(null);
    expect(detectCatalogIntent("show me a column chart of AMD")).toBe(null);
    expect(detectCatalogIntent("AMD is playing table stakes in the chip market")).toBe(null);
    expect(detectCatalogIntent("what's the schema of this trade going to look like")).toBe(null);
  });

  it("does not veto legitimate catalog assets that share names with market vocabulary", () => {
    // Regression: a financial company's data catalog legitimately has a `trades` table.
    // A blocklist of market words is the wrong approach — these must be claimed on
    // positive evidence (the "the <name> table/dataset" construction, or an
    // identifier-shaped name paired with catalog vocabulary).
    expect(detectCatalogIntent("who owns the trades table?"))
      .toEqual({ kind: "owner", term: "trades" });
    expect(detectCatalogIntent("what columns are in the portfolio_positions table?").kind)
      .toBe("schema");
    expect(detectCatalogIntent("show me the schema of the market_data table").kind)
      .toBe("schema");
    expect(detectCatalogIntent("what feeds fct_users_created?").kind)
      .toBe("lineage");
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

import { GRAPHQL_OPS, isKnownOp } from "./catalog.js";

describe("GRAPHQL_OPS", () => {
  it("exposes exactly the three read-only ops", () => {
    expect(Object.keys(GRAPHQL_OPS).sort()).toEqual(["entity", "lineage", "search"]);
  });

  it("contains no mutations", () => {
    for (const op of Object.values(GRAPHQL_OPS)) {
      expect(op.query).not.toMatch(/\bmutation\b/i);
      expect(op.query).toMatch(/^\s*query\b/i);
    }
  });

  it("builds search variables from a term", () => {
    expect(GRAPHQL_OPS.search.variables({ term: "customers" })).toEqual({ q: "customers" });
    expect(GRAPHQL_OPS.search.variables(null)).toEqual({ q: "" });
  });

  it("builds entity variables from a urn", () => {
    expect(GRAPHQL_OPS.entity.variables({ urn: "urn:li:dataset:(x,y,PROD)" }))
      .toEqual({ urn: "urn:li:dataset:(x,y,PROD)" });
  });

  it("builds lineage variables and defaults direction to UPSTREAM", () => {
    expect(GRAPHQL_OPS.lineage.variables({ urn: "u", direction: "DOWNSTREAM" }))
      .toEqual({ urn: "u", direction: "DOWNSTREAM" });
    expect(GRAPHQL_OPS.lineage.variables({ urn: "u" }))
      .toEqual({ urn: "u", direction: "UPSTREAM" });
    expect(GRAPHQL_OPS.lineage.variables({ urn: "u", direction: "SIDEWAYS" }))
      .toEqual({ urn: "u", direction: "UPSTREAM" });
  });

  it("isKnownOp gates unknown names", () => {
    expect(isKnownOp("search")).toBe(true);
    expect(isKnownOp("deleteEverything")).toBe(false);
    expect(isKnownOp(null)).toBe(false);
  });

  it("isKnownOp rejects inherited properties and non-strings without throwing", () => {
    const hostiles = [
      "toString",
      "constructor",
      "__proto__",
      "hasOwnProperty",
      "valueOf",
      null,
      undefined,
      42,
      {},
      [],
      Symbol("s"),
    ];
    for (const h of hostiles) {
      expect(() => isKnownOp(h)).not.toThrow();
      expect(isKnownOp(h)).toBe(false);
    }
  });

  it("variables builders never throw and always return a well-formed object", () => {
    const hostileToString = { toString() { throw new Error("boom"); } };
    const inputs = [
      null,
      undefined,
      {},
      [],
      "a string",
      42,
      hostileToString,
      Symbol("s"),
    ];

    for (const input of inputs) {
      expect(() => GRAPHQL_OPS.search.variables(input)).not.toThrow();
      const searchVars = GRAPHQL_OPS.search.variables(input);
      expect(typeof searchVars.q).toBe("string");

      expect(() => GRAPHQL_OPS.entity.variables(input)).not.toThrow();
      const entityVars = GRAPHQL_OPS.entity.variables(input);
      expect(typeof entityVars.urn).toBe("string");

      expect(() => GRAPHQL_OPS.lineage.variables(input)).not.toThrow();
      const lineageVars = GRAPHQL_OPS.lineage.variables(input);
      expect(typeof lineageVars.urn).toBe("string");
      expect(["UPSTREAM", "DOWNSTREAM"]).toContain(lineageVars.direction);
    }
  });

  it("variables builders treat a hostile term/urn field value as empty rather than throwing", () => {
    const hostileToString = { toString() { throw new Error("boom"); } };
    const hostileValueOf = { valueOf() { throw new Error("boom"); } };
    const symbolValue = Symbol("s");

    expect(() => GRAPHQL_OPS.search.variables({ term: hostileToString })).not.toThrow();
    expect(GRAPHQL_OPS.search.variables({ term: hostileToString })).toEqual({ q: "" });
    expect(GRAPHQL_OPS.search.variables({ term: symbolValue })).toEqual({ q: "" });

    expect(() => GRAPHQL_OPS.entity.variables({ urn: hostileToString })).not.toThrow();
    expect(GRAPHQL_OPS.entity.variables({ urn: hostileToString })).toEqual({ urn: "" });
    expect(GRAPHQL_OPS.entity.variables({ urn: symbolValue })).toEqual({ urn: "" });

    expect(() => GRAPHQL_OPS.lineage.variables({ urn: hostileValueOf })).not.toThrow();
    expect(GRAPHQL_OPS.lineage.variables({ urn: hostileValueOf }))
      .toEqual({ urn: "", direction: "UPSTREAM" });
    expect(GRAPHQL_OPS.lineage.variables({ urn: symbolValue }))
      .toEqual({ urn: "", direction: "UPSTREAM" });
  });
});

import { firstSearchHit, summarizeEntity, summarizeLineage, contextForLLM } from "./catalog.js";

const SEARCH = { data: { searchAcrossEntities: { searchResults: [
  { entity: { urn: "urn:li:dataset:(a,fct_users,PROD)", name: "fct_users", platform: { name: "hive" } } },
] } } };

const ENTITY = { data: { dataset: {
  urn: "urn:li:dataset:(a,fct_users,PROD)",
  name: "fct_users",
  platform: { name: "hive" },
  properties: { description: "User fact table" },
  ownership: { owners: [{ owner: { username: "jdoe" } }, { owner: { name: "data-eng" } }] },
  schemaMetadata: { fields: [
    { fieldPath: "id", type: "NUMBER", nativeDataType: "bigint", description: "pk" },
    { fieldPath: "email", type: "STRING", nativeDataType: "varchar", description: null },
  ] },
} } };

describe("normalization", () => {
  it("pulls the first search hit", () => {
    expect(firstSearchHit(SEARCH)).toEqual({
      urn: "urn:li:dataset:(a,fct_users,PROD)", name: "fct_users", platform: "hive",
    });
  });

  it("returns null when there are no hits", () => {
    expect(firstSearchHit({ data: { searchAcrossEntities: { searchResults: [] } } })).toBe(null);
    expect(firstSearchHit(null)).toBe(null);
    expect(firstSearchHit({})).toBe(null);
  });

  it("summarizes an entity", () => {
    const s = summarizeEntity(ENTITY);
    expect(s.name).toBe("fct_users");
    expect(s.platform).toBe("hive");
    expect(s.description).toBe("User fact table");
    expect(s.owners).toEqual(["jdoe", "data-eng"]);
    expect(s.fields).toEqual([
      { path: "id", type: "bigint", description: "pk" },
      { path: "email", type: "varchar", description: "" },
    ]);
  });

  it("never throws on malformed input", () => {
    for (const bad of [null, undefined, {}, [], { data: null }, { data: { dataset: null } }]) {
      const s = summarizeEntity(bad);
      expect(s.owners).toEqual([]);
      expect(s.fields).toEqual([]);
      expect(summarizeLineage(bad)).toEqual([]);
    }
  });

  it("formats a context block naming the source", () => {
    const ctx = contextForLLM(summarizeEntity(ENTITY), [], "UPSTREAM");
    expect(ctx).toMatch(/DataHub/);
    expect(ctx).toMatch(/fct_users/);
    expect(ctx).toMatch(/jdoe/);
    expect(ctx).toMatch(/email/);
  });
});
