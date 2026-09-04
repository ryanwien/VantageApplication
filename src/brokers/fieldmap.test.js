import { describe, it, expect } from "vitest";
import { pluck, num, missingMapKeys, mapIsComplete, mapAccounts, mapTrades } from "./fieldmap.js";
import {
  msReadiness, msCredentialsPresent, msSpecPresent,
  normalizeMorganStanleyAccounts, MS_HOLDINGS_MAP, MS_TRADES_MAP,
} from "./morgan-stanley.js";

describe("pluck", () => {
  const o = { a: { b: { c: 42 } }, z: null, zero: 0, empty: "" };
  it("walks a dot path", () => expect(pluck(o, "a.b.c")).toBe(42));
  it("returns undefined for a broken link instead of throwing", () => {
    expect(pluck(o, "a.nope.c")).toBeUndefined();
    expect(pluck(o, "z.b")).toBeUndefined();
    expect(pluck(null, "a")).toBeUndefined();
    expect(pluck(o, "")).toBeUndefined();
  });
  it("preserves falsy values that are real", () => {
    expect(pluck(o, "zero")).toBe(0);
    expect(pluck(o, "empty")).toBe("");
  });
});

describe("num", () => {
  it("never yields NaN — the value that survives every guard", () => {
    for (const v of ["abc", {}, [1, 2], undefined, null, "", NaN]) expect(num(v)).toBeNull();
  });
  it("accepts numeric strings, which is how most APIs send money", () => {
    expect(num("150.25")).toBe(150.25);
    expect(num(0)).toBe(0);
    expect(num("0")).toBe(0);
  });
});

describe("an incomplete map refuses rather than producing undefined rows", () => {
  it("names exactly what is missing", () => {
    expect(missingMapKeys({})).toEqual(["accounts", "positions", "symbol", "shares"]);
    expect(missingMapKeys({ accounts: "a", positions: "p" })).toEqual(["symbol", "shares"]);
    expect(mapIsComplete({ accounts: "a", positions: "p", symbol: "s", shares: "q" })).toBe(true);
  });

  it("throws with the missing keys in the message", () => {
    expect(() => mapAccounts({}, { accounts: "a" })).toThrow(/missing: positions, symbol, shares/);
  });

  it("is the state Morgan Stanley is in — deliberately", () => {
    expect(MS_HOLDINGS_MAP).toEqual({});
    expect(MS_TRADES_MAP).toEqual({});
    expect(() => normalizeMorganStanleyAccounts({})).toThrow(/deliberately not guessed/);
  });
});

describe("mapAccounts", () => {
  // A shape invented for the TEST — not a claim about any real provider.
  const map = {
    accounts: "data.accounts", accountId: "id", accountName: "nickname",
    accountMask: "masked", accountCash: "balances.cash",
    positions: "holdings", symbol: "instrument.ticker", shares: "qty",
    cost: "avgCost", price: "mark",
  };
  const payload = {
    data: {
      accounts: [{
        id: "A1", nickname: "Advisory", masked: "1174", balances: { cash: "5000.50" },
        holdings: [
          { instrument: { ticker: "jpm" }, qty: "100", avgCost: "198.55", mark: "231.50" },
          { instrument: { ticker: "" }, qty: "5", avgCost: "1" },
          { instrument: { ticker: "BAC" }, qty: "0", avgCost: "1" },
        ],
      }],
    },
  };

  it("maps a nested payload into the shape every other provider produces", () => {
    const conn = mapAccounts(payload, map, { connectionId: "c1", institutionId: "x", institutionName: "X", provider: "x" });
    expect(conn.accounts).toHaveLength(1);
    const a = conn.accounts[0];
    expect(a.id).toBe("A1");
    expect(a.name).toBe("Advisory");
    expect(a.mask).toBe("1174");
    expect(a.cash).toBe(5000.5);
    expect(a.holdings).toEqual([{ sym: "JPM", shares: 100, cost: 198.55, price: 231.5 }]);
    expect(a.activity).toEqual([]);
    expect(conn.demo).toBe(false);
  });

  it("divides a TOTAL cost basis only when the map says it is one", () => {
    const perShare = mapAccounts(payload, map, {}).accounts[0].holdings[0].cost;
    const total = mapAccounts(payload, { ...map, costIsTotal: true }, {}).accounts[0].holdings[0].cost;
    expect(perShare).toBe(198.55);
    expect(total).toBeCloseTo(1.9855, 6);
  });

  it("drops unnamed and zero-share positions", () => {
    expect(mapAccounts(payload, map, {}).accounts[0].holdings).toHaveLength(1);
  });

  it("survives a missing or single-object accounts node", () => {
    expect(mapAccounts({}, map, {}).accounts).toEqual([]);
    const single = mapAccounts({ data: { accounts: { id: "S", holdings: [] } } }, map, {});
    expect(single.accounts).toHaveLength(1);
  });

  it("falls back to an index-based id rather than an undefined key", () => {
    const conn = mapAccounts({ data: { accounts: [{ holdings: [] }] } }, map, { provider: "ms" });
    expect(conn.accounts[0].id).toBe("ms-0");
  });
});

