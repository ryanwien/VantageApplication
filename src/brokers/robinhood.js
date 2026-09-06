// ============================================================
//  Robinhood — Crypto Trading API, read side.
//
//  WHAT THIS IS, AND WHAT IT IS NOT
//  This is Robinhood's ONLY self-serve, first-party, unambiguously-sanctioned
//  API: keys are minted by the account holder in web classic (crypto account
//  settings → Add key), and it is documented publicly. It covers CRYPTO ONLY.
//
//  It does not reach equities. Robinhood publishes no equities API for third
//  parties, so a stock position at Robinhood still arrives through an
//  aggregator. Nothing here changes that, and this file should never be
//  described as "Robinhood support" without the word crypto next to it.
//
//  AUTH — every value below was read out of Robinhood's own documentation
//  bundle rather than inferred:
//    • base                https://trading.robinhood.com
//    • message to sign     `{api_key}{timestamp}{path}{method}{body}`
//                          a bare concatenation — no separators, no newlines
//    • timestamp           integer UTC epoch SECONDS (not milliseconds)
//    • signature           base64 of an Ed25519 signature over that message
//    • headers             x-api-key, x-timestamp, x-signature
//
//  The signature message is the single most breakable thing here — every part
//  of it is a string with no delimiter, so an off-by-one in the path or a
//  millisecond timestamp produces a 401 that looks identical to a bad key. It
//  is therefore built by one pure function with tests on it, and the signing
//  itself is the only part that touches a private key.
//
//  ⚠ THE HOLDINGS ENDPOINT RETURNS NO COST BASIS.
//  Its result rows carry account_number, asset_code, total_quantity and
//  quantity_available_for_trading. There is no purchase price anywhere in it.
//  So cost is reported as NULL, never as zero — a zero cost basis would render
//  every crypto position as up infinitely, which is precisely the arithmetic
//  bug this app has already been bitten by once. Downstream, a null cost means
//  "value known, P&L unknown", and the panel draws it that way.
// ============================================================

export const RH_BASE = "https://trading.robinhood.com";
export const RH_HOLDINGS_PATH = "/api/v1/crypto/trading/holdings/";
export const RH_ACCOUNTS_PATH = "/api/v1/crypto/trading/accounts/";
export const RH_BEST_BID_ASK_PATH = "/api/v1/crypto/marketdata/best_bid_ask/";

// Epoch SECONDS. Robinhood's own helper is
// `int(datetime.now(tz=utc).timestamp())`, and passing milliseconds here is a
// silent 401 — the signature is computed over the same wrong value, so the
// request is internally consistent and still rejected.
export const rhTimestamp = (now = Date.now()) => Math.floor(now / 1000);

// `{api_key}{timestamp}{path}{method}{body}`, concatenated with nothing
// between the parts.
//
// `path` must be EXACTLY the path that is requested, query string included —
// signing "/holdings/" and then fetching "/holdings/?limit=50" is a mismatch,
// and the failure mode is a 401 rather than anything that names the cause.
// Method is upper-case; an absent body is the empty string, not "null".
export function rhSignatureMessage(apiKey, timestamp, path, method, body = "") {
  return `${apiKey}${timestamp}${path}${String(method).toUpperCase()}${body || ""}`;
}

// The three headers, given a signer. The signer is injected rather than
// imported so this module stays pure and testable: the server passes one built
// on node:crypto, and a test passes a stub.
export function rhHeaders({ apiKey, timestamp, path, method, body = "", sign }) {
  const message = rhSignatureMessage(apiKey, timestamp, path, method, body);
  return {
    "x-api-key": apiKey,
    "x-timestamp": String(timestamp),
    "x-signature": sign(message),
    "Content-Type": "application/json",
  };
}

// A crypto asset_code is not a stock ticker, and letting "BTC" flow into the
// app's symbol machinery would have it look for a chart, a company name and an
// earnings date that do not exist. Suffixed so the two namespaces cannot
// collide — most importantly for names that exist in both, where an
// unsuffixed code would silently adopt the equity's price.
export const rhSymbol = (assetCode) => `${String(assetCode || "").toUpperCase().trim()}-CRYPTO`;
export const isCryptoSymbol = (sym) => /-CRYPTO$/.test(String(sym || ""));
export const cryptoAssetCode = (sym) => String(sym || "").replace(/-CRYPTO$/, "");

// /api/v1/crypto/trading/holdings/ → our account shape.
//
// `priceOf` takes an asset code (BTC, not BTC-CRYPTO) and returns a mark, or
// null. Supplied by the caller because pricing comes from a different endpoint
// (best_bid_ask) and should not be this function's business.
export function normalizeRobinhoodHoldings(payload, { connectionId, accountNumber, priceOf = () => null } = {}) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const holdings = [];

  for (const row of results) {
    const code = String(row?.asset_code || "").toUpperCase().trim();
    const qty = Number(row?.total_quantity);
    if (!code || !Number.isFinite(qty) || qty === 0) continue;
    const price = priceOf(code);
    holdings.push({
      sym: rhSymbol(code),
      shares: qty,
      // NULL, not 0. See the header: this endpoint has no cost basis, and a
      // zero would read as a total gain rather than as an unknown.
      cost: null,
      price: Number.isFinite(price) ? price : null,
      assetCode: code,
    });
  }

  return {
    id: connectionId || "robinhood-crypto",
    institutionId: "robinhood",
    institutionName: "Robinhood",
    provider: "robinhood-crypto",
    demo: false,
    connectedAt: Date.now(),
    accounts: [{
      id: String(accountNumber || results[0]?.account_number || "robinhood-crypto"),
      name: "Crypto",
      kind: "Crypto",
      mask: accountNumber ? String(accountNumber).slice(-4) : null,
      cash: 0,
      holdings,
      activity: [],
    }],
  };
}

// best_bid_ask returns a quote per trading pair; the mid is the honest single
// number to mark a holding at. Shaped defensively because this endpoint is
// documented less thoroughly than the trading ones.
export function normalizeRobinhoodQuotes(payload) {
  const out = new Map();
  for (const r of payload?.results || []) {
    const code = String(r?.symbol || "").split("-")[0].toUpperCase();
    const bid = Number(r?.bid_inclusive_of_sell_spread ?? r?.price ?? r?.bid);
    const ask = Number(r?.ask_inclusive_of_buy_spread ?? r?.price ?? r?.ask);
    const mid = Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2
      : Number.isFinite(bid) ? bid
      : Number.isFinite(ask) ? ask
      : null;
    if (code && mid !== null) out.set(code, mid);
  }
  return out;
}

// The holdings endpoint paginates with a `next` URL. Returns the PATH to sign
// and request next, or null — the absolute URL cannot be signed as-is, because
// the signature covers a path.
export function rhNextPath(payload) {
  const next = payload?.next;
  if (!next) return null;
  try {
    const u = new URL(next, RH_BASE);
    return `${u.pathname}${u.search}`;
  } catch {
    return typeof next === "string" && next.startsWith("/") ? next : null;
  }
}
