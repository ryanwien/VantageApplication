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
});