describe("mapTrades", () => {
  const base = { trades: "items", id: "ref", at: "tradeDate", symbol: "sym", shares: "qty", side: "action", price: "px" };
  const payload = {
    items: [
      { ref: "t1", tradeDate: "2026-08-01T00:00:00Z", sym: "AAPL", qty: "10", action: "BUY", px: "200" },
      { ref: "t2", tradeDate: "2026-08-20T00:00:00Z", sym: "AAPL", qty: "4", action: "SELL", px: "220" },
    ],
  };

  it("reads the side from the provider's own vocabulary, newest first", () => {
    const rows = mapTrades(payload, base, { connectionId: "c" });
    expect(rows.map((r) => r.id)).toEqual(["t2", "t1"]);
    expect(rows.map((r) => r.side)).toEqual(["sell", "buy"]);
  });

  it("accepts a custom buy vocabulary, because every provider spells it differently", () => {
    const odd = { items: [{ ref: "x", sym: "A", qty: "1", action: "ACQUIRE" }] };
    expect(mapTrades(odd, { ...base, buyValues: ["ACQUIRE"] }, {})[0].side).toBe("buy");
  });

  it("SKIPS a side it does not recognise rather than guessing at it", () => {
    // The alternative — defaulting the unknown to "sell" — draws a purchase as
    // a disposal, in the brokerage's own colours, with nothing to show for it.
    // A missing row is visibly missing; a mislabelled one is confidently wrong.
    const odd = { items: [{ ref: "x", sym: "A", qty: "1", action: "REORGANIZATION" }] };
    expect(mapTrades(odd, base, {})).toEqual([]);
  });

  it("still recognises the common spellings on both sides without configuration", () => {
    const rows = mapTrades({ items: [
      { ref: "1", sym: "A", qty: "1", action: "Bought" },
      { ref: "2", sym: "A", qty: "1", action: "SOLD" },
    ] }, base, {});
    expect(rows.map((r) => r.side).sort()).toEqual(["buy", "sell"]);
  });

  it("can take direction from a signed quantity instead", () => {
    const signed = { items: [{ ref: "s", sym: "A", qty: "-3", px: "10" }] };
    const row = mapTrades(signed, { ...base, sharesSigned: true }, {})[0];
    expect(row.side).toBe("sell");
    expect(row.shares).toBe(3);
    expect(row.amount).toBe(30);
  });

  it("emits the same row shape the panel already draws", () => {
    const r = mapTrades(payload, base, { connectionId: "c", institutionId: "morgan-stanley", institutionName: "Morgan Stanley", accountName: "Advisory" })[0];
    expect(Object.keys(r).sort()).toEqual(
      ["account", "accountId", "amount", "at", "broker", "brokerName", "demo", "id", "price", "shares", "side", "sym"].sort(),
    );
    expect(r.brokerName).toBe("Morgan Stanley");
    expect(r.demo).toBe(false);
  });
});

describe("Morgan Stanley readiness", () => {
  const NO_CREDS = {};
  const CREDS = { MORGAN_STANLEY_CLIENT_ID: "id", MORGAN_STANLEY_CLIENT_CERT: "cert", MORGAN_STANLEY_CLIENT_KEY: "key" };

  it("distinguishes missing credentials from a missing spec", () => {
    expect(msReadiness(NO_CREDS).stage).toBe("credentials");
    expect(msReadiness(CREDS).stage).toBe("spec");
  });

  it("points at the invitation process rather than at a signup page", () => {
    expect(msReadiness(NO_CREDS).message).toMatch(/invitation/i);
    expect(msReadiness(NO_CREDS).message).toMatch(/representative|API@morganstanley\.com/);
  });

  it("lists what the spec still owes once credentials exist", () => {
    const m = msReadiness(CREDS).message;
    expect(m).toMatch(/API base URL/);
    expect(m).toMatch(/holdings endpoint/);
    expect(m).toMatch(/field map: accounts/);
  });

  it("is not ready, and says so honestly", () => {
    expect(msCredentialsPresent(NO_CREDS)).toBe(false);
    expect(msSpecPresent()).toBe(false);
    expect(msReadiness(CREDS).ready).toBe(false);
  });
});
