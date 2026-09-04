import { describe, it, expect } from "vitest";
import {
  schwabAccountHashes,
  normalizeSchwabAccounts,
  normalizeSchwabTransactions,
  tokenExpiresAt,
  tokenIsStale,
  refreshWindowClosed,
  schwabDate,
  SCHWAB_REFRESH_TTL_MS,
} from "./schwab.js";

describe("account hashes", () => {
  it("maps account number → hash", () => {
    const m = schwabAccountHashes([
      { accountNumber: "12345678", hashValue: "ABC" },
      { accountNumber: "87654321", hashValue: "DEF" },
    ]);
    expect(m.get("12345678")).toBe("ABC");
    expect(m.size).toBe(2);
  });

  it("skips rows missing either half, and survives junk", () => {
    expect(schwabAccountHashes([{ accountNumber: "1" }, { hashValue: "X" }, {}]).size).toBe(0);
    expect(schwabAccountHashes().size).toBe(0);
    expect(schwabAccountHashes(null).size).toBe(0);
    expect(schwabAccountHashes({ nope: true }).size).toBe(0);
  });
});

describe("normalizeSchwabAccounts", () => {
  // The documented Trader API shape: an array of securitiesAccount wrappers.
  const payload = [
    {
      securitiesAccount: {
        accountNumber: "12345678",
        hashValue: "HASH1",
        type: "MARGIN",
        currentBalances: { cashBalance: 2500.75, cashAvailableForTrading: 2000 },
        positions: [
          { instrument: { symbol: "AAPL", assetType: "EQUITY" }, longQuantity: 100, shortQuantity: 0, averagePrice: 150.25, marketValue: 22000 },
          { instrument: { symbol: "TSLA", assetType: "EQUITY" }, longQuantity: 0, shortQuantity: 20, averagePrice: 260.5, marketValue: -5000 },
          { instrument: { symbol: "", assetType: "EQUITY" }, longQuantity: 5, shortQuantity: 0, averagePrice: 1 },
          { instrument: { symbol: "FLAT", assetType: "EQUITY" }, longQuantity: 10, shortQuantity: 10, averagePrice: 3 },
        ],
      },
    },
  ];

  it("unwraps securitiesAccount and reads positions", () => {
    const conn = normalizeSchwabAccounts(payload, { connectionId: "c1" });
    expect(conn.provider).toBe("schwab");
    expect(conn.demo).toBe(false);
    expect(conn.accounts).toHaveLength(1);
    expect(conn.accounts[0].holdings.map((h) => h.sym)).toEqual(["AAPL", "TSLA"]);
  });

  it("takes averagePrice as the PER-SHARE cost — no division, unlike Plaid", () => {
    const h = normalizeSchwabAccounts(payload, {}).accounts[0].holdings[0];
    expect(h.cost).toBe(150.25);
    expect(h.shares).toBe(100);
    expect(h.price).toBe(220); // marketValue / shares
  });

  it("keeps a short position negative rather than flipping it long", () => {
    const tsla = normalizeSchwabAccounts(payload, {}).accounts[0].holdings.find((h) => h.sym === "TSLA");
    expect(tsla.shares).toBe(-20);
  });

  it("drops an unnamed instrument and a net-flat position", () => {
    const syms = normalizeSchwabAccounts(payload, {}).accounts[0].holdings.map((h) => h.sym);
    expect(syms).not.toContain("FLAT");
    expect(syms.every(Boolean)).toBe(true);
  });

  it("takes the settled cash balance and masks the account number", () => {
    const a = normalizeSchwabAccounts(payload, {}).accounts[0];
    expect(a.cash).toBe(2500.75);
    expect(a.mask).toBe("5678");
    expect(a.kind).toBe("Margin");
  });

  it("addresses the account by hash, because the API rejects raw numbers", () => {
    expect(normalizeSchwabAccounts(payload, {}).accounts[0].id).toBe("HASH1");
  });

  it("accepts a single unwrapped account and survives an empty payload", () => {
    const bare = normalizeSchwabAccounts({ securitiesAccount: { accountNumber: "1111", type: "CASH", positions: [] } }, {});
    expect(bare.accounts).toHaveLength(1);
    expect(bare.accounts[0].kind).toBe("Cash");
    expect(normalizeSchwabAccounts([], {}).accounts).toEqual([]);
    expect(normalizeSchwabAccounts(undefined, {}).accounts).toEqual([]);
    expect(normalizeSchwabAccounts(null, {}).accounts).toEqual([]);
  });
});

