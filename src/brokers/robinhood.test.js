import { describe, it, expect } from "vitest";
import {
  rhTimestamp, rhSignatureMessage, rhHeaders, rhSymbol, isCryptoSymbol, cryptoAssetCode,
  normalizeRobinhoodHoldings, normalizeRobinhoodQuotes, rhNextPath, RH_BASE,
} from "./robinhood.js";

// The signature is the whole integration. Every part of the message is a
// string with no delimiter between it and the next, so any mistake produces a
// 401 that looks exactly like a bad key — which is the hardest kind of bug to
// find from the outside. These pin the format Robinhood documents.
describe("rhSignatureMessage", () => {
  it("concatenates api_key, timestamp, path, method, body with NOTHING between", () => {
    expect(rhSignatureMessage("KEY", 1700000000, "/api/v1/crypto/trading/holdings/", "GET"))
      .toBe("KEY1700000000/api/v1/crypto/trading/holdings/GET");
  });

  it("upper-cases the method", () => {
    expect(rhSignatureMessage("K", 1, "/p", "get")).toBe("K1/pGET");
  });

  it("treats an absent body as empty string, never the word null or undefined", () => {
    expect(rhSignatureMessage("K", 1, "/p", "GET")).toBe("K1/pGET");
    expect(rhSignatureMessage("K", 1, "/p", "GET", undefined)).toBe("K1/pGET");
    expect(rhSignatureMessage("K", 1, "/p", "GET", null)).toBe("K1/pGET");
    expect(rhSignatureMessage("K", 1, "/p", "GET", "")).toBe("K1/pGET");
  });

  it("includes a body verbatim when there is one", () => {
    expect(rhSignatureMessage("K", 1, "/p", "POST", '{"a":1}')).toBe('K1/pPOST{"a":1}');
  });

  it("signs the query string as part of the path — the mismatch that 401s silently", () => {
    const withQuery = rhSignatureMessage("K", 1, "/p/?limit=50", "GET");
    expect(withQuery).toBe("K1/p/?limit=50GET");
    expect(withQuery).not.toBe(rhSignatureMessage("K", 1, "/p/", "GET"));
  });
});

describe("rhTimestamp", () => {
  it("is epoch SECONDS — milliseconds is a silent 401", () => {
    expect(rhTimestamp(1_700_000_000_123)).toBe(1_700_000_000);
    expect(String(rhTimestamp(Date.now())).length).toBe(10);
  });
});

describe("rhHeaders", () => {
  it("emits the three documented headers and signs the right message", () => {
    const seen = [];
    const h = rhHeaders({ apiKey: "KEY", timestamp: 42, path: "/p", method: "GET", sign: (m) => { seen.push(m); return "SIG"; } });
    expect(seen).toEqual(["KEY42/pGET"]);
    expect(h["x-api-key"]).toBe("KEY");
    expect(h["x-timestamp"]).toBe("42");
    expect(h["x-signature"]).toBe("SIG");
  });

  it("sends the timestamp as a string, because a header is a string", () => {
    const h = rhHeaders({ apiKey: "K", timestamp: 42, path: "/p", method: "GET", sign: () => "S" });
    expect(typeof h["x-timestamp"]).toBe("string");
  });
});

describe("the crypto symbol namespace", () => {
  it("suffixes an asset code so it cannot collide with an equity ticker", () => {
    expect(rhSymbol("btc")).toBe("BTC-CRYPTO");
    expect(isCryptoSymbol("BTC-CRYPTO")).toBe(true);
    expect(isCryptoSymbol("AAPL")).toBe(false);
    expect(cryptoAssetCode("BTC-CRYPTO")).toBe("BTC");
  });

  it("keeps a name that exists in both namespaces apart", () => {
    // There are real tickers that collide with asset codes; an unsuffixed code
    // would quietly adopt the equity's price and chart.
    expect(rhSymbol("ETH")).not.toBe("ETH");
    expect(isCryptoSymbol(rhSymbol("ETH"))).toBe(true);
  });
});