describe("normalizeSchwabTransactions", () => {
  const payload = [
    {
      activityId: 1001, type: "TRADE", time: "2026-08-20T14:30:00.000Z", netAmount: -15025,
      transferItems: [
        { instrument: { symbol: "AAPL", assetType: "EQUITY" }, amount: 100, price: 150.25, positionEffect: "OPENING" },
        { instrument: { assetType: "CURRENCY" }, amount: -15025, feeType: "COMMISSION" },
      ],
    },
    {
      activityId: 1002, type: "TRADE", time: "2026-08-25T15:00:00.000Z", netAmount: 4400,
      transferItems: [
        { instrument: { symbol: "AAPL", assetType: "EQUITY" }, amount: -20, price: 220, positionEffect: "CLOSING" },
      ],
    },
    { activityId: 1003, type: "DIVIDEND_OR_INTEREST", time: "2026-08-22T00:00:00.000Z", transferItems: [{ instrument: { symbol: "AAPL" }, amount: 0 }] },
    { activityId: 1004, type: "TRADE", time: "2026-08-21T00:00:00.000Z", transferItems: [{ feeType: "SEC_FEE", instrument: { symbol: "AAPL" }, amount: -1 }] },
  ];

  it("keeps only TRADE rows, newest first", () => {
    const rows = normalizeSchwabTransactions(payload, {});
    expect(rows.map((r) => r.id)).toEqual(["1002", "1001"]);
  });

  it("reads direction from the signed quantity, not from netAmount", () => {
    const [sell, buy] = normalizeSchwabTransactions(payload, {});
    expect(sell.side).toBe("sell");
    expect(sell.shares).toBe(20);
    expect(buy.side).toBe("buy");
    expect(buy.shares).toBe(100);
  });

  it("drops the fee and currency legs riding inside a TRADE", () => {
    const rows = normalizeSchwabTransactions(payload, {});
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.sym === "AAPL")).toBe(true);
  });

  it("matches the tape row shape the panel already draws", () => {
    const r = normalizeSchwabTransactions(payload, { accountName: "Brokerage", accountId: "HASH1" })[0];
    expect(Object.keys(r).sort()).toEqual(
      ["account", "accountId", "amount", "at", "broker", "brokerName", "demo", "id", "price", "shares", "side", "sym"].sort(),
    );
    expect(r.demo).toBe(false);
    expect(r.brokerName).toBe("Charles Schwab");
    expect(r.amount).toBe(220 * 20);
  });

  it("survives an empty or malformed payload", () => {
    expect(normalizeSchwabTransactions([], {})).toEqual([]);
    expect(normalizeSchwabTransactions(undefined, {})).toEqual([]);
    expect(normalizeSchwabTransactions([{ type: "TRADE" }], {})).toEqual([]);
  });
});

describe("token lifetimes", () => {
  it("expires a minute early so a call in flight does not arrive stale", () => {
    const now = 1_000_000_000_000;
    expect(tokenExpiresAt(1800, now)).toBe(now + 1800_000 - 60_000);
  });

  it("treats a missing expiry as stale", () => {
    expect(tokenIsStale(null)).toBe(true);
    expect(tokenIsStale(undefined)).toBe(true);
    expect(tokenIsStale(Date.now() + 60_000)).toBe(false);
  });

  it("closes the refresh window after 7 days — a reconnect, not a refresh", () => {
    const now = 2_000_000_000_000;
    expect(refreshWindowClosed(now - SCHWAB_REFRESH_TTL_MS + 1000, now)).toBe(false);
    expect(refreshWindowClosed(now - SCHWAB_REFRESH_TTL_MS - 1000, now)).toBe(true);
    expect(refreshWindowClosed(null, now)).toBe(false);
  });
});

describe("schwabDate", () => {
  it("emits ISO-8601 with milliseconds and Z, which the endpoint requires", () => {
    expect(schwabDate(Date.UTC(2026, 7, 20, 14, 30, 0))).toBe("2026-08-20T14:30:00.000Z");
    expect(schwabDate(Date.UTC(2026, 0, 1))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