describe("normalizeRobinhoodHoldings", () => {
  const payload = {
    results: [
      { account_number: "RH123456", asset_code: "BTC", total_quantity: "0.51234", quantity_available_for_trading: "0.51234" },
      { account_number: "RH123456", asset_code: "ETH", total_quantity: "4.2", quantity_available_for_trading: "4.2" },
      { account_number: "RH123456", asset_code: "DOGE", total_quantity: "0", quantity_available_for_trading: "0" },
      { account_number: "RH123456", asset_code: "", total_quantity: "5" },
    ],
    next: null,
  };

  it("reads the documented result fields", () => {
    const conn = normalizeRobinhoodHoldings(payload, { connectionId: "c1" });
    expect(conn.provider).toBe("robinhood-crypto");
    expect(conn.institutionId).toBe("robinhood");
    expect(conn.accounts).toHaveLength(1);
    expect(conn.accounts[0].holdings.map((h) => h.sym)).toEqual(["BTC-CRYPTO", "ETH-CRYPTO"]);
    expect(conn.accounts[0].holdings[0].shares).toBeCloseTo(0.51234, 8);
  });

  it("reports cost as NULL, never zero — this endpoint has no cost basis", () => {
    const holdings = normalizeRobinhoodHoldings(payload, {}).accounts[0].holdings;
    expect(holdings.every((h) => h.cost === null)).toBe(true);
    // The bug this prevents: a zero basis renders as an infinite gain.
    expect(holdings.some((h) => h.cost === 0)).toBe(false);
  });

  it("drops zero-quantity and unnamed rows", () => {
    expect(normalizeRobinhoodHoldings(payload, {}).accounts[0].holdings).toHaveLength(2);
  });

  it("marks holdings from the supplied pricer, and tolerates it knowing nothing", () => {
    const priced = normalizeRobinhoodHoldings(payload, { priceOf: (c) => (c === "BTC" ? 64000 : null) });
    const [btc, eth] = priced.accounts[0].holdings;
    expect(btc.price).toBe(64000);
    expect(eth.price).toBeNull();
  });

  it("masks the account number and never exposes the whole thing", () => {
    const conn = normalizeRobinhoodHoldings(payload, { accountNumber: "RH123456" });
    expect(conn.accounts[0].mask).toBe("3456");
  });

  it("is never demo, and survives an empty payload", () => {
    expect(normalizeRobinhoodHoldings(payload, {}).demo).toBe(false);
    expect(normalizeRobinhoodHoldings({}, {}).accounts[0].holdings).toEqual([]);
    expect(normalizeRobinhoodHoldings(undefined, {}).accounts[0].holdings).toEqual([]);
  });
});

describe("normalizeRobinhoodQuotes", () => {
  it("marks at the mid of bid and ask", () => {
    const m = normalizeRobinhoodQuotes({ results: [
      { symbol: "BTC-USD", bid_inclusive_of_sell_spread: "63900", ask_inclusive_of_buy_spread: "64100" },
    ] });
    expect(m.get("BTC")).toBe(64000);
  });

  it("falls back to whichever side exists rather than dropping the quote", () => {
    const m = normalizeRobinhoodQuotes({ results: [{ symbol: "ETH-USD", price: "3000" }] });
    expect(m.get("ETH")).toBe(3000);
  });

  it("skips a row it cannot price at all", () => {
    const m = normalizeRobinhoodQuotes({ results: [{ symbol: "XYZ-USD" }] });
    expect(m.has("XYZ")).toBe(false);
  });

  it("survives an empty payload", () => {
    expect(normalizeRobinhoodQuotes({}).size).toBe(0);
    expect(normalizeRobinhoodQuotes(undefined).size).toBe(0);
  });
});

describe("rhNextPath", () => {
  it("reduces an absolute next URL to a signable path with its query", () => {
    expect(rhNextPath({ next: `${RH_BASE}/api/v1/crypto/trading/holdings/?cursor=abc` }))
      .toBe("/api/v1/crypto/trading/holdings/?cursor=abc");
  });

  it("passes a relative next through", () => {
    expect(rhNextPath({ next: "/api/v1/crypto/trading/holdings/?cursor=x" }))
      .toBe("/api/v1/crypto/trading/holdings/?cursor=x");
  });

  it("returns null when the page is the last one", () => {
    expect(rhNextPath({ next: null })).toBeNull();
    expect(rhNextPath({})).toBeNull();
    expect(rhNextPath(undefined)).toBeNull();
  });
});
